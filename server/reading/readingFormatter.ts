import { ReadingCapture } from '../../src/types';

export const READING_MARKDOWN_RENDER_VERSION = 1 as const;

const CAPTURE_TYPE_LABELS: Record<ReadingCapture['captureType'], string> = {
  thought: 'Thought',
  quote_and_thought: 'Quote and thought',
  question: 'Question',
  action: 'Action',
  summary: 'Summary',
};

/**
 * Pure, deterministic formatting for a future append-only bridge.
 * Phase 1 never sends this output to Obsidian.
 */
export function formatReadingCaptureMarkdown(capture: ReadingCapture): string {
  const metadata = [
    `- Captured: ${capture.capturedAt}`,
    `- Type: ${CAPTURE_TYPE_LABELS[capture.captureType]}`,
  ];
  if (capture.source) {
    metadata.push(`- Source: ${capture.source}`);
  }
  if (capture.locator) {
    metadata.push(`- ${capture.locator.kind}: ${capture.locator.value}`);
  }
  if (capture.bookTags.length > 0) {
    metadata.push(`- Tags: ${capture.bookTags.join(', ')}`);
  }

  return [
    `<!-- life-site-reading-capture:${capture.id} -->`,
    `## Reading capture — ${capture.capturedAt}`,
    `### ${CAPTURE_TYPE_LABELS[capture.captureType]}`,
    ...metadata,
    '',
    capture.originalText,
    `<!-- /life-site-reading-capture:${capture.id} -->`,
  ].join('\n');
}
