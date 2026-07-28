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
  CaptureTransitionCommand,
  IdempotentCaptureCreateCommand,
  ReadingStore,
} from './types';
import { hashReadingIdempotencyIdentity } from '../reading/readingService';

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

const RAW_IDEMPOTENCY_KEY = 'raw-key-that-must-never-be-persisted';

const makeCapture = (
  id = 'reading_1234567890abcdef1234567890abcdef',
  originalText = 'Exact words',
): ReadingCapture => ({
  id,
  bookId: 'book_1',
  bookRevision: 1,
  bookTitle: 'Book',
  bookAuthor: 'Author',
  bookTags: ['reading'],
  destinationNotePath: 'Literature notes/Book — Author.md',
  originalText,
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

const makeCommand = (
  capture = makeCapture(),
  rawKey = RAW_IDEMPOTENCY_KEY,
): IdempotentCaptureCreateCommand => ({
  idempotencyKeyHash: hashReadingIdempotencyIdentity('life_site', rawKey),
  payloadHash: capture.payloadHash,
  capture,
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

function makeLeaseTransition(
  current: ReadingCapture,
  leaseId: string,
): CaptureTransitionCommand {
  return {
    captureId: current.id,
    expectedStatus: 'pending',
    leaseGuard: { kind: 'none' },
    capture: {
      ...current,
      status: 'in_progress',
      deliveryAttempts: {
        count: current.deliveryAttempts.count + 1,
        lastAttemptAt: '2026-07-28T12:00:00.000Z',
      },
      deliveryLease: {
        leaseId,
        ownerId: 'future-bridge',
        acquiredAt: '2026-07-28T12:00:00.000Z',
        expiresAt: '2026-07-28T12:05:00.000Z',
      },
      updatedAt: '2026-07-28T12:00:00.000Z',
    },
  };
}

async function assertRejectedWithoutMutation(
  store: ReadingStore,
  command: CaptureTransitionCommand,
  expectedOutcome: 'lease_conflict' | 'lease_expired' | 'lease_not_expired',
): Promise<void> {
  const before = await store.getCapture(command.captureId);
  const result = await store.transitionCapture(command);
  assert.deepStrictEqual(result, { outcome: expectedOutcome });
  assert.deepStrictEqual(await store.getCapture(command.captureId), before);
}

async function exerciseLeaseGuards(store: ReadingStore): Promise<void> {
  await store.createBook(makeBook());
  const capture = makeCapture();
  assert.strictEqual(
    (await store.createCaptureIdempotently(makeCommand(capture))).outcome,
    'created',
  );

  const claims = await Promise.all([
    store.transitionCapture(makeLeaseTransition(capture, 'lease_a')),
    store.transitionCapture(makeLeaseTransition(capture, 'lease_b')),
  ]);
  assert.strictEqual(
    claims.filter((result) => result.outcome === 'updated').length,
    1,
  );
  assert.strictEqual(
    claims.filter((result) => result.outcome === 'state_conflict').length,
    1,
  );

  const claimed = (await store.getCapture(capture.id))!;
  const currentLeaseId = claimed.deliveryLease!.leaseId;
  const deliveredCapture: ReadingCapture = {
    ...claimed,
    status: 'delivered',
    deliveryLease: undefined,
    deliveredAt: '2026-07-28T12:04:00.000Z',
    updatedAt: '2026-07-28T12:04:00.000Z',
  };

  await assertRejectedWithoutMutation(
    store,
    {
      captureId: capture.id,
      expectedStatus: 'in_progress',
      leaseGuard: {
        kind: 'current',
        leaseId: '',
        observedAt: '2026-07-28T12:04:00.000Z',
      },
      capture: deliveredCapture,
    },
    'lease_conflict',
  );
  await assertRejectedWithoutMutation(
    store,
    {
      captureId: capture.id,
      expectedStatus: 'in_progress',
      leaseGuard: {
        kind: 'current',
        leaseId: 'wrong_lease',
        observedAt: '2026-07-28T12:04:00.000Z',
      },
      capture: deliveredCapture,
    },
    'lease_conflict',
  );
  await assertRejectedWithoutMutation(
    store,
    {
      captureId: capture.id,
      expectedStatus: 'in_progress',
      leaseGuard: {
        kind: 'expired',
        leaseId: currentLeaseId,
        observedAt: '2026-07-28T12:04:59.999Z',
      },
      capture: { ...claimed, status: 'pending', deliveryLease: undefined },
    },
    'lease_not_expired',
  );
  await assertRejectedWithoutMutation(
    store,
    {
      captureId: capture.id,
      expectedStatus: 'in_progress',
      leaseGuard: {
        kind: 'current',
        leaseId: currentLeaseId,
        observedAt: '2026-07-28T12:05:00.000Z',
      },
      capture: deliveredCapture,
    },
    'lease_expired',
  );
  await assertRejectedWithoutMutation(
    store,
    {
      captureId: capture.id,
      expectedStatus: 'in_progress',
      leaseGuard: {
        kind: 'current',
        leaseId: currentLeaseId,
        observedAt: '2026-07-28T12:05:00.000Z',
      },
      capture: {
        ...claimed,
        status: 'needs_attention',
        deliveryLease: undefined,
        deliveryAttempts: {
          ...claimed.deliveryAttempts,
          lastErrorCode: 'APPEND_FAILED',
        },
      },
    },
    'lease_expired',
  );

  const recoveredCapture: ReadingCapture = {
    ...claimed,
    status: 'pending',
    deliveryLease: undefined,
    updatedAt: '2026-07-28T12:05:00.000Z',
  };
  const recovery = await store.transitionCapture({
    captureId: capture.id,
    expectedStatus: 'in_progress',
    leaseGuard: {
      kind: 'expired',
      leaseId: currentLeaseId,
      observedAt: '2026-07-28T12:05:00.000Z',
    },
    capture: recoveredCapture,
  });
  assert.strictEqual(recovery.outcome, 'updated');

  const secondClaimCommand = makeLeaseTransition(recoveredCapture, 'lease_new');
  secondClaimCommand.capture.deliveryLease!.expiresAt =
    '2026-07-28T12:15:00.000Z';
  const secondClaim = await store.transitionCapture(secondClaimCommand);
  assert.strictEqual(secondClaim.outcome, 'updated');
  await assertRejectedWithoutMutation(
    store,
    {
      captureId: capture.id,
      expectedStatus: 'in_progress',
      leaseGuard: {
        kind: 'expired',
        leaseId: currentLeaseId,
        observedAt: '2026-07-28T12:20:00.000Z',
      },
      capture: recoveredCapture,
    },
    'lease_conflict',
  );

  const current = (await store.getCapture(capture.id))!;
  const delivered = await store.transitionCapture({
    captureId: capture.id,
    expectedStatus: 'in_progress',
    leaseGuard: {
      kind: 'current',
      leaseId: 'lease_new',
      observedAt: '2026-07-28T12:10:00.000Z',
    },
    capture: {
      ...current,
      status: 'delivered',
      deliveryLease: undefined,
      deliveredAt: '2026-07-28T12:10:00.000Z',
    },
  });
  assert.strictEqual(delivered.outcome, 'updated');

  const failureCapture = makeCapture(
    'reading_fedcba0987654321fedcba0987654321',
    'Failure path',
  );
  assert.strictEqual(
    (
      await store.createCaptureIdempotently(
        makeCommand(failureCapture, 'failure-path-key'),
      )
    ).outcome,
    'created',
  );
  const failureClaim = makeLeaseTransition(failureCapture, 'lease_failure');
  assert.strictEqual(
    (await store.transitionCapture(failureClaim)).outcome,
    'updated',
  );
  const needsAttention: ReadingCapture = {
    ...failureClaim.capture,
    status: 'needs_attention',
    deliveryLease: undefined,
    deliveryAttempts: {
      ...failureClaim.capture.deliveryAttempts,
      lastErrorCode: 'APPEND_FAILED',
    },
  };
  assert.strictEqual(
    (
      await store.transitionCapture({
        captureId: failureCapture.id,
        expectedStatus: 'in_progress',
        leaseGuard: {
          kind: 'current',
          leaseId: 'lease_failure',
          observedAt: '2026-07-28T12:04:00.000Z',
        },
        capture: needsAttention,
      })
    ).outcome,
    'updated',
  );
  const retried = await store.transitionCapture({
    captureId: failureCapture.id,
    expectedStatus: 'needs_attention',
    leaseGuard: { kind: 'none' },
    capture: {
      ...needsAttention,
      status: 'pending',
      deliveryLease: undefined,
      deliveryAttempts: {
        ...needsAttention.deliveryAttempts,
        lastErrorCode: undefined,
      },
    },
  });
  assert.strictEqual(retried.outcome, 'updated');
  if (retried.outcome === 'updated') {
    assert.strictEqual(retried.capture.deliveryLease, undefined);
    assert.strictEqual(retried.capture.deliveryAttempts.lastErrorCode, undefined);
  }
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
    assert.ok(!fs.readFileSync(stateFile, 'utf8').includes(RAW_IDEMPOTENCY_KEY));
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
  assert.ok(
    !JSON.stringify(database.entries('reading_idempotency'))
      .includes(RAW_IDEMPOTENCY_KEY),
  );
});

test('ReadingStore revisions use atomic expected values', async () => {
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

});

test('local ReadingStore enforces lease guards atomically', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-local-leases-'));
  try {
    await exerciseLeaseGuards(
      new LocalReadingStore(path.join(directory, 'reading.json')),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Firestore ReadingStore enforces lease guards atomically', async () => {
  await exerciseLeaseGuards(new FirestoreReadingStore(new FakeFirestore() as any));
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

    const capture = (await dual.listCaptures())[0];
    const claim = makeLeaseTransition(capture, 'dual_lease');
    assert.strictEqual((await dual.transitionCapture(claim)).outcome, 'updated');
    const confirmation: CaptureTransitionCommand = {
      captureId: capture.id,
      expectedStatus: 'in_progress',
      leaseGuard: {
        kind: 'current',
        leaseId: 'dual_lease',
        observedAt: '2026-07-28T12:04:00.000Z',
      },
      capture: {
        ...claim.capture,
        status: 'delivered',
        deliveryLease: undefined,
        deliveredAt: '2026-07-28T12:04:00.000Z',
      },
    };
    assert.strictEqual(
      (await dual.transitionCapture(confirmation)).outcome,
      'updated',
    );
    assert.deepStrictEqual(
      await local.getCapture(capture.id),
      await firestoreEquivalent.getCapture(capture.id),
    );
  } finally {
    fs.rmSync(firstDirectory, { recursive: true, force: true });
    fs.rmSync(secondDirectory, { recursive: true, force: true });
  }
});

test('dual ReadingStore fails closed when lease transition outcomes diverge', async () => {
  const firstDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-dual-diverge-1-'));
  const secondDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-dual-diverge-2-'));
  try {
    const local = new LocalReadingStore(path.join(firstDirectory, 'reading.json'));
    const firestoreEquivalent = new LocalReadingStore(
      path.join(secondDirectory, 'reading.json'),
    );
    for (const store of [local, firestoreEquivalent]) {
      await store.createBook(makeBook());
      await store.createCaptureIdempotently(makeCommand());
    }

    const capture = makeCapture();
    await firestoreEquivalent.transitionCapture(
      makeLeaseTransition(capture, 'provider_specific_lease'),
    );
    const dual = new DualReadingStore(local, firestoreEquivalent);
    await assert.rejects(
      () => dual.transitionCapture(makeLeaseTransition(capture, 'dual_lease')),
      /capture transition divergence detected/,
    );
    assert.notDeepStrictEqual(
      await local.getCapture(capture.id),
      await firestoreEquivalent.getCapture(capture.id),
    );
  } finally {
    fs.rmSync(firstDirectory, { recursive: true, force: true });
    fs.rmSync(secondDirectory, { recursive: true, force: true });
  }
});
