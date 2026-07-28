import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ReadingValidationError,
  validateCreateBookInput,
  validateCreateCaptureInput,
  validateCreateReadingActionCaptureInput,
  validateDestinationNotePath,
  validateIdempotencyKey,
} from './readingValidation';

test('destination paths must be exact Markdown paths beneath Literature notes', () => {
  const valid = 'Literature notes/The Great Divorce — C. S. Lewis.md';
  assert.strictEqual(validateDestinationNotePath(valid), valid);

  for (const invalid of [
    'C:\\Vault\\Literature notes\\Book.md',
    '/Literature notes/Book.md',
    '../Literature notes/Book.md',
    'Literature notes/../Book.md',
    'Literature notes\\Book.md',
    'Other folder/Book.md',
    'Literature notes/Book.txt',
    'Literature notes/Book: subtitle.md',
    'Literature notes/Book*.md',
    'Literature notes/Folder./Book.md',
    ' Literature notes/Book.md',
    'https://example.com/Book.md',
  ]) {
    assert.throws(
      () => validateDestinationNotePath(invalid),
      ReadingValidationError,
      invalid,
    );
  }
});

test('book validation limits source values and normalizes book metadata only', () => {
  const input = validateCreateBookInput({
    title: '  The Great Divorce  ',
    author: ' C. S. Lewis ',
    destinationNotePath: 'Literature notes/The Great Divorce — C. S. Lewis.md',
    tags: [' theology ', 'literature'],
    defaultSource: 'audiobook',
  });

  assert.deepStrictEqual(input, {
    title: 'The Great Divorce',
    author: 'C. S. Lewis',
    destinationNotePath: 'Literature notes/The Great Divorce — C. S. Lewis.md',
    tags: ['theology', 'literature'],
    defaultSource: 'audiobook',
  });
  assert.throws(
    () => validateCreateBookInput({
      title: 'Book',
      author: 'Author',
      destinationNotePath: 'Literature notes/Book.md',
      defaultSource: 'web',
    }),
    ReadingValidationError,
  );
  assert.throws(
    () => validateCreateBookInput({
      title: 'Book\nInjected heading',
      author: 'Author',
      destinationNotePath: 'Literature notes/Book.md',
    }),
    ReadingValidationError,
  );
});

test('capture validation preserves original words and permits only approved enums', () => {
  const originalText = '  Francisco’s exact words.\nSecond line.  ';
  const input = validateCreateCaptureInput({
    bookId: 'book_123',
    originalText,
    captureType: 'quote_and_thought',
    source: 'kindle',
    locator: { kind: 'location', value: ' 1234 ' },
  });

  assert.strictEqual(input.originalText, originalText);
  assert.deepStrictEqual(input.locator, { kind: 'location', value: '1234' });

  for (const captureType of ['quote', 'note', 'reflection', 'other']) {
    assert.throws(
      () => validateCreateCaptureInput({
        bookId: 'book_123',
        originalText: 'Words',
        captureType,
      }),
      ReadingValidationError,
    );
  }
});

test('browser capture input rejects protected server and delivery fields', () => {
  for (const protectedField of [
    'id',
    'creatorType',
    'payloadHash',
    'capturedAt',
    'receivedAt',
    'bookTitle',
    'bookTags',
    'status',
    'deliveryAttempts',
    'deliveryLease',
    'lastErrorCode',
    'deliveredAt',
  ]) {
    assert.throws(
      () => validateCreateCaptureInput({
        bookId: 'book_123',
        originalText: 'Words',
        captureType: 'thought',
        [protectedField]: 'not-allowed',
      }),
      (error: unknown) => (
        error instanceof ReadingValidationError &&
        error.code === 'unexpected_field'
      ),
      protectedField,
    );
  }
});

test('action capture validation accepts only the restricted title-based contract', () => {
  const originalText = '  Exact spoken words.\nKeep this spacing.  ';
  const input = validateCreateReadingActionCaptureInput({
    bookTitle: '  The Great Divorce  ',
    bookAuthor: ' C. S. Lewis ',
    originalText,
    captureType: 'thought',
    source: 'audiobook',
    locator: { kind: 'timestamp', value: ' 01:23:45 ' },
  });

  assert.deepStrictEqual(input, {
    bookTitle: 'The Great Divorce',
    bookAuthor: 'C. S. Lewis',
    originalText,
    captureType: 'thought',
    source: 'audiobook',
    locator: { kind: 'timestamp', value: '01:23:45' },
  });
  const maximumText = 'x'.repeat(50_000);
  assert.strictEqual(
    validateCreateReadingActionCaptureInput({
      bookTitle: 'Book',
      originalText: maximumText,
      captureType: 'summary',
    }).originalText,
    maximumText,
  );

  for (const protectedField of [
    'bookId',
    'id',
    'creatorType',
    'payloadHash',
    'destinationNotePath',
    'bookTags',
    'status',
    'deliveryAttempts',
    'deliveryLease',
    'capturedAt',
    'receivedAt',
  ]) {
    assert.throws(
      () => validateCreateReadingActionCaptureInput({
        bookTitle: 'Book',
        originalText: 'Words',
        captureType: 'thought',
        [protectedField]: 'not-allowed',
      }),
      (error: unknown) => (
        error instanceof ReadingValidationError &&
        error.code === 'unexpected_field'
      ),
      protectedField,
    );
  }
});

test('idempotency keys must be stable printable values of sufficient length', () => {
  const key = '2b98ef39-314f-4f69-8a16-b51d099bc814';
  assert.strictEqual(validateIdempotencyKey(key), key);
  for (const invalid of ['short', ` ${key}`, `${key}\n`]) {
    assert.throws(() => validateIdempotencyKey(invalid), ReadingValidationError);
  }
});
