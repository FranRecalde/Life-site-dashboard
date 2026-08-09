import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ReadingBook, ReadingCapture, ReadingCaptureListFilter } from '../../src/types';
import { formatReadingCaptureMarkdown } from '../../server/reading/readingFormatter';
import { ReadingService } from '../../server/reading/readingService';
import {
  CaptureCreateCommand,
  CaptureCreateResult,
  CaptureTransitionCommand,
  CaptureTransitionResult,
  ReadingBookUpdateResult,
  ReadingStore,
} from '../../server/storage/types';
import { createReadingDeliveryMarker } from '../../server/storage/readingDeliveryMarkers';
import {
  appendCaptureToExistingNote,
  BridgeLocalError,
  BridgeProtocolError,
  ReadingObsidianBridge,
  withSingleInstanceLock,
} from './readingObsidianBridge';

const captureId = `reading_${'a'.repeat(32)}`;
const capturedAt = '2026-07-28T12:01:00.000Z';

class InMemoryReadingStore implements ReadingStore {
  readonly books: ReadingBook[] = [];
  readonly captures: ReadingCapture[] = [];

  async listBooks(options?: { includeArchived?: boolean }): Promise<ReadingBook[]> {
    return this.books
      .filter((book) => options?.includeArchived || book.status === 'active')
      .sort((left, right) => left.title.localeCompare(right.title));
  }

  async getBook(id: string): Promise<ReadingBook | null> {
    return this.books.find((book) => book.id === id) ?? null;
  }

  async createBook(book: ReadingBook): Promise<ReadingBook> {
    this.books.push(book);
    return book;
  }

  async updateBook(id: string, expectedRevision: number, book: ReadingBook): Promise<ReadingBookUpdateResult> {
    const index = this.books.findIndex((candidate) => candidate.id === id);
    if (index === -1) return { outcome: 'not_found' };
    if (this.books[index].revision !== expectedRevision) return { outcome: 'revision_conflict' };
    this.books[index] = book;
    return { outcome: 'updated', book };
  }

  async listCaptures(filter?: ReadingCaptureListFilter): Promise<ReadingCapture[]> {
    return this.captures
      .filter((capture) => !filter?.bookId || capture.bookId === filter.bookId)
      .filter((capture) => !filter?.status || capture.status === filter.status)
      .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
      .slice(0, filter?.limit ?? 100);
  }

  async listCapturesForDelivery(status: 'pending' | 'claimed'): Promise<ReadingCapture[]> {
    return this.captures
      .filter((capture) => capture.status === status)
      .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
  }

  async getCapture(id: string): Promise<ReadingCapture | null> {
    return this.captures.find((capture) => capture.id === id) ?? null;
  }

  async createCapture(command: CaptureCreateCommand): Promise<CaptureCreateResult> {
    const book = await this.getBook(command.capture.bookId);
    if (!book) return { outcome: 'book_not_found' };
    if (book.status !== 'active') return { outcome: 'book_inactive' };
    this.captures.push(command.capture);
    return { outcome: 'created', capture: command.capture };
  }

  async transitionCapture(command: CaptureTransitionCommand): Promise<CaptureTransitionResult> {
    const index = this.captures.findIndex((capture) => capture.id === command.captureId);
    if (index === -1) return { outcome: 'not_found' };
    const current = this.captures[index];
    if (current.status !== command.expectedStatus || current.updatedAt !== command.expectedUpdatedAt) {
      return { outcome: 'state_conflict' };
    }
    this.captures[index] = command.capture;
    return { outcome: 'updated', capture: command.capture };
  }
}

function makeCapture(overrides: Partial<ReadingCapture> = {}): ReadingCapture {
  return {
    id: captureId,
    bookId: 'book_1', bookRevision: 1, bookTitle: 'Book', bookAuthor: 'Author',
    bookTags: [], destinationNotePath: 'Literature notes/Book.md',
    originalText: 'A deterministic queued thought.', captureType: 'thought',
    capturedAt, receivedAt: capturedAt, creatorType: 'life_site', status: 'pending',
    markdownRenderVersion: 1, deliveryAttempts: { count: 0 }, updatedAt: capturedAt,
    ...overrides,
  };
}

