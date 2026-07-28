import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReadingBook, ReadingCapture } from '../../src/types';
import { DualReadingStore } from './dualReadingStore';
import { FirestoreReadingStore } from './firestoreReadingStore';
import { LocalReadingStore } from './localReadingStore';
import { IdempotentCaptureCreateCommand, ReadingStore } from './types';

class FakeDocumentSnapshot {
  constructor(
    readonly id: string,
    private readonly value: unknown,
  ) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): unknown {
    return this.value === undefined
      ? undefined
      : JSON.parse(JSON.stringify(this.value));
  }
}

class FakeDocumentReference {
  constructor(
    readonly collectionName: string,
    readonly id: string,
    private readonly database: FakeFirestore,
  ) {}

  async get(): Promise<FakeDocumentSnapshot> {
    return new FakeDocumentSnapshot(
      this.id,
      this.database.read(this.collectionName, this.id),
    );
  }

  async create(value: unknown): Promise<void> {
    if (this.database.read(this.collectionName, this.id) !== undefined) {
      throw new Error('already exists');
    }
    this.database.write(this.collectionName, this.id, value);
  }
}

class FakeCollectionReference {
  constructor(
    private readonly name: string,
    private readonly database: FakeFirestore,
  ) {}

  doc(id: string): FakeDocumentReference {
    return new FakeDocumentReference(this.name, id, this.database);
  }

  async get(): Promise<{ forEach: (callback: (snapshot: FakeDocumentSnapshot) => void) => void }> {
    const documents = this.database.entries(this.name);
    return {
      forEach: (callback) => {
        for (const [id, value] of documents) {
          callback(new FakeDocumentSnapshot(id, value));
        }
      },
    };
  }
}

class FakeTransaction {
  private readonly writes = new Map<string, { reference: FakeDocumentReference; value: unknown }>();

  constructor(private readonly database: FakeFirestore) {}

  async get(reference: FakeDocumentReference): Promise<FakeDocumentSnapshot> {
    const key = `${reference.collectionName}/${reference.id}`;
    const staged = this.writes.get(key);
    if (staged) return new FakeDocumentSnapshot(reference.id, staged.value);
    return reference.get();
  }

  create(reference: FakeDocumentReference, value: unknown): void {
    const key = `${reference.collectionName}/${reference.id}`;
    if (
      this.writes.has(key) ||
      this.database.read(reference.collectionName, reference.id) !== undefined
    ) {
      throw new Error('already exists');
    }
    this.writes.set(key, { reference, value });
  }

  set(reference: FakeDocumentReference, value: unknown): void {
    const key = `${reference.collectionName}/${reference.id}`;
    this.writes.set(key, { reference, value });
  }

  commit(): void {
    for (const { reference, value } of this.writes.values()) {
      this.database.write(reference.collectionName, reference.id, value);
    }
  }
}

class FakeFirestore {
  private readonly collections = new Map<string, Map<string, unknown>>();
  private transactionTail: Promise<void> = Promise.resolve();

  collection(name: string): FakeCollectionReference {
    return new FakeCollectionReference(name, this);
  }

  read(collection: string, id: string): unknown {
    const value = this.collections.get(collection)?.get(id);
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  write(collection: string, id: string, value: unknown): void {
    let records = this.collections.get(collection);
    if (!records) {
      records = new Map();
      this.collections.set(collection, records);
    }
    records.set(id, JSON.parse(JSON.stringify(value)));
  }

  entries(collection: string): Array<[string, unknown]> {
    return [...(this.collections.get(collection)?.entries() ?? [])]
      .map(([id, value]) => [id, JSON.parse(JSON.stringify(value))]);
  }

  async runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    const previous = this.transactionTail;
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.transactionTail = previous.then(() => current, () => current);
    await previous.catch(() => undefined);
    try {
      const transaction = new FakeTransaction(this);
      const result = await callback(transaction);
      transaction.commit();
      return result;
    } finally {
      release();
    }
  }
}

const makeBook = (): ReadingBook => ({
  id: 'book_1',
  title: 'Book',
  author: 'Author',
  destinationNotePath: 'Literature notes/Book — Author.md',
  tags: ['reading'],
  defaultSource: 'physical',
  status: 'active',
  revision: 1,
  createdAt: '2026-07-28T12:00:00.000Z',
  updatedAt: '2026-07-28T12:00:00.000Z',
});

