import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ReadingCapture } from '../../src/types';
import { formatReadingCaptureMarkdown } from '../../server/reading/readingFormatter';
import { ReadingService } from '../../server/reading/readingService';
import { LocalReadingStore } from '../../server/storage/localReadingStore';
import {
  appendCaptureToExistingNote,
  BridgeLocalError,
  ReadingObsidianBridge,
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