async function createFixture(initialContent = '# Book\n') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'life-site-reading-bridge-'));
  const markerBasePath = path.join(directory, 'firestore-reading-bridge');
  const note = path.join(directory, 'Literature notes', 'Book.md');
  await fs.mkdir(path.dirname(note), { recursive: true });
  await fs.writeFile(note, initialContent, 'utf8');
  let nextCapture = 0;
  const store = new InMemoryReadingStore();
  const createCaptureId = () => (
    nextCapture++ === 0 ? captureId : `reading_${'b'.repeat(32)}`
  );
  const service = new ReadingService(store, () => capturedAt, () => 'book_1', createCaptureId);
  await service.createBook({ title: 'Book', author: 'Author', destinationNotePath: 'Literature notes/Book.md' });
  await service.createCapture({ bookId: 'book_1', originalText: 'A deterministic queued thought.', captureType: 'thought' });
  return { directory, note, markerBasePath, store, service, cleanup: () => fs.rm(directory, { recursive: true, force: true }) };
}

function markerPath(markerBasePath: string, id = captureId): string {
  return path.join(`${markerBasePath}.delivery-markers`, `${id}.delivered`);
}

test('worker renders a deterministic timestamped block, marks delivery locally, then confirms Firestore', async () => {
  const fixture = await createFixture();
  try {
    const bridge = new ReadingObsidianBridge(fixture.service, fixture.directory, fixture.markerBasePath);
    assert.deepStrictEqual(await bridge.runOnce(), { outcome: 'delivered', captureId, appendOutcome: 'appended' });
    const note = await fs.readFile(fixture.note, 'utf8');
    assert.ok(note.includes(`## Reading capture — ${capturedAt}`));
    assert.ok(note.includes(`<!-- /life-site-reading-capture:${captureId} -->`));
    await assert.rejects(() => fs.access(markerPath(fixture.markerBasePath)), { code: 'ENOENT' });
    assert.deepStrictEqual(await bridge.runOnce(), { outcome: 'idle' });
    assert.strictEqual((await fixture.service.listCaptures({}))[0].status, 'done');
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

test('a missing destination note is created when its parent folder exists', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'life-site-reading-bridge-'));
  const note = path.join(directory, 'Literature notes', 'Created Book.md');
  await fs.mkdir(path.dirname(note), { recursive: true });
  const capture = makeCapture({
    bookTitle: 'Created Book',
    destinationNotePath: 'Literature notes/Created Book.md',
  });
  try {
    assert.strictEqual(await appendCaptureToExistingNote(directory, capture), 'appended');
    const contents = await fs.readFile(note, 'utf8');
    assert.match(contents, /^\n\d{12}\n# Created Book\n##### Type: Book\n##### Status: In progress\n\n<!-- life-site-reading-capture:/);
    assert.ok(contents.endsWith(`<!-- /life-site-reading-capture:${capture.id} -->`));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('a missing destination note is not created when its parent folder is missing', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'life-site-reading-bridge-'));
  const missingParent = path.join(directory, 'Literature notes', 'Missing');
  const note = path.join(missingParent, 'Book.md');
  const capture = makeCapture({ destinationNotePath: 'Literature notes/Missing/Book.md' });
  try {
    await assert.rejects(
      () => appendCaptureToExistingNote(directory, capture),
      (error: unknown) => error instanceof BridgeLocalError && error.code === 'DESTINATION_NOT_FOUND',
    );
    await assert.rejects(() => fs.access(note), { code: 'ENOENT' });
    await assert.rejects(() => fs.access(missingParent), { code: 'ENOENT' });
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
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
      locked.service, locked.directory, locked.markerBasePath,
      async () => { throw Object.assign(new Error('locked'), { code: 'EBUSY' }); },
    );
    assert.deepStrictEqual(await lockedBridge.runOnce(), { outcome: 'needs_attention', captureId, errorCode: 'DESTINATION_LOCKED' });
    assert.strictEqual((await locked.service.listCaptures({}))[0].status, 'pending');

    const conflictBridge = new ReadingObsidianBridge(conflicted.service, conflicted.directory, conflicted.markerBasePath);
    assert.deepStrictEqual(await conflictBridge.runOnce(), { outcome: 'needs_attention', captureId, errorCode: 'DESTINATION_CONFLICTED' });
    assert.strictEqual((await conflicted.service.listCaptures({}))[0].status, 'pending');
  } finally { await Promise.all([locked.cleanup(), conflicted.cleanup()]); }
});

