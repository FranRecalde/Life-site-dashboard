import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReadingBook, ReadingCapture } from '../../src/types';
import { DualReadingStore } from './dualReadingStore';
import { FirestoreReadingStore } from './firestoreReadingStore';
import { LocalReadingStore } from './localReadingStore';
import {
  CaptureCreateCommand,
  CaptureTransitionCommand,
  ReadingStore,
} from './types';

type DualWriteMethod =
  | 'createBook'
  | 'updateBook'
  | 'createCapture'
  | 'transitionCapture';

function rejectWrite(
  store: ReadingStore,
  method: DualWriteMethod,
): ReadingStore {
  return new Proxy(store, {
    get(target, property) {
      if (property === method) {
        return async () => {
          throw new Error(`simulated ${method} provider failure`);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

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

  async get(): Promise<{
    forEach: (callback: (snapshot: FakeDocumentSnapshot) => void) => void;
  }> {
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
  private readonly writes = new Map<
    string,
    { reference: FakeDocumentReference; value: unknown }
  >();

  constructor(private readonly database: FakeFirestore) {}

  async get(reference: FakeDocumentReference): Promise<FakeDocumentSnapshot> {
    const key = `${reference.collectionName}/${reference.id}`;
    const staged = this.writes.get(key);
    return staged
      ? new FakeDocumentSnapshot(reference.id, staged.value)
      : reference.get();
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
    this.writes.set(
      `${reference.collectionName}/${reference.id}`,
      { reference, value },
    );
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

  async runTransaction<T>(
    callback: (transaction: FakeTransaction) => Promise<T>,
  ): Promise<T> {
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

const makeBook = (overrides: Partial<ReadingBook> = {}): ReadingBook => ({
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
  ...overrides,
});

const makeCapture = (
  overrides: Partial<ReadingCapture> = {},
): ReadingCapture => ({
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
  markdownRenderVersion: 1,
  deliveryAttempts: { count: 0 },
  updatedAt: '2026-07-28T12:00:00.000Z',
  ...overrides,
});

const makeCreateCommand = (
  capture = makeCapture(),
): CaptureCreateCommand => ({ capture });

async function exerciseStore(store: ReadingStore): Promise<void> {
  const book = makeBook();
  await store.createBook(book);
  assert.deepStrictEqual(
    await store.createCapture(makeCreateCommand()),
    { outcome: 'created', capture: makeCapture() },
  );
  assert.deepStrictEqual(
    await store.createCapture(makeCreateCommand(makeCapture({
      id: 'reading_abcdefabcdefabcdefabcdefabcdefab',
      bookRevision: 2,
    }))),
    { outcome: 'book_revision_conflict' },
  );

  const claimed = makeCapture({
    status: 'claimed',
    claimedAt: '2026-07-28T12:01:00.000Z',
    deliveryAttempts: {
      count: 1,
      lastAttemptAt: '2026-07-28T12:01:00.000Z',
    },
    updatedAt: '2026-07-28T12:01:00.000Z',
  });
  const command: CaptureTransitionCommand = {
    captureId: claimed.id,
    expectedStatus: 'pending',
    expectedUpdatedAt: '2026-07-28T12:00:00.000Z',
    capture: claimed,
  };
  assert.deepStrictEqual(
    await store.transitionCapture(command),
    { outcome: 'updated', capture: claimed },
  );
  assert.deepStrictEqual(
    await store.transitionCapture(command),
    { outcome: 'state_conflict' },
  );
}

test('local ReadingStore persists simple queue records and drops legacy idempotency state', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-local-reading-'));
  const stateFile = path.join(directory, 'reading.json');
  try {
    fs.writeFileSync(stateFile, JSON.stringify({
      version: 1,
      books: [],
      captures: [{
        ...makeCapture({
          id: 'reading_ffffffffffffffffffffffffffffffff',
          originalText: 'Legacy words',
        }),
        status: 'needs_attention',
        payloadHash: 'legacy-hash',
        deliveryLease: {
          leaseId: 'legacy',
          ownerId: 'legacy',
          acquiredAt: '2026-07-28T12:00:00.000Z',
          expiresAt: '2026-07-28T12:05:00.000Z',
        },
      }],
      idempotency: { legacy: { payloadHash: 'x', captureId: 'old' } },
    }));
    const store = new LocalReadingStore(stateFile);
    await exerciseStore(store);
    const reloaded = new LocalReadingStore(stateFile);
    const captures = await reloaded.listCaptures();
    assert.strictEqual(captures.length, 2);
    const legacy = captures.find((capture) => capture.originalText === 'Legacy words');
    assert.strictEqual(legacy?.status, 'done');
    assert.strictEqual('payloadHash' in (legacy ?? {}), false);
    assert.strictEqual('deliveryLease' in (legacy ?? {}), false);
    assert.strictEqual(fs.readFileSync(stateFile, 'utf8').includes('idempotency'), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Firestore ReadingStore creates only book and capture records', async () => {
  const database = new FakeFirestore();
  await exerciseStore(new FirestoreReadingStore(database as any));
  assert.strictEqual(database.entries('reading_captures').length, 1);
  assert.strictEqual(database.entries('reading_idempotency').length, 0);
});

test('ReadingStore rejects missing and inactive books without creating captures', async () => {
  for (const store of [
    new LocalReadingStore(path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-book-check-local-')),
      'reading.json',
    )),
    new FirestoreReadingStore(new FakeFirestore() as any),
  ]) {
    assert.deepStrictEqual(
      await store.createCapture(makeCreateCommand()),
      { outcome: 'book_not_found' },
    );
    await store.createBook(makeBook({ status: 'archived' }));
    assert.deepStrictEqual(
      await store.createCapture(makeCreateCommand()),
      { outcome: 'book_inactive' },
    );
  }
});

test('dual ReadingStore writes the same simple queue state to both providers', async () => {
  const firstDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-dual-1-'));
  const secondDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-dual-2-'));
  try {
    const local = new LocalReadingStore(path.join(firstDirectory, 'reading.json'));
    const mirror = new LocalReadingStore(path.join(secondDirectory, 'reading.json'));
    const dual = new DualReadingStore(local, mirror);
    await exerciseStore(dual);
    assert.deepStrictEqual(await local.listBooks(), await mirror.listBooks());
    assert.deepStrictEqual(await local.listCaptures(), await mirror.listCaptures());
  } finally {
    fs.rmSync(firstDirectory, { recursive: true, force: true });
    fs.rmSync(secondDirectory, { recursive: true, force: true });
  }
});

test('dual ReadingStore fails closed when either capture write rejects', async () => {
  for (const failingProvider of ['local', 'mirror'] as const) {
    const firstDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-dual-fail-1-'));
    const secondDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-dual-fail-2-'));
    try {
      const local = new LocalReadingStore(path.join(firstDirectory, 'reading.json'));
      const mirror = new LocalReadingStore(path.join(secondDirectory, 'reading.json'));
      await Promise.all([local.createBook(makeBook()), mirror.createBook(makeBook())]);
      const dual = new DualReadingStore(
        failingProvider === 'local' ? rejectWrite(local, 'createCapture') : local,
        failingProvider === 'mirror' ? rejectWrite(mirror, 'createCapture') : mirror,
      );
      await assert.rejects(
        () => dual.createCapture(makeCreateCommand()),
        /capture creation provider failure/,
      );
    } finally {
      fs.rmSync(firstDirectory, { recursive: true, force: true });
      fs.rmSync(secondDirectory, { recursive: true, force: true });
    }
  }
});

test('book revisions still use atomic expected values', async () => {
  const store = new FirestoreReadingStore(new FakeFirestore() as any);
  const book = makeBook();
  await store.createBook(book);
  assert.deepStrictEqual(
    await store.updateBook(book.id, 2, { ...book, revision: 2 }),
    { outcome: 'revision_conflict' },
  );
});
