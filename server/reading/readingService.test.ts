import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LocalReadingStore } from '../storage/localReadingStore';
import {
  READING_CLAIM_STALE_MS,
  ReadingService,
  ReadingServiceError,
} from './readingService';

const captureInput = {
  bookId: 'book_1',
  originalText: 'Exact words',
  captureType: 'thought' as const,
  source: 'physical' as const,
  locator: { kind: 'page' as const, value: '42' },
};

function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-reading-service-'));
  const store = new LocalReadingStore(path.join(directory, 'reading.json'));
  let nowMs = Date.parse('2026-07-28T12:00:00.000Z');
  let bookId = 0;
  let captureId = 0;
  const service = new ReadingService(
    store,
    () => new Date(nowMs).toISOString(),
    () => `book_${++bookId}`,
    () => `reading_${String(++captureId).padStart(32, '0')}`,
  );
  return {
    directory,
    store,
    service,
    setNow(value: string) {
      nowMs = Date.parse(value);
    },
    advance(ms: number) {
      nowMs += ms;
    },
  };
}

async function createBook(
  service: ReadingService,
  overrides: Record<string, unknown> = {},
) {
  return service.createBook({
    title: 'Book',
    author: 'Author',
    destinationNotePath: 'Literature notes/Book — Author.md',
    tags: ['reading'],
    defaultSource: 'physical',
    ...overrides,
  });
}

