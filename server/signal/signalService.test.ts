import assert from 'node:assert/strict';
import test from 'node:test';
import { SignalCapture, SignalItem } from '../../src/types';
import { SignalStore } from '../storage/signalStore';
import { SignalService, validateSignalCapture } from './signalService';

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
