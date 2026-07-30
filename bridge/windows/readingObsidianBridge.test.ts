import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ReadingCapture } from '../../src/types';
import { formatReadingCaptureMarkdown } from '../../server/reading/readingFormatter';
import { ReadingService } from '../../server/reading/readingService';
import { LocalReadingStore } from '../../server/storage/localReadingStore';
import {
  appendCaptureToExistingNote,
  BridgeLocalError,
  BridgeProtocolError,
  ReadingObsidianBridge,
  withSingleInstanceLock,
} from './readingObsidianBridge';

const captureId = `reading_${'a'.repeat(32)}`;
const capturedAt = '2026-07-28T12:01:00.000Z';

function makeCapture(overrides: Partial<ReadingCapture> = {}): ReadingCapture {
  return {
    id: captureId,
    bookId: 'book_1', bookRevision: 1, bookTitle: 'Book', bookAuthor: 'Author',
    bookTags: ['reading'], destinationNotePath: 'Literature notes/Book.md',
    originalText: 'A deterministic queued thought.', captureType: 'thought',
    capturedAt, receivedAt: capturedAt, creatorType: 'life_site', status: 'pending',
    markdownRenderVersion: 1, deliveryAttempts: { count: 0 }, updatedAt: capturedAt,
    ...overrides,
  };
}

async function createFixture(initialContent = '# Book\n') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'life-site-reading-bridge-'));
  const queueFile = path.join(directory, 'reading.json');
  const note = path.join(directory, 'Literature notes', 'Book.md');
  await fs.mkdir(path.dirname(note), { recursive: true });
  await fs.writeFile(note, initialContent, 'utf8');
  const now = () => '2026-07-28T12:01:00.000Z';
  let nextCapture = 0;
  const createCaptureId = () => (
    nextCapture++ === 0 ? captureId : `reading_${'b'.repeat(32)}`
  );
  const apiService = new ReadingService(new LocalReadingStore(queueFile), now, () => 'book_1', createCaptureId);
  const bridgeService = new ReadingService(
    new LocalReadingStore(queueFile, { reconcileDeliveryMarkers: false }),
    now,
    () => 'book_1',
    createCaptureId,
  );
  await apiService.createBook({ title: 'Book', author: 'Author', destinationNotePath: 'Literature notes/Book.md' });
  await apiService.createCapture({ bookId: 'book_1', originalText: 'A deterministic queued thought.', captureType: 'thought' });
  return { directory, note, queueFile, apiService, bridgeService, cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
}

test('worker renders a deterministic timestamped block, appends it, then confirms the queue', async () => {
  const fixture = await createFixture();
  try {
    const bridge = new ReadingObsidianBridge(fixture.bridgeService, fixture.directory, fixture.queueFile);
    assert.deepStrictEqual(await bridge.runOnce(), { outcome: 'delivered', captureId, appendOutcome: 'appended' });
    const note = await fs.readFile(fixture.note, 'utf8');
    assert.ok(note.includes(`## Reading capture — ${capturedAt}`));
    assert.ok(note.includes(`<!-- /life-site-reading-capture:${captureId} -->`));
    assert.deepStrictEqual(await bridge.runOnce(), { outcome: 'idle' });
    assert.strictEqual((await fixture.apiService.listCaptures({}))[0].status, 'done');
  } finally { await fixture.cleanup(); }
});

test('deduplication hashes LF-normalized complete blocks from only the last 100 entries', async () => {
  const capture = makeCapture();
  const block = formatReadingCaptureMarkdown(capture).replace(/\n/g, '\r\n');
  const fixture = await createFixture(`# Book\r\n\r\n${block}`);
  try {
    assert.strictEqual(await appendCaptureToExistingNote(fixture.directory, capture), 'already_present');
    assert.strictEqual(await fs.readFile(fixture.note, 'utf8'), `# Book\r\n\r\n${block}`);
  } finally { await fixture.cleanup(); }
});