test('an API write and bridge delivery keep both captures and append only one entry', async () => {
  const fixture = await createFixture();
  try {
    const bridge = new ReadingObsidianBridge(fixture.service, fixture.directory, fixture.markerBasePath);
    const created = await Promise.all([
      bridge.runOnce(),
      fixture.service.createCapture({ bookId: 'book_1', originalText: 'Second capture created while delivery runs.', captureType: 'thought' }),
    ]);
    assert.strictEqual(created[0].outcome, 'delivered');
    const captures = await fixture.service.listCaptures({});
    assert.strictEqual(captures.length, 2);
    assert.strictEqual(captures.filter((capture) => capture.status === 'done').length, 1);
    const note = await fs.readFile(fixture.note, 'utf8');
    assert.strictEqual(note.split(`<!-- life-site-reading-capture:${captureId} -->`).length - 1, 1);
  } finally { await fixture.cleanup(); }
});

test('an incomplete matching entry is never acknowledged', async () => {
  const fixture = await createFixture(`<!-- life-site-reading-capture:${captureId} -->\npartial`);
  try {
    await assert.rejects(() => appendCaptureToExistingNote(fixture.directory, makeCapture()), (error: unknown) => error instanceof BridgeLocalError && error.code === 'PARTIAL_CAPTURE_BLOCK');
  } finally { await fixture.cleanup(); }
});

test('restart after an append before marker creation does not duplicate and reconciles delivery', async () => {
  const fixture = await createFixture();
  try {
    const capture = (await fixture.service.listPendingCapturesForBridge())[0];
    assert.ok(capture);
    assert.strictEqual(await appendCaptureToExistingNote(fixture.directory, capture), 'appended');
    await assert.rejects(() => fs.access(markerPath(fixture.markerBasePath)), { code: 'ENOENT' });

    // A fresh service over the same in-memory store models a new bridge process.
    const restartedService = new ReadingService(fixture.store);
    const bridge = new ReadingObsidianBridge(restartedService, fixture.directory, fixture.markerBasePath);
    assert.deepStrictEqual(await bridge.runOnce(), { outcome: 'delivered', captureId: capture.id, appendOutcome: 'already_present' });
    const note = await fs.readFile(fixture.note, 'utf8');
    assert.strictEqual(note.split(`<!-- life-site-reading-capture:${capture.id} -->`).length - 1, 1);
    await assert.rejects(() => fs.access(markerPath(fixture.markerBasePath)), { code: 'ENOENT' });
    assert.strictEqual((await fixture.service.listCaptures({}))[0].status, 'done');
  } finally { await fixture.cleanup(); }
});

test('leftover markers are reconciled before a new capture is fetched', async () => {
  const fixture = await createFixture();
  try {
    const capture = (await fixture.service.listPendingCapturesForBridge())[0];
    assert.ok(capture);
    assert.strictEqual(await appendCaptureToExistingNote(fixture.directory, capture), 'appended');
    await createReadingDeliveryMarker(fixture.markerBasePath, capture.id);

    const bridge = new ReadingObsidianBridge(fixture.service, fixture.directory, fixture.markerBasePath);
    assert.deepStrictEqual(await bridge.runOnce(), { outcome: 'idle' });
    assert.strictEqual((await fixture.service.listCaptures({}))[0].status, 'done');
    await assert.rejects(() => fs.access(markerPath(fixture.markerBasePath)), { code: 'ENOENT' });
  } finally { await fixture.cleanup(); }
});

