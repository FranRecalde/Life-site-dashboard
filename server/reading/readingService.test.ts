import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LocalReadingStore } from '../storage/localReadingStore';
import {
  ReadingService,
  ReadingServiceError,
  hashReadingCapturePayload,
} from './readingService';

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-reading-service-'));
  const store = new LocalReadingStore(path.join(directory, 'reading.json'));
  let id = 0;
  const service = new ReadingService(
    store,
    () => '2026-07-28T12:00:00.000Z',
    () => `book_${++id}`,
  );
  return {
    store,
    service,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

test('capture creation snapshots book metadata, inherits source, and preserves exact words', async () => {
  const fixture = createFixture();
  try {
    const book = await fixture.service.createBook({
      title: 'The Great Divorce',
      author: 'C. S. Lewis',
      destinationNotePath: 'Literature notes/The Great Divorce — C. S. Lewis.md',
      tags: ['theology', 'literature'],
      defaultSource: 'audiobook',
    });
    const originalText = '  I think Lewis is showing...\nUnaltered.  ';
    const input = {
      bookId: book.id,
      originalText,
      captureType: 'thought' as const,
      locator: { kind: 'chapter' as const, value: 'Four' },
    };
    const result = await fixture.service.createCapture(
      input,
      '9e7d8c43-14e9-4e9d-97e2-38886cc55661',
    );

    assert.strictEqual(result.outcome, 'created');
    assert.strictEqual(result.capture.originalText, originalText);
    assert.strictEqual(result.capture.source, 'audiobook');
    assert.strictEqual(result.capture.status, 'pending');
    assert.strictEqual(result.capture.creatorType, 'life_site');
    assert.strictEqual(result.capture.bookTitle, book.title);
    assert.strictEqual(result.capture.bookAuthor, book.author);
    assert.deepStrictEqual(result.capture.bookTags, book.tags);
    assert.strictEqual(result.capture.bookRevision, 1);
    assert.strictEqual(result.capture.destinationNotePath, book.destinationNotePath);
    assert.strictEqual(result.capture.payloadHash, hashReadingCapturePayload(input));
    assert.match(result.capture.id, /^reading_[0-9a-f]{32}$/);

    const markdown = fixture.service.formatCapture(result.capture);
    assert.match(markdown, new RegExp(`life-site-reading-capture:${result.capture.id}`));
    assert.ok(markdown.endsWith(originalText));
  } finally {
    fixture.cleanup();
  }
});

test('same idempotency key replays one stable capture and a different payload conflicts', async () => {
  const fixture = createFixture();
  try {
    const book = await fixture.service.createBook({
      title: 'Book',
      author: 'Author',
      destinationNotePath: 'Literature notes/Book — Author.md',
    });
    const key = '6f3eb9a4-a7c6-478d-9d5d-4dc8792a75c0';
    const input = {
      bookId: book.id,
      originalText: 'Exact words',
      captureType: 'summary' as const,
    };
    const first = await fixture.service.createCapture(input, key);
    const second = await fixture.service.createCapture(input, key);

    assert.strictEqual(second.outcome, 'replayed');
    assert.strictEqual(second.capture.id, first.capture.id);
    assert.strictEqual((await fixture.store.listCaptures()).length, 1);

    await assert.rejects(
      () => fixture.service.createCapture({ ...input, originalText: 'Different words' }, key),
      (error: unknown) => (
        error instanceof ReadingServiceError &&
        error.code === 'idempotency_conflict'
      ),
    );
  } finally {
    fixture.cleanup();
  }
});

test('book updates increment revisions while existing capture snapshots stay unchanged', async () => {
  const fixture = createFixture();
  try {
    const book = await fixture.service.createBook({
      title: 'Original title',
      author: 'Author',
      destinationNotePath: 'Literature notes/Original title — Author.md',
      tags: ['original'],
    });
    const created = await fixture.service.createCapture(
      {
        bookId: book.id,
        originalText: 'Words',
        captureType: 'question',
      },
      'd94de4da-1edf-41cf-bc3a-ddf89b94078d',
    );
    const updated = await fixture.service.updateBook(book.id, {
      expectedRevision: 1,
      title: 'Corrected title',
      destinationNotePath: 'Literature notes/Corrected title — Author.md',
      tags: ['corrected'],
    });

    assert.strictEqual(updated.revision, 2);
    assert.strictEqual(created.capture.bookTitle, 'Original title');
    assert.deepStrictEqual(created.capture.bookTags, ['original']);
    assert.strictEqual(
      created.capture.destinationNotePath,
      'Literature notes/Original title — Author.md',
    );

    await assert.rejects(
      () => fixture.service.updateBook(book.id, {
        expectedRevision: 1,
        status: 'archived',
      }),
      (error: unknown) => (
        error instanceof ReadingServiceError &&
        error.code === 'book_revision_conflict'
      ),
    );
  } finally {
    fixture.cleanup();
  }
});

test('delivery state transitions are explicit and delivered cannot be set from pending', async () => {
  const fixture = createFixture();
  try {
    const book = await fixture.service.createBook({
      title: 'Book',
      author: 'Author',
      destinationNotePath: 'Literature notes/Book — Author.md',
    });
    const { capture } = await fixture.service.createCapture(
      {
        bookId: book.id,
        originalText: 'Words',
        captureType: 'action',
      },
      'd292a1c3-e883-4961-bf87-1d0bf44eab64',
    );

    await assert.rejects(
      () => fixture.service.transitionCapture(capture.id, 'delivered'),
      (error: unknown) => (
        error instanceof ReadingServiceError &&
        error.code === 'invalid_capture_transition'
      ),
    );

    const inProgress = await fixture.service.transitionCapture(
      capture.id,
      'in_progress',
      {
        lease: {
          ownerId: 'future-bridge',
          acquiredAt: '2026-07-28T12:00:00.000Z',
          expiresAt: '2026-07-28T12:05:00.000Z',
        },
      },
    );
    assert.strictEqual(inProgress.deliveryAttempts.count, 1);
    assert.ok(inProgress.deliveryLease);

    const needsAttention = await fixture.service.transitionCapture(
      capture.id,
      'needs_attention',
      { errorCode: 'APPEND_FAILED' },
    );
    assert.strictEqual(needsAttention.deliveryAttempts.lastErrorCode, 'APPEND_FAILED');
    assert.strictEqual(needsAttention.deliveryLease, undefined);

    const pending = await fixture.service.transitionCapture(capture.id, 'pending');
    assert.strictEqual(pending.deliveryAttempts.lastErrorCode, undefined);
  } finally {
    fixture.cleanup();
  }
});