test('a hash match outside the final 100 entries does not suppress a new append', async () => {
  const capture = makeCapture();
  const entries = [formatReadingCaptureMarkdown(capture)];
  for (let index = 0; index < 100; index += 1) {
    entries.push(formatReadingCaptureMarkdown(makeCapture({ id: `reading_${index.toString(16).padStart(32, '0')}` })));
  }
  const fixture = await createFixture(`# Book\n\n${entries.join('\n\n')}`);
  try {
    assert.strictEqual(await appendCaptureToExistingNote(fixture.directory, capture), 'appended');
  } finally { await fixture.cleanup(); }
});

test('locked files and sync-conflicted content remain pending and are not acknowledged', async () => {
  const locked = await createFixture();
  const conflicted = await createFixture('<<<<<<< local\n# Book\n=======\n# Book\n>>>>>>> remote\n');
  try {
    const lockedBridge = new ReadingObsidianBridge(
      locked.bridgeService,
      locked.directory,
      locked.queueFile,
      async () => { throw Object.assign(new Error('locked'), { code: 'EBUSY' }); },
    );
    assert.deepStrictEqual(await lockedBridge.runOnce(), { outcome: 'needs_attention', captureId, errorCode: 'DESTINATION_LOCKED' });
    const lockedCapture = (await locked.apiService.listCaptures({}))[0];
    assert.strictEqual(lockedCapture.status, 'pending');
    assert.strictEqual(lockedCapture.deliveryAttempts.lastErrorCode, undefined);

    const conflictBridge = new ReadingObsidianBridge(conflicted.bridgeService, conflicted.directory, conflicted.queueFile);
    assert.deepStrictEqual(await conflictBridge.runOnce(), { outcome: 'needs_attention', captureId, errorCode: 'DESTINATION_CONFLICTED' });
    assert.strictEqual((await conflicted.apiService.listCaptures({}))[0].status, 'pending');
  } finally { await Promise.all([locked.cleanup(), conflicted.cleanup()]); }
});

test('an API write and bridge delivery keep both captures and append only one entry', async () => {
  const fixture = await createFixture();
  try {
    const bridge = new ReadingObsidianBridge(fixture.bridgeService, fixture.directory, fixture.queueFile);
    const created = await Promise.all([
      bridge.runOnce(),
      fixture.apiService.createCapture({
        bookId: 'book_1',
        originalText: 'Second capture created while delivery runs.',
        captureType: 'thought',
      }),
    ]);
    assert.strictEqual(created[0].outcome, 'delivered');
    const captures = await fixture.apiService.listCaptures({});
    assert.strictEqual(captures.length, 2);
    assert.strictEqual(captures.filter((capture) => capture.status === 'done').length, 1);
    const note = await fs.readFile(fixture.note, 'utf8');
    assert.strictEqual(note.split(`<!-- life-site-reading-capture:${captureId} -->`).length - 1, 1);
  } finally { await fixture.cleanup(); }
});

test('an incomplete matching entry is never acknowledged', async () => {
  const capture = makeCapture();
  const fixture = await createFixture(`<!-- life-site-reading-capture:${captureId} -->\npartial`);
  try {
    await assert.rejects(() => appendCaptureToExistingNote(fixture.directory, capture), (error: unknown) => error instanceof BridgeLocalError && error.code === 'PARTIAL_CAPTURE_BLOCK');
  } finally { await fixture.cleanup(); }
});

test('restart after an append before marker creation does not duplicate and reconciles delivery', async () => {
  const fixture = await createFixture();
  try {
    const capture = (await fixture.bridgeService.listPendingCapturesForBridge())[0];
    assert.ok(capture);
    const markerPath = path.join(`${fixture.queueFile}.delivery-markers`, `${capture.id}.delivered`);
    assert.strictEqual(await appendCaptureToExistingNote(fixture.directory, capture), 'appended');
    await assert.rejects(() => fs.access(markerPath), { code: 'ENOENT' });

    const restartedService = new ReadingService(
      new LocalReadingStore(fixture.queueFile, { reconcileDeliveryMarkers: false }),
    );
    const restartedBridge = new ReadingObsidianBridge(
      restartedService,
      fixture.directory,
      fixture.queueFile,
    );
    assert.deepStrictEqual(await restartedBridge.runOnce(), {
      outcome: 'delivered',
      captureId: capture.id,
      appendOutcome: 'already_present',
    });
    const note = await fs.readFile(fixture.note, 'utf8');
    assert.strictEqual(note.split(`<!-- life-site-reading-capture:${capture.id} -->`).length - 1, 1);
    await fs.access(markerPath);
    assert.strictEqual((await fixture.apiService.listCaptures({}))[0].status, 'done');
  } finally { await fixture.cleanup(); }
});

