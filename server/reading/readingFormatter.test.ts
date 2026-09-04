import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadingCapture } from '../../src/types';
import { formatReadingCaptureMarkdown } from './readingFormatter';

function tagsLineFor(tag: string): string | undefined {
  return formatReadingCaptureMarkdown(makeCapture([tag]))
    .split('\n')
    .find((line) => line.startsWith('- Tags:'));
}

function makeCapture(bookTags: string[]): ReadingCapture {
  return {
    deliveryKind: 'reading',
    id: `reading_${'a'.repeat(32)}`,
    bookId: 'book_1',
    bookRevision: 1,
    bookTitle: 'Book',
    bookAuthor: 'Author',
    bookTags,
    destinationNotePath: 'Literature notes/Book.md',
    originalText: 'Exact words',
    captureType: 'thought',
    capturedAt: '2026-08-09T12:00:00.000Z',
    receivedAt: '2026-08-09T12:00:00.000Z',
    creatorType: 'life_site',
    status: 'pending',
    markdownRenderVersion: 1,
    deliveryAttempts: { count: 0 },
    updatedAt: '2026-08-09T12:00:00.000Z',
  };
}

test('formatter sanitises each supported tag form for Markdown output', () => {
  assert.strictEqual(tagsLineFor('self help'), '- Tags: #self-help');
  assert.strictEqual(tagsLineFor('#inner excellence'), '- Tags: #inner-excellence');
  assert.strictEqual(tagsLineFor('educación'), '- Tags: #educación');
  assert.strictEqual(tagsLineFor('  '), undefined);
  assert.strictEqual(tagsLineFor('a/b'), '- Tags: #a/b');
  assert.strictEqual(tagsLineFor('tag!!'), '- Tags: #tag');
  assert.strictEqual(tagsLineFor('#'), undefined);
  assert.strictEqual(tagsLineFor('Type: Book'), '- Tags: #Type-Book');
});

test('formatter sanitises tags for Markdown output while preserving accented letters', () => {
  const markdown = formatReadingCaptureMarkdown(makeCapture([
    ' self help ',
    '#ideas!!!',
    ' español ',
    '###',
    '   ',
  ]));

  const tagsLine = markdown.split('\n').find((line) => line.startsWith('- Tags:'));
  assert.strictEqual(tagsLine, '- Tags: #self-help, #ideas, #español');
});
