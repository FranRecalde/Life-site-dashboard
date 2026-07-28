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
  const stateFile = path.join(directory, 'reading.json');
  const store = new LocalReadingStore(stateFile);
  let currentTime = '2026-07-28T12:00:00.000Z';
  let id = 0;
  let leaseId = 0;
  const service = new ReadingService(
    store,
    () => currentTime,
    () => `book_${++id}`,
    () => `lease_${++leaseId}`,
  );
  return {
    stateFile,
    store,
    service,
    setNow: (value: string) => {
      currentTime = value;
    },
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

function hasServiceError(code: ReadingServiceError['code']) {
  return (error: unknown): boolean => (
    error instanceof ReadingServiceError && error.code === code
  );
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

test('idempotency identity is scoped while replay and conflict behavior remain stable', async () => {
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
    const second = await fixture.service.createCapture(input, key, 'life_site');
    const customGpt = await fixture.service.createCapture(input, key, 'custom_gpt');

    assert.strictEqual(second.outcome, 'replayed');
    assert.strictEqual(second.capture.id, first.capture.id);
    assert.strictEqual(first.capture.creatorType, 'life_site');
    assert.strictEqual(customGpt.outcome, 'created');
    assert.strictEqual(customGpt.capture.creatorType, 'custom_gpt');
    assert.notStrictEqual(customGpt.capture.id, first.capture.id);
    assert.strictEqual((await fixture.store.listCaptures()).length, 2);

    await assert.rejects(
      () => fixture.service.createCapture({ ...input, originalText: 'Different words' }, key),
      hasServiceError('idempotency_conflict'),
    );
    assert.ok(!fs.readFileSync(fixture.stateFile, 'utf8').includes(key));
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

test('action captures resolve only normalized exact active-book matches', async () => {
  const fixture = createFixture();
  try {
    const first = await fixture.service.createBook({
      title: 'The   Great Divorce',
      author: 'C. S. Lewis',
      destinationNotePath: 'Literature notes/The Great Divorce â€” C. S. Lewis.md',
    });
    await fixture.service.createBook({
      title: 'The Great Divorce',
      author: 'Another Author',
      destinationNotePath: 'Literature notes/The Great Divorce â€” Another Author.md',
    });
    const archived = await fixture.service.createBook({
      title: 'Archived Book',
      author: 'Writer',
      destinationNotePath: 'Literature notes/Archived Book â€” Writer.md',
    });
    await fixture.service.updateBook(archived.id, {
      expectedRevision: 1,
      status: 'archived',
    });

    await assert.rejects(
      () => fixture.service.createCaptureFromAction(
        {
          bookTitle: 'the great divorce',
          originalText: 'Words',
          captureType: 'thought',
        },
        '0fbb57d1-d6a5-4679-adc4-bf0fd5634d20',
      ),
      hasServiceError('book_ambiguous'),
    );

    const resolved = await fixture.service.createCaptureFromAction(
      {
        bookTitle: 'Ｔｈｅ Great   Divorce',
        bookAuthor: 'c. s. lewis',
        originalText: 'Exact words',
        captureType: 'thought',
      },
      '7366b62c-aae0-4149-a240-91bdc6e5b2f4',
    );
    assert.strictEqual(resolved.capture.bookId, first.id);
    assert.strictEqual(resolved.capture.creatorType, 'custom_gpt');

    await assert.rejects(
      () => fixture.service.createCaptureFromAction(
        {
          bookTitle: 'Archived Book',
          originalText: 'Words',
          captureType: 'thought',
        },
        '2aa8a9e5-0797-409d-9fae-948cd1a20c49',
      ),
      hasServiceError('book_inactive'),
    );
    await assert.rejects(
      () => fixture.service.createCaptureFromAction(
        {
          bookTitle: 'Great Divorce',
          originalText: 'Words',
          captureType: 'thought',
        },
        'e2e3b2fd-9917-45dc-877f-cd47eaf2737c',
      ),
      hasServiceError('book_not_found'),
    );
  } finally {
    fixture.cleanup();
  }
});

test('delivery claims receive unique lease IDs and competing claims fail atomically', async () => {
  const fixture = createFixture();
  try {
    const book = await fixture.service.createBook({
      title: 'Book',
      author: 'Author',
      destinationNotePath: 'Literature notes/Book — Author.md',
    });
    const first = await fixture.service.createCapture(
      {
        bookId: book.id,
        originalText: 'Words',
        captureType: 'action',
      },
      'd292a1c3-e883-4961-bf87-1d0bf44eab64',
    );
    const second = await fixture.service.createCapture(
      {
        bookId: book.id,
        originalText: 'Other words',
        captureType: 'action',
      },
      '3c5c957f-03ee-47eb-8d89-b46852a7877d',
    );

    await assert.rejects(
      () => fixture.service.confirmDelivery(first.capture.id, 'missing-lease'),
      hasServiceError('invalid_capture_transition'),
    );

    const claims = await Promise.allSettled([
      fixture.service.claimCapture(first.capture.id, 'future-bridge-a', 300_000),
      fixture.service.claimCapture(first.capture.id, 'future-bridge-b', 300_000),
    ]);
    const successfulClaims = claims.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<
        typeof fixture.service.claimCapture
      >>> => result.status === 'fulfilled',
    );
    assert.strictEqual(successfulClaims.length, 1);
    assert.strictEqual(claims.filter((result) => result.status === 'rejected').length, 1);
    assert.strictEqual(successfulClaims[0].value.deliveryAttempts.count, 1);
    assert.ok(successfulClaims[0].value.deliveryLease?.leaseId);

    const secondClaim = await fixture.service.claimCapture(
      second.capture.id,
      'future-bridge-a',
      300_000,
    );
    assert.notStrictEqual(
      secondClaim.deliveryLease?.leaseId,
      successfulClaims[0].value.deliveryLease?.leaseId,
    );
  } finally {
    fixture.cleanup();
  }
});

test('only a matching unexpired lease can confirm delivery or report failure', async () => {
  const fixture = createFixture();
  try {
    const book = await fixture.service.createBook({
      title: 'Book',
      author: 'Author',
      destinationNotePath: 'Literature notes/Book â€” Author.md',
    });
    const makeCapture = (key: string, originalText: string) => (
      fixture.service.createCapture(
        { bookId: book.id, originalText, captureType: 'action' },
        key,
      )
    );

    const confirmationCapture = await makeCapture(
      '249b1ddc-90ea-4d01-b3ce-b41ee76592e4',
      'Confirm me',
    );
    const confirmationClaim = await fixture.service.claimCapture(
      confirmationCapture.capture.id,
      'future-bridge',
      300_000,
    );
    const confirmationLeaseId = confirmationClaim.deliveryLease!.leaseId;

    await assert.rejects(
      () => fixture.service.confirmDelivery(
        confirmationCapture.capture.id,
        undefined as unknown as string,
      ),
      hasServiceError('invalid_delivery_metadata'),
    );
    assert.deepStrictEqual(
      await fixture.store.getCapture(confirmationCapture.capture.id),
      confirmationClaim,
    );
    await assert.rejects(
      () => fixture.service.confirmDelivery(
        confirmationCapture.capture.id,
        'wrong-lease',
      ),
      hasServiceError('capture_lease_conflict'),
    );
    assert.deepStrictEqual(
      await fixture.store.getCapture(confirmationCapture.capture.id),
      confirmationClaim,
    );

    const delivered = await fixture.service.confirmDelivery(
      confirmationCapture.capture.id,
      confirmationLeaseId,
    );
    assert.strictEqual(delivered.status, 'delivered');
    assert.strictEqual(delivered.deliveryLease, undefined);
    assert.strictEqual(delivered.deliveryAttempts.lastErrorCode, undefined);
    assert.strictEqual(delivered.deliveredAt, '2026-07-28T12:00:00.000Z');

    const failureCapture = await makeCapture(
      '83f4377b-45a7-4d37-a6f6-62ff04abc7bb',
      'Fail me',
    );
    const failureClaim = await fixture.service.claimCapture(
      failureCapture.capture.id,
      'future-bridge',
      300_000,
    );
    await assert.rejects(
      () => fixture.service.reportDeliveryFailure(
        failureCapture.capture.id,
        undefined as unknown as string,
        'APPEND_FAILED',
      ),
      hasServiceError('invalid_delivery_metadata'),
    );
    await assert.rejects(
      () => fixture.service.reportDeliveryFailure(
        failureCapture.capture.id,
        'wrong-lease',
        'APPEND_FAILED',
      ),
      hasServiceError('capture_lease_conflict'),
    );
    assert.deepStrictEqual(
      await fixture.store.getCapture(failureCapture.capture.id),
      failureClaim,
    );
    const needsAttention = await fixture.service.reportDeliveryFailure(
      failureCapture.capture.id,
      failureClaim.deliveryLease!.leaseId,
      'APPEND_FAILED',
    );
    assert.strictEqual(needsAttention.status, 'needs_attention');
    assert.strictEqual(needsAttention.deliveryAttempts.lastErrorCode, 'APPEND_FAILED');
    assert.strictEqual(needsAttention.deliveryLease, undefined);

    const pending = await fixture.service.retryCapture(failureCapture.capture.id);
    assert.strictEqual(pending.status, 'pending');
    assert.strictEqual(pending.deliveryAttempts.lastErrorCode, undefined);
    assert.strictEqual(pending.deliveryLease, undefined);
  } finally {
    fixture.cleanup();
  }
});

test('expired leases reject delivery and recover only with the current expired lease', async () => {
  const fixture = createFixture();
  try {
    const book = await fixture.service.createBook({
      title: 'Book',
      author: 'Author',
      destinationNotePath: 'Literature notes/Book â€” Author.md',
    });
    const { capture } = await fixture.service.createCapture(
      {
        bookId: book.id,
        originalText: 'Recover me',
        captureType: 'action',
      },
      '16cf8dae-ee6d-4dae-883d-2f76a980c44e',
    );
    const firstClaim = await fixture.service.claimCapture(
      capture.id,
      'future-bridge',
      300_000,
    );
    const firstLeaseId = firstClaim.deliveryLease!.leaseId;

    fixture.setNow('2026-07-28T12:04:59.999Z');
    await assert.rejects(
      () => fixture.service.recoverExpiredLease(capture.id, firstLeaseId),
      hasServiceError('capture_lease_not_expired'),
    );
    assert.deepStrictEqual(await fixture.store.getCapture(capture.id), firstClaim);

    fixture.setNow('2026-07-28T12:05:00.000Z');
    await assert.rejects(
      () => fixture.service.confirmDelivery(capture.id, firstLeaseId),
      hasServiceError('capture_lease_expired'),
    );
    await assert.rejects(
      () => fixture.service.reportDeliveryFailure(
        capture.id,
        firstLeaseId,
        'APPEND_FAILED',
      ),
      hasServiceError('capture_lease_expired'),
    );
    assert.deepStrictEqual(await fixture.store.getCapture(capture.id), firstClaim);

    const recovered = await fixture.service.recoverExpiredLease(
      capture.id,
      firstLeaseId,
    );
    assert.strictEqual(recovered.status, 'pending');
    assert.strictEqual(recovered.deliveryLease, undefined);

    fixture.setNow('2026-07-28T12:06:00.000Z');
    const secondClaim = await fixture.service.claimCapture(
      capture.id,
      'future-bridge',
      300_000,
    );
    fixture.setNow('2026-07-28T12:12:00.000Z');
    await assert.rejects(
      () => fixture.service.confirmDelivery(capture.id, firstLeaseId),
      hasServiceError('capture_lease_conflict'),
    );
    await assert.rejects(
      () => fixture.service.reportDeliveryFailure(
        capture.id,
        firstLeaseId,
        'APPEND_FAILED',
      ),
      hasServiceError('capture_lease_conflict'),
    );
    await assert.rejects(
      () => fixture.service.recoverExpiredLease(capture.id, firstLeaseId),
      hasServiceError('capture_lease_conflict'),
    );
    assert.deepStrictEqual(await fixture.store.getCapture(capture.id), secondClaim);
  } finally {
    fixture.cleanup();
  }
});

test('bridge claims the oldest pending capture and recovers only its own expired leases', async () => {
  const fixture = createFixture();
  try {
    const book = await fixture.service.createBook({
      title: 'Book',
      author: 'Author',
      destinationNotePath: 'Literature notes/Book — Author.md',
    });
    const first = await fixture.service.createCapture(
      {
        bookId: book.id,
        originalText: 'First',
        captureType: 'thought',
      },
      'bridge-claim-oldest-first-0001',
    );
    fixture.setNow('2026-07-28T12:01:00.000Z');
    const second = await fixture.service.createCapture(
      {
        bookId: book.id,
        originalText: 'Second',
        captureType: 'thought',
      },
      'bridge-claim-oldest-first-0002',
    );

    const claimedFirst = await fixture.service.claimNextCapture(
      'windows-bridge',
      300_000,
    );
    assert.strictEqual(claimedFirst?.id, first.capture.id);

    const claimedByOther = await fixture.service.claimCapture(
      second.capture.id,
      'other-bridge',
      300_000,
    );
    fixture.setNow('2026-07-28T12:07:00.000Z');
    assert.strictEqual(
      await fixture.service.recoverExpiredCaptures('windows-bridge'),
      1,
    );
    assert.strictEqual(
      (await fixture.store.getCapture(first.capture.id))?.status,
      'pending',
    );
    assert.strictEqual(
      (await fixture.store.getCapture(claimedByOther.id))?.status,
      'in_progress',
    );

    const reclaimed = await fixture.service.claimNextCapture(
      'windows-bridge',
      300_000,
    );
    assert.strictEqual(reclaimed?.id, first.capture.id);
    assert.strictEqual(
      (await fixture.store.getCapture(second.capture.id))?.deliveryLease?.ownerId,
      'other-bridge',
    );
  } finally {
    fixture.cleanup();
  }
});

test('bridge confirmation and failure acknowledgements are safe to retry', async () => {
  const fixture = createFixture();
  try {
    const book = await fixture.service.createBook({
      title: 'Book',
      author: 'Author',
      destinationNotePath: 'Literature notes/Book — Author.md',
    });
    const deliveredInput = await fixture.service.createCapture(
      {
        bookId: book.id,
        originalText: 'Delivered',
        captureType: 'summary',
      },
      'bridge-idempotent-confirm-0001',
    );
    const deliveredClaim = await fixture.service.claimCapture(
      deliveredInput.capture.id,
      'windows-bridge',
      300_000,
    );
    const delivered = await fixture.service.confirmDelivery(
      deliveredClaim.id,
      deliveredClaim.deliveryLease!.leaseId,
    );
    const confirmedAgain = await fixture.service.confirmDelivery(
      deliveredClaim.id,
      deliveredClaim.deliveryLease!.leaseId,
    );
    assert.strictEqual(confirmedAgain.id, delivered.id);
    assert.strictEqual(confirmedAgain.status, 'delivered');
    assert.strictEqual(confirmedAgain.deliveredAt, delivered.deliveredAt);

    const failedInput = await fixture.service.createCapture(
      {
        bookId: book.id,
        originalText: 'Failed',
        captureType: 'summary',
      },
      'bridge-idempotent-failure-0001',
    );
    const failedClaim = await fixture.service.claimCapture(
      failedInput.capture.id,
      'windows-bridge',
      300_000,
    );
    const failed = await fixture.service.reportDeliveryFailure(
      failedClaim.id,
      failedClaim.deliveryLease!.leaseId,
      'DESTINATION_NOT_FOUND',
    );
    const failedAgain = await fixture.service.reportDeliveryFailure(
      failedClaim.id,
      failedClaim.deliveryLease!.leaseId,
      'DESTINATION_NOT_FOUND',
    );
    assert.strictEqual(failedAgain.id, failed.id);
    assert.strictEqual(failedAgain.status, 'needs_attention');
    assert.strictEqual(
      failedAgain.deliveryAttempts.lastErrorCode,
      'DESTINATION_NOT_FOUND',
    );
  } finally {
    fixture.cleanup();
  }
});