test('capture creation uses fresh queue IDs and no idempotency payload state', async () => {
  const fixture = createFixture();
  try {
    await createBook(fixture.service);
    const first = await fixture.service.createCapture(captureInput);
    const second = await fixture.service.createCapture(captureInput);

    assert.strictEqual(first.outcome, 'created');
    assert.strictEqual(second.outcome, 'created');
    assert.notStrictEqual(first.capture.id, second.capture.id);
    assert.strictEqual(first.capture.status, 'pending');
    assert.strictEqual('payloadHash' in first.capture, false);
    assert.strictEqual((await fixture.store.listCaptures()).length, 2);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('create-only action resolves one active book and queues every accepted request', async () => {
  const fixture = createFixture();
  try {
    await createBook(fixture.service);
    const input = {
      bookTitle: ' book ',
      bookAuthor: ' author ',
      originalText: 'Spoken words',
      captureType: 'summary',
    };
    const first = await fixture.service.createCaptureFromAction(input);
    const second = await fixture.service.createCaptureFromAction(input);

    assert.notStrictEqual(first.capture.id, second.capture.id);
    assert.strictEqual(first.capture.creatorType, 'custom_gpt');
    assert.strictEqual(first.capture.bookId, 'book_1');
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('action book resolution remains fail-closed for missing, archived, and ambiguous books', async () => {
  const fixture = createFixture();
  const input = {
    bookTitle: 'Book',
    originalText: 'Words',
    captureType: 'thought',
  };
  try {
    await assert.rejects(
      () => fixture.service.createCaptureFromAction(input),
      (error: unknown) => (
        error instanceof ReadingServiceError &&
        error.code === 'book_not_found'
      ),
    );

    const archived = await createBook(fixture.service);
    await fixture.service.updateBook(archived.id, {
      expectedRevision: archived.revision,
      status: 'archived',
    });
    await assert.rejects(
      () => fixture.service.createCaptureFromAction(input),
      (error: unknown) => (
        error instanceof ReadingServiceError &&
        error.code === 'book_inactive'
      ),
    );

    await createBook(fixture.service);
    await createBook(fixture.service);
    await assert.rejects(
      () => fixture.service.createCaptureFromAction(input),
      (error: unknown) => (
        error instanceof ReadingServiceError &&
        error.code === 'book_ambiguous'
      ),
    );
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('queue claims oldest pending work and skips a non-stale claim', async () => {
  const fixture = createFixture();
  try {
    await createBook(fixture.service);
    const first = await fixture.service.createCapture(captureInput);
    fixture.advance(1_000);
    const second = await fixture.service.createCapture(captureInput);
    fixture.advance(1_000);

    const firstClaim = await fixture.service.claimNextCapture();
    const secondClaim = await fixture.service.claimNextCapture();

    assert.strictEqual(firstClaim?.id, first.capture.id);
    assert.strictEqual(secondClaim?.id, second.capture.id);
    assert.strictEqual(firstClaim?.status, 'claimed');
    assert.strictEqual(firstClaim?.deliveryAttempts.count, 1);
    assert.ok(firstClaim?.claimedAt);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('a claimed item becomes claimable only after the fixed stale timeout', async () => {
  const fixture = createFixture();
  try {
    await createBook(fixture.service);
    const created = await fixture.service.createCapture(captureInput);
    const firstClaim = await fixture.service.claimCapture(created.capture.id);

    fixture.advance(READING_CLAIM_STALE_MS - 1);
    assert.strictEqual(await fixture.service.claimNextCapture(), null);

    fixture.advance(2);
    const reclaimed = await fixture.service.claimNextCapture();
    assert.strictEqual(reclaimed?.id, firstClaim.id);
    assert.strictEqual(reclaimed?.deliveryAttempts.count, 2);
    assert.notStrictEqual(reclaimed?.claimedAt, firstClaim.claimedAt);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('atomic status and timestamp checks allow only one simultaneous claim', async () => {
  const fixture = createFixture();
  try {
    await createBook(fixture.service);
    const created = await fixture.service.createCapture(captureInput);
    const results = await Promise.allSettled([
      fixture.service.claimCapture(created.capture.id),
      fixture.service.claimCapture(created.capture.id),
    ]);

    assert.strictEqual(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.strictEqual(
      results.filter((result) => result.status === 'rejected').length,
      1,
    );
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('confirmation marks a claim done and remains safe to retry', async () => {
  const fixture = createFixture();
  try {
    await createBook(fixture.service);
    const created = await fixture.service.createCapture(captureInput);
    const claimed = await fixture.service.claimCapture(created.capture.id);
    fixture.advance(1_000);
    const done = await fixture.service.confirmDelivery(claimed.id);
    const repeated = await fixture.service.confirmDelivery(claimed.id);

    assert.strictEqual(done.status, 'done');
    assert.strictEqual(done.claimedAt, undefined);
    assert.strictEqual(done.doneAt, '2026-07-28T12:00:01.000Z');
    assert.strictEqual(repeated.id, done.id);
    assert.strictEqual(repeated.status, 'done');
    assert.strictEqual(repeated.doneAt, done.doneAt);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('failure keeps the item claimed until stale and records only a fixed code', async () => {
  const fixture = createFixture();
  try {
    await createBook(fixture.service);
    const created = await fixture.service.createCapture(captureInput);
    const claimed = await fixture.service.claimCapture(created.capture.id);
    fixture.advance(1_000);
    const failed = await fixture.service.reportDeliveryFailure(
      claimed.id,
      'APPEND_FAILED',
    );

    assert.strictEqual(failed.status, 'claimed');
    assert.strictEqual(failed.claimedAt, claimed.claimedAt);
    assert.strictEqual(
      failed.deliveryAttempts.lastErrorCode,
      'APPEND_FAILED',
    );
    assert.strictEqual(await fixture.service.claimNextCapture(), null);

    fixture.advance(READING_CLAIM_STALE_MS);
    const retried = await fixture.service.claimNextCapture();
    assert.strictEqual(retried?.deliveryAttempts.count, 2);
    assert.strictEqual(retried?.deliveryAttempts.lastErrorCode, undefined);
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('formatter preserves the stable capture marker for bridge delivery', async () => {
  const fixture = createFixture();
  try {
    await createBook(fixture.service);
    const created = await fixture.service.createCapture(captureInput);
    const markdown = fixture.service.formatCapture(created.capture);
    assert.ok(
      markdown.startsWith(
        `<!-- life-site-reading-capture:${created.capture.id} -->`,
      ),
    );
    assert.ok(markdown.includes('Exact words'));
  } finally {
    fs.rmSync(fixture.directory, { recursive: true, force: true });
  }
});
