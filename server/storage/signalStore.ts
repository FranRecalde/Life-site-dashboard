import fs from 'fs';
import path from 'path';
import { Firestore } from '@google-cloud/firestore';
import { SignalCapture, SignalItem } from '../../src/types';

export interface SignalStore {
  createCapture(capture: SignalCapture): Promise<void>;
  getCapture(id: string): Promise<SignalCapture | null>;
  updateCapture(capture: SignalCapture): Promise<void>;
  createItems(items: SignalItem[]): Promise<void>;
  getItem(id: string): Promise<SignalItem | null>;
  updateItem(item: SignalItem): Promise<void>;
  listPendingItems(limit: number): Promise<SignalItem[]>;
  listReviewCaptures(limit: number): Promise<SignalCapture[]>;
}

interface LocalSignalState { version: 1; captures: SignalCapture[]; items: SignalItem[]; }
const emptyState = (): LocalSignalState => ({ version: 1, captures: [], items: [] });
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class LocalSignalStore implements SignalStore {
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly stateFile: string) {}
  private async locked<T>(fn: () => T | Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.tail = previous.then(() => current, () => current);
    await previous.catch(() => undefined);
    try { return await fn(); } finally { release(); }
  }
  private read(): LocalSignalState {
    if (!fs.existsSync(this.stateFile)) return emptyState();
    const value = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) as LocalSignalState;
    if (value.version !== 1 || !Array.isArray(value.captures) || !Array.isArray(value.items)) throw new Error('Signal store state is invalid.');
    return value;
  }
  private write(state: LocalSignalState): void {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    const temp = `${this.stateFile}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(temp, this.stateFile);
  }
  async createCapture(capture: SignalCapture): Promise<void> { await this.locked(() => { const s = this.read(); if (s.captures.some((x) => x.id === capture.id)) throw new Error('Signal capture ID exists.'); s.captures.push(clone(capture)); this.write(s); }); }
  async getCapture(id: string): Promise<SignalCapture | null> { return this.locked(() => clone(this.read().captures.find((x) => x.id === id) ?? null)); }
  async updateCapture(capture: SignalCapture): Promise<void> { await this.locked(() => { const s = this.read(); const i = s.captures.findIndex((x) => x.id === capture.id); if (i < 0) throw new Error('Signal capture not found.'); s.captures[i] = clone(capture); this.write(s); }); }
  async createItems(items: SignalItem[]): Promise<void> { await this.locked(() => { const s = this.read(); for (const item of items) { if (s.items.some((x) => x.id === item.id)) throw new Error('Signal item ID exists.'); s.items.push(clone(item)); } this.write(s); }); }
  async getItem(id: string): Promise<SignalItem | null> { return this.locked(() => clone(this.read().items.find((x) => x.id === id) ?? null)); }
  async updateItem(item: SignalItem): Promise<void> { await this.locked(() => { const s = this.read(); const i = s.items.findIndex((x) => x.id === item.id); if (i < 0) throw new Error('Signal item not found.'); s.items[i] = clone(item); this.write(s); }); }
  async listPendingItems(limit: number): Promise<SignalItem[]> { return this.locked(() => clone(this.read().items.filter((x) => x.reviewStatus === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit))); }
  async listReviewCaptures(limit: number): Promise<SignalCapture[]> { return this.locked(() => clone(this.read().captures.filter((x) => x.processingStatus === 'failed' || (x.processingStatus === 'no_items' && !x.reviewAcknowledgedAt)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit))); }
}

export class FirestoreSignalStore implements SignalStore {
  private readonly captures = 'signal_captures';
  private readonly items = 'signal_items';
  constructor(private readonly db: Firestore) {}
  async createCapture(capture: SignalCapture): Promise<void> { await this.db.collection(this.captures).doc(capture.id).create(clone(capture)); }
  async getCapture(id: string): Promise<SignalCapture | null> { const s = await this.db.collection(this.captures).doc(id).get(); return s.exists ? s.data() as SignalCapture : null; }
  async updateCapture(capture: SignalCapture): Promise<void> { await this.db.collection(this.captures).doc(capture.id).set(clone(capture)); }
  async createItems(items: SignalItem[]): Promise<void> { const batch = this.db.batch(); items.forEach((item) => batch.create(this.db.collection(this.items).doc(item.id), clone(item))); await batch.commit(); }
  async getItem(id: string): Promise<SignalItem | null> { const s = await this.db.collection(this.items).doc(id).get(); return s.exists ? s.data() as SignalItem : null; }
  async updateItem(item: SignalItem): Promise<void> { await this.db.collection(this.items).doc(item.id).set(clone(item)); }
  async listPendingItems(limit: number): Promise<SignalItem[]> { const s = await this.db.collection(this.items).where('reviewStatus', '==', 'pending').orderBy('createdAt', 'desc').limit(limit).get(); return s.docs.map((d) => d.data() as SignalItem); }
  async listReviewCaptures(limit: number): Promise<SignalCapture[]> {
    const read = async (status: 'failed' | 'no_items') => (await this.db.collection(this.captures).where('processingStatus', '==', status).orderBy('createdAt', 'desc').limit(limit).get()).docs.map((d) => d.data() as SignalCapture);
    return (await Promise.all([read('failed'), read('no_items')])).flat().filter((capture) => capture.processingStatus !== 'no_items' || !capture.reviewAcknowledgedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
}

export class DualSignalStore implements SignalStore {
  constructor(private readonly local: SignalStore, private readonly firestore: SignalStore) {}
  private async both(operation: (store: SignalStore) => Promise<void>): Promise<void> { const r = await Promise.allSettled([operation(this.local), operation(this.firestore)]); if (r.some((x) => x.status === 'rejected')) throw new Error('Signal storage provider failure.'); }
  createCapture(c: SignalCapture) { return this.both((s) => s.createCapture(c)); }
  getCapture(id: string) { return this.firestore.getCapture(id).catch(() => this.local.getCapture(id)); }
  updateCapture(c: SignalCapture) { return this.both((s) => s.updateCapture(c)); }
  createItems(items: SignalItem[]) { return this.both((s) => s.createItems(items)); }
  getItem(id: string) { return this.firestore.getItem(id).catch(() => this.local.getItem(id)); }
  updateItem(item: SignalItem) { return this.both((s) => s.updateItem(item)); }
  listPendingItems(limit: number) { return this.firestore.listPendingItems(limit).catch(() => this.local.listPendingItems(limit)); }
  listReviewCaptures(limit: number) { return this.firestore.listReviewCaptures(limit).catch(() => this.local.listReviewCaptures(limit)); }
}
