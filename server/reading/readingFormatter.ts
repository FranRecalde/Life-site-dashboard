import { ReadingCapture } from '../../src/types';

export const READING_MARKDOWN_RENDER_VERSION = 1 as const;

const CAPTURE_TYPE_LABELS: Record<ReadingCapture['captureType'], string> = {
  thought: 'Thought',
  quote_and_thought: 'Quote and thought',
  question: 'Question',
  action: 'Action',
  summary: 'Summary',
};

function formatTag(tag: string): string | null {
  const normalized = tag
    .trim()
    .replace(/^#/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_/-]/gu, '');
  return normalized ? `#${normalized}` : null;
}

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
  const tags = capture.bookTags
    .map(formatTag)
    .filter((tag): tag is string => tag !== null);
  if (tags.length > 0) {
    metadata.push(`- Tags: ${tags.join(', ')}`);
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