test('a different block in the note is appended and not treated as already present', async () => {
  const fixture = await createFixture();
  try {
    const capture = (await fixture.bridgeService.listPendingCapturesForBridge())[0];
    assert.ok(capture);
    const queuedBlock = formatReadingCaptureMarkdown(capture);
    const differentBlock = queuedBlock.replace(
      capture.originalText,
      'A genuinely different queued thought.',
    );
    await fs.writeFile(fixture.note, `# Book\n\n${differentBlock}`, 'utf8');

    const bridge = new ReadingObsidianBridge(
      fixture.bridgeService,
      fixture.directory,
      fixture.queueFile,
    );
    assert.deepStrictEqual(await bridge.runOnce(), {
      outcome: 'delivered',
      captureId: capture.id,
      appendOutcome: 'appended',
    });
    const note = await fs.readFile(fixture.note, 'utf8');
    assert.strictEqual(note.split(`<!-- life-site-reading-capture:${capture.id} -->`).length - 1, 2);
    assert.ok(note.endsWith(queuedBlock));
  } finally { await fixture.cleanup(); }
});

test('single-instance lock prevents overlap and releases after normal completion', async () => {
  const lockIdentity = path.join(os.tmpdir(), `life-site-reading-bridge-${process.pid}-normal.lock`);
  await withSingleInstanceLock(lockIdentity, async () => {
    await assert.rejects(
      () => withSingleInstanceLock(lockIdentity, async () => undefined),
      (error: unknown) => error instanceof BridgeProtocolError && error.code === 'INVALID_CONFIGURATION',
    );
  });
  await withSingleInstanceLock(lockIdentity, async () => undefined);
});

test('single-instance lock is released by the OS after an unexpected process crash', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'life-site-reading-bridge-crash-lock-'));
  const lockIdentity = path.join(directory, 'bridge.lock');
  const moduleUrl = pathToFileURL(path.join(process.cwd(), 'bridge', 'windows', 'readingObsidianBridge.ts')).href;
  const childScript = [
    `import { withSingleInstanceLock } from ${JSON.stringify(moduleUrl)};`,
    `await withSingleInstanceLock(${JSON.stringify(lockIdentity)}, async () => {`,
    "  process.stdout.write('LOCKED\\n');",
    '  await new Promise(() => undefined);',
    '});',
  ].join('\n');
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', childScript], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const childClosed = once(child, 'close');

  try {
    await new Promise<void>((resolve, reject) => {
      let errors = '';
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for lock holder. ${errors}`)), 10_000);
      child.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString('utf8').includes('LOCKED')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.stderr.on('data', (chunk: Buffer) => { errors += chunk.toString('utf8'); });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Lock holder exited early with ${code}. ${errors}`));
      });
    });
    await assert.rejects(
      () => withSingleInstanceLock(lockIdentity, async () => undefined),
      (error: unknown) => error instanceof BridgeProtocolError && error.code === 'INVALID_CONFIGURATION',
    );
    child.kill('SIGKILL');
    await childClosed;
    await withSingleInstanceLock(lockIdentity, async () => undefined);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await childClosed.catch(() => undefined);
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('one-shot rehearsal refuses an unexpected capture before accessing the vault', async () => {
  const fixture = await createFixture();
  let appendAttempted = false;
  try {
    const bridge = new ReadingObsidianBridge(
      fixture.bridgeService,
      fixture.directory,
      fixture.queueFile,
      async () => {
        appendAttempted = true;
        throw new Error('The vault must not be accessed for an unexpected capture.');
      },
    );
    await assert.rejects(
      () => bridge.runOnce({ expectedCaptureId: `reading_${'b'.repeat(32)}` }),
      (error: unknown) => error instanceof BridgeProtocolError && error.code === 'UNEXPECTED_CAPTURE',
    );
    assert.strictEqual(appendAttempted, false);
    assert.strictEqual((await fixture.apiService.listCaptures({}))[0].status, 'pending');
  } finally { await fixture.cleanup(); }
});
