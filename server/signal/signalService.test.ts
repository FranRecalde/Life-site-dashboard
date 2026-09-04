import assert from 'node:assert/strict';
import test from 'node:test';
import { SIGNAL_ROLES, SignalCapture, SignalItem } from '../../src/types';
import { SignalStore } from '../storage/signalStore';
import { formatSignalObsidianEntry, queueSignalObsidianDelivery, SignalService, signalObsidianDestinationPath, sourceSupportsSignalDate, validateSignalCapture } from './signalService';

class MemorySignalStore implements SignalStore {
  captures = new Map<string, SignalCapture>();
  items = new Map<string, SignalItem>();
  async createCapture(c: SignalCapture) { this.captures.set(c.id, structuredClone(c)); }
  async getCapture(id: string) { const c = this.captures.get(id); return c ? structuredClone(c) : null; }
  async updateCapture(c: SignalCapture) { this.captures.set(c.id, structuredClone(c)); }
  async createItems(items: SignalItem[]) { items.forEach((x) => this.items.set(x.id, structuredClone(x))); }
  async getItem(id: string) { const item = this.items.get(id); return item ? structuredClone(item) : null; }
  async updateItem(item: SignalItem) { this.items.set(item.id, structuredClone(item)); }
  async listPendingItems(limit: number): Promise<SignalItem[]> { return [...this.items.values()].filter((x) => x.reviewStatus === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((item) => structuredClone(item)); }
  async listReviewCaptures(limit: number): Promise<SignalCapture[]> { return [...this.captures.values()].filter((x) => x.processingStatus === 'failed' || (x.processingStatus === 'no_items' && !x.reviewAcknowledgedAt)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((capture) => structuredClone(capture)); }
}

test('Signal stores zero-or-many model items and never dispatches while processing', async () => {
  const store = new MemorySignalStore(); let dispatches = 0;
  const service = new SignalService(store, async () => ({ items: [
    { type: 'task', title: 'Send the list', role: 'Teacher', dueDate: '2026-09-08', sourceExcerpt: 'Send the list by 2026-09-08.' },
    { type: 'link', title: 'Useful resource', url: 'https://example.test', sourceExcerpt: 'https://example.test' },
  ], modelResponse: '{"items":[],"token":"keep-me-out-of-store"}' }), async () => { dispatches += 1; return { destinationId: 'dest' }; }, () => '2026-09-01T09:00:00.000Z');
  const capture = await service.createCapture({ rawText: 'Send the list by 2026-09-08. https://example.test', sourceType: 'selection' });
  await service.processCapture(capture.id);
  assert.equal((await service.getCapture(capture.id)).processingStatus, 'complete');
  assert.match((await service.getCapture(capture.id)).modelResponse || '', /"token":"\[REDACTED_SECRET\]"/);
  assert.equal((await service.listPending()).length, 2);
  assert.equal(dispatches, 0);
});

test('Bin cannot call a destination and Keep dispatches only the edited item', async () => {
  const store = new MemorySignalStore(); let dispatchedTitle = '';
  const service = new SignalService(store, async () => ({ items: [{ type: 'information', title: 'Reference', sourceExcerpt: 'Reference' }] }), async (item) => { dispatchedTitle = item.title; return { destinationId: 'note.md' }; }, () => '2026-09-01T09:00:00.000Z');
  const capture = await service.createCapture({ rawText: 'Reference' }); await service.processCapture(capture.id);
  const [item] = await service.listPending();
  await service.discardItem(item.id);
  assert.equal(dispatchedTitle, '');
  assert.equal((await service.listPending()).length, 0);
  const second = await service.createCapture({ rawText: 'Reference two' }); await service.processCapture(second.id);
  const [pending] = await service.listPending(); await service.updateItem(pending.id, { title: 'Corrected reference' });
  const done = await service.approveItem(pending.id);
  assert.equal(done.dispatchStatus, 'succeeded');
  assert.equal(dispatchedTitle, 'Corrected reference');
});

test('dismissing a zero-result capture keeps its record but removes it after refresh', async () => {
  const store = new MemorySignalStore(); let dispatches = 0;
  const service = new SignalService(store, async () => ({ items: [] }), async () => { dispatches += 1; return {}; }, () => '2026-09-01T09:00:00.000Z');
  const capture = await service.createCapture({ rawText: 'Nothing useful.' }); await service.processCapture(capture.id);
  assert.equal((await service.listReviewQueue()).length, 1);
  await service.dismissNoItemsCapture(capture.id);
  assert.equal((await service.getCapture(capture.id)).rawText, 'Nothing useful.');
  assert.ok((await service.getCapture(capture.id)).reviewAcknowledgedAt);
  const refreshedService = new SignalService(store, async () => ({ items: [] }), async () => { dispatches += 1; return {}; });
  assert.equal((await refreshedService.listReviewQueue()).length, 0);
  assert.equal(dispatches, 0);
});

test('undoing Bin restores edited pending items without dispatching, while after five seconds no Undo leaves them binned', async () => {
  const store = new MemorySignalStore(); let dispatches = 0;
  let now = Date.parse('2026-09-01T09:00:00.000Z');
  const service = new SignalService(store, async () => ({ items: [{ type: 'information', title: 'Original', summary: 'Before edit', sourceExcerpt: 'Original' }] }), async () => { dispatches += 1; return {}; }, () => new Date(now).toISOString());
  const capture = await service.createCapture({ rawText: 'Original' }); await service.processCapture(capture.id);
  const [item] = await service.listPending();
  await service.updateItem(item.id, { title: 'Edited title', summary: 'Edited summary' });
  await service.discardItem(item.id);
  assert.equal((await service.listPending()).length, 0);
  const restored = await service.undoDiscardItem(item.id);
  assert.equal(restored.reviewStatus, 'pending');
  assert.equal(restored.title, 'Edited title');
  assert.equal(restored.summary, 'Edited summary');
  assert.equal(dispatches, 0);
  await service.discardItem(item.id);
  now += 5_001;
  assert.equal((await service.getCapture(capture.id)).id, capture.id);
  assert.equal((await store.getItem(item.id))?.reviewStatus, 'discarded');
  assert.equal(dispatches, 0);
});

test('capture validation rejects malformed browser payloads', () => {
  assert.throws(() => validateSignalCapture({ rawText: '' }), /rawText/);
  assert.throws(() => validateSignalCapture({ rawText: 'ok', unexpected: true }), /unsupported/);
});

test('an exact source date survives on an event item', async () => {
  const store = new MemorySignalStore();
  const service = new SignalService(store, async () => ({ items: [{ type: 'event', title: 'Staff briefing', dueDate: '2026-09-12', allDay: true, sourceExcerpt: 'Staff briefing.' }] }), async () => ({}));
  const capture = await service.createCapture({ rawText: 'Staff briefing on 2026-09-12 in the main hall.' });
  await service.processCapture(capture.id);
  assert.equal((await service.listPending())[0].eventStart, '2026-09-12');
});

test('review queue distinguishes empty, no-items, and failed captures', async () => {
  const store = new MemorySignalStore(); let fail = false;
  const service = new SignalService(store, async () => { if (fail) throw new Error('model unavailable'); return { items: [] }; }, async () => ({}), () => '2026-09-01T09:00:00.000Z');
  assert.deepEqual(await service.listReviewQueue(), []);
  const noItems = await service.createCapture({ rawText: 'Nothing to keep here.', sourceType: 'paste' }); await service.processCapture(noItems.id);
  fail = true;
  const failed = await service.createCapture({ rawText: 'This processing fails.', sourceType: 'selection', sourceTitle: 'Example page' }); await service.processCapture(failed.id);
  const captures = (await service.listReviewQueue()).flatMap((entry) => entry.entryType === 'capture' ? [entry.capture] : []);
  assert.deepEqual(new Set(captures.map((capture) => capture.processingStatus)), new Set(['no_items', 'failed']));
  assert.equal(captures.find((capture) => capture.id === failed.id)?.processingError, 'processing_failed');
  assert.equal('rawText' in captures.find((capture) => capture.id === noItems.id)!, false);
});

test('Signal role and kind select one permitted queue destination', () => {
  const expectedRoots: Record<(typeof SIGNAL_ROLES)[number], string> = {
    Father: 'Fleeting Notes', Husband: 'Fleeting Notes', Christian: 'Fleeting Notes',
    'Head of Department': 'Academic Year 2026/School Notes', Teacher: 'Academic Year 2026/School Notes',
    'Business Owner': 'Fleeting Notes', Writer: 'Fleeting Notes', Reader: 'Fleeting Notes',
    'Aspiring School Leader': 'Academic Year 2026/School Notes',
  };
  for (const role of SIGNAL_ROLES) assert.equal(signalObsidianDestinationPath({ role, kind: 'Assessment' }), `${expectedRoots[role]}/Assessment.md`);
  assert.equal(signalObsidianDestinationPath({ kind: 'Assessment' }), 'Fleeting Notes/Assessment.md');
  assert.equal(signalObsidianDestinationPath({}), 'Fleeting Notes/Uncategorised.md');
});

test('Signal formats a Link with a blank line before the separator', () => {
  assert.equal(formatSignalObsidianEntry({ type: 'link', title: 'Ofqual guidance', summary: 'Read the new grade boundaries.', url: 'https://example.test/ofqual', role: 'Teacher', kind: 'Assessment', project: 'Year 11' }, { capturedAt: '2026-09-04T05:59:55.687Z', sourceUrl: 'https://www.facebook.com/' }), '## Ofqual guidance\nRead the new grade boundaries.\n[Ofqual guidance](https://example.test/ofqual)\nRole: Teacher | Kind: Assessment | Project: Year 11\nCaptured: 2026-09-04 from https://www.facebook.com/\n\n---\n');
});

test('Signal omits absent Link fields from its Markdown entry', () => {
  assert.equal(formatSignalObsidianEntry({ type: 'link', title: 'Reference' }, { capturedAt: '2026-09-04T05:59:55.687Z' }), '## Reference\nCaptured: 2026-09-04\n\n---\n');
});

test('Signal Keep queues one generic delivery and consecutive bodies remain separate', async () => {
  const store = new MemorySignalStore(); const queued: Array<{ destinationNotePath: string; renderedMarkdown: string }> = [];
  const queue = { async createGenericDelivery(input: { destinationNotePath: string; renderedMarkdown: string }) { queued.push(input); return { id: `reading_${queued.length}` }; } };
  const service = new SignalService(store, async () => ({ items: [{ type: 'link', title: 'First', summary: 'Summary', url: 'https://example.test/first', role: 'Teacher', kind: 'Assessment', sourceExcerpt: 'First' }, { type: 'information', title: 'Second', role: 'Teacher', kind: 'Assessment', sourceExcerpt: 'Second' }] }), (item, capture) => queueSignalObsidianDelivery(queue, item, capture), () => '2026-09-04T05:59:55.687Z');
  const capture = await service.createCapture({ rawText: 'First and Second', sourceUrl: 'https://example.test' }); await service.processCapture(capture.id);
  for (const item of await service.listPending()) await service.approveItem(item.id);
  assert.deepEqual(queued[0], { destinationNotePath: 'Academic Year 2026/School Notes/Assessment.md', renderedMarkdown: '## First\nSummary\n[First](https://example.test/first)\nRole: Teacher | Kind: Assessment\nCaptured: 2026-09-04 from https://example.test\n\n---\n' });
  assert.equal(queued[1].destinationNotePath, queued[0].destinationNotePath);
  assert.match(queued.map((entry) => entry.renderedMarkdown).join(''), /---\n## /);
  assert.ok(queued.every((entry) => entry.renderedMarkdown.endsWith('\n')));
});

test('Signal Bin never queues an Obsidian delivery', async () => {
  const store = new MemorySignalStore(); let queued = 0;
  const service = new SignalService(store, async () => ({ items: [{ type: 'information', title: 'Reference', sourceExcerpt: 'Reference' }] }), async () => { queued += 1; return { destinationId: 'reading_1' }; });
  const capture = await service.createCapture({ rawText: 'Reference' }); await service.processCapture(capture.id);
  await service.discardItem((await service.listPending())[0].id);
  assert.equal(queued, 0);
});

test('Signal date evidence accepts supported British wording', () => {
  assert.equal(sourceSupportsSignalDate('Staff briefing on 12 Sept 2026.', '2026-09-12', '2026-09-01T09:00:00.000Z'), true);
});

test('Signal drops a date with no source wording and marks it uncertain', async () => {
  const store = new MemorySignalStore();
  const service = new SignalService(store, async () => ({ items: [{ type: 'task', title: 'Staff briefing', dueDate: '2026-09-12', confidence: 0.9, sourceExcerpt: 'Staff briefing next week.' }] }), async () => ({}));
  const capture = await service.createCapture({ rawText: 'Staff briefing next week.' }); await service.processCapture(capture.id);
  const [item] = await service.listPending();
  assert.equal(item.dueDate, undefined);
  assert.equal(item.confidence, 0.49);
});

test('Signal date evidence rejects a mismatched weekday and date', () => {
  assert.equal(sourceSupportsSignalDate('Friday 12 September 2026.', '2026-09-12', '2026-09-01T09:00:00.000Z'), false);
});

test('Signal date evidence resolves relative wording from London capture time', () => {
  assert.equal(sourceSupportsSignalDate('Meet next Tuesday.', '2026-09-08', '2026-09-07T09:00:00.000Z'), true);
});

test('Signal date evidence uses British day-first numeric dates', () => {
  assert.equal(sourceSupportsSignalDate('Review on 12/09/2026.', '2026-09-12', '2026-09-01T09:00:00.000Z'), true);
  assert.equal(sourceSupportsSignalDate('Review on 12/09/2026.', '2026-12-09', '2026-09-01T09:00:00.000Z'), false);
});
