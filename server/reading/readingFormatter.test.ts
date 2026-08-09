import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadingCapture } from '../../src/types';
import { formatReadingCaptureMarkdown } from './readingFormatter';

function makeCapture(bookTags: string[]): ReadingCapture {
  return {
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