const makeCapture = (): ReadingCapture => ({
  id: 'reading_1234567890abcdef1234567890abcdef',
  bookId: 'book_1',
  bookRevision: 1,
  bookTitle: 'Book',
  bookAuthor: 'Author',
  bookTags: ['reading'],
  destinationNotePath: 'Literature notes/Book — Author.md',
  originalText: 'Exact words',
  captureType: 'thought',
  source: 'physical',
  capturedAt: '2026-07-28T12:00:00.000Z',
  receivedAt: '2026-07-28T12:00:00.000Z',
  creatorType: 'life_site',
  status: 'pending',
  payloadHash: 'a'.repeat(64),
  markdownRenderVersion: 1,
  deliveryAttempts: { count: 0 },
  updatedAt: '2026-07-28T12:00:00.000Z',
});

const makeCommand = (): IdempotentCaptureCreateCommand => ({
  idempotencyKeyHash: 'b'.repeat(64),
  payloadHash: 'a'.repeat(64),
  capture: makeCapture(),
});

async function exerciseIdempotency(store: ReadingStore): Promise<void> {
  await store.createBook(makeBook());
  const command = makeCommand();
  const concurrent = await Promise.all(
    Array.from({ length: 10 }, () => store.createCaptureIdempotently(command)),
  );
  assert.strictEqual(
    concurrent.filter((result) => result.outcome === 'created').length,
    1,
  );
  assert.strictEqual(
    concurrent.filter((result) => result.outcome === 'replayed').length,
    9,
  );
  assert.strictEqual((await store.listCaptures()).length, 1);

  const conflict = await store.createCaptureIdempotently({
    ...command,
    payloadHash: 'c'.repeat(64),
    capture: {
      ...command.capture,
      originalText: 'Different words',
      payloadHash: 'c'.repeat(64),
    },
  });
  assert.deepStrictEqual(conflict, { outcome: 'conflict' });
}

test('local ReadingStore persists and enforces concurrent idempotency', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-local-reading-'));
  const stateFile = path.join(directory, 'reading.json');
  try {
    const store = new LocalReadingStore(stateFile);
    await exerciseIdempotency(store);
    const reloaded = new LocalReadingStore(stateFile);
    assert.strictEqual((await reloaded.listBooks()).length, 1);
    assert.strictEqual((await reloaded.listCaptures()).length, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Firestore ReadingStore transaction matches local idempotency behavior', async () => {
  const database = new FakeFirestore();
  const store = new FirestoreReadingStore(database as any);
  await exerciseIdempotency(store);
  assert.strictEqual(database.entries('reading_captures').length, 1);
  assert.strictEqual(database.entries('reading_idempotency').length, 1);
});

test('ReadingStore revisions and state transitions use atomic expected values', async () => {
  const database = new FakeFirestore();
  const store = new FirestoreReadingStore(database as any);
  const book = makeBook();
  await store.createBook(book);
  const revisionConflict = await store.updateBook(
    book.id,
    2,
    { ...book, revision: 2 },
  );
  assert.deepStrictEqual(revisionConflict, { outcome: 'revision_conflict' });

  const created = await store.createCaptureIdempotently(makeCommand());
  assert.strictEqual(created.outcome, 'created');
  const capture = makeCapture();
  const transition = await store.transitionCapture({
    captureId: capture.id,
    expectedStatus: 'pending',
    capture: { ...capture, status: 'in_progress' },
  });
  assert.strictEqual(transition.outcome, 'updated');
  const staleTransition = await store.transitionCapture({
    captureId: capture.id,
    expectedStatus: 'pending',
    capture: { ...capture, status: 'needs_attention' },
  });
  assert.deepStrictEqual(staleTransition, { outcome: 'state_conflict' });
});

test('dual ReadingStore writes identical records to local and Firestore stores', async () => {
  const firstDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-dual-reading-1-'));
  const secondDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-dual-reading-2-'));
  try {
    const local = new LocalReadingStore(path.join(firstDirectory, 'reading.json'));
    const firestoreEquivalent = new LocalReadingStore(
      path.join(secondDirectory, 'reading.json'),
    );
    const dual = new DualReadingStore(local, firestoreEquivalent);
    await exerciseIdempotency(dual);
    assert.deepStrictEqual(await local.listBooks(), await firestoreEquivalent.listBooks());
    assert.deepStrictEqual(
      await local.listCaptures(),
      await firestoreEquivalent.listCaptures(),
    );
  } finally {
    fs.rmSync(firstDirectory, { recursive: true, force: true });
    fs.rmSync(secondDirectory, { recursive: true, force: true });
  }
});