test('a retained marker for an already done capture is removed without appending', async () => {
  const fixture = await createFixture();
  let confirmationCalls = 0;
  let appendAttempted = false;
  try {
    const capture = (await fixture.service.listPendingCapturesForBridge())[0];
    assert.ok(capture);
    await fixture.service.claimCapture(capture.id);
    await fixture.service.confirmDelivery(capture.id);
    await createReadingDeliveryMarker(fixture.markerBasePath, capture.id);

    const trackingService = new Proxy(fixture.service, {
      get(target, property, receiver) {
        if (property === 'confirmDelivery') {
          return async (captureId: string) => {
            confirmationCalls += 1;
            return target.confirmDelivery(captureId);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const bridge = new ReadingObsidianBridge(
      trackingService as ReadingService,
      fixture.directory,
      fixture.markerBasePath,
      async () => {
        appendAttempted = true;
        throw new Error('A done capture must not be appended again.');
      },
    );

    assert.deepStrictEqual(await bridge.runOnce(), { outcome: 'idle' });
    assert.strictEqual(confirmationCalls, 1);
    assert.strictEqual(appendAttempted, false);
    await assert.rejects(() => fs.access(markerPath(fixture.markerBasePath)), { code: 'ENOENT' });
  } finally { await fixture.cleanup(); }
});

test('a marker remains when Firestore confirmation fails after the append', async () => {
  const fixture = await createFixture();
  try {
    const failingService = new Proxy(fixture.service, {
      get(target, property, receiver) {
        if (property === 'confirmDelivery') {
          return async () => { throw new Error('Firestore is unavailable'); };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const bridge = new ReadingObsidianBridge(
      failingService as ReadingService,
      fixture.directory,
      fixture.markerBasePath,
    );
    assert.deepStrictEqual(await bridge.runOnce(), {
      outcome: 'needs_attention', captureId, errorCode: 'APPEND_FAILED',
    });
    await fs.access(markerPath(fixture.markerBasePath));
    assert.strictEqual((await fixture.service.listCaptures({}))[0].status, 'claimed');
  } finally { await fixture.cleanup(); }
});

test('a different block in the note is appended and not treated as already present', async () => {
  const fixture = await createFixture();
  try {
    const capture = (await fixture.service.listPendingCapturesForBridge())[0];
    assert.ok(capture);
    const queuedBlock = formatReadingCaptureMarkdown(capture);
    await fs.writeFile(fixture.note, `# Book\n\n${queuedBlock.replace(capture.originalText, 'A genuinely different queued thought.')}`, 'utf8');
    const bridge = new ReadingObsidianBridge(fixture.service, fixture.directory, fixture.markerBasePath);
    assert.deepStrictEqual(await bridge.runOnce(), { outcome: 'delivered', captureId: capture.id, appendOutcome: 'appended' });
    const note = await fs.readFile(fixture.note, 'utf8');
    assert.strictEqual(note.split(`<!-- life-site-reading-capture:${capture.id} -->`).length - 1, 2);
    assert.ok(note.endsWith(queuedBlock));
  } finally { await fixture.cleanup(); }
});

test('single-instance lock prevents overlap and releases after normal completion', async () => {
  const lockIdentity = path.join(os.tmpdir(), `life-site-reading-bridge-${process.pid}-normal.lock`);
  await withSingleInstanceLock(lockIdentity, async () => {
    await assert.rejects(() => withSingleInstanceLock(lockIdentity, async () => undefined), (error: unknown) => error instanceof BridgeProtocolError && error.code === 'INVALID_CONFIGURATION');
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
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', childScript], { stdio: ['ignore', 'pipe', 'pipe'] });
  const childClosed = once(child, 'close');
  try {
    await new Promise<void>((resolve, reject) => {
      let errors = '';
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for lock holder. ${errors}`)), 10_000);
      child.stdout.on('data', (chunk: Buffer) => { if (chunk.toString('utf8').includes('LOCKED')) { clearTimeout(timer); resolve(); } });
      child.stderr.on('data', (chunk: Buffer) => { errors += chunk.toString('utf8'); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Lock holder exited early with ${code}. ${errors}`)); });
    });
    await assert.rejects(() => withSingleInstanceLock(lockIdentity, async () => undefined), (error: unknown) => error instanceof BridgeProtocolError && error.code === 'INVALID_CONFIGURATION');
    child.kill('SIGKILL');
    await childClosed;
    await withSingleInstanceLock(lockIdentity, async () => undefined);
  } finally {
    if (child.exitCode === null) { child.kill('SIGKILL'); await childClosed.catch(() => undefined); }
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('one-shot rehearsal refuses an unexpected capture before accessing the vault', async () => {
  const fixture = await createFixture();
  let appendAttempted = false;
  try {
    const bridge = new ReadingObsidianBridge(
      fixture.service, fixture.directory, fixture.markerBasePath,
      async () => { appendAttempted = true; throw new Error('The vault must not be accessed for an unexpected capture.'); },
    );
    await assert.rejects(() => bridge.runOnce({ expectedCaptureId: `reading_${'b'.repeat(32)}` }), (error: unknown) => error instanceof BridgeProtocolError && error.code === 'UNEXPECTED_CAPTURE');
    assert.strictEqual(appendAttempted, false);
    assert.strictEqual((await fixture.service.listCaptures({}))[0].status, 'pending');
  } finally { await fixture.cleanup(); }
});
