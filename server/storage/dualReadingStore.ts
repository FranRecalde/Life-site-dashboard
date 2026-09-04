import { GenericDelivery, ReadingBook, ReadingCapture, ReadingCaptureListFilter, ReadingQueueEntry } from '../../src/types';
import {
  CaptureCreateCommand,
  CaptureCreateResult,
  CaptureTransitionCommand,
  CaptureTransitionResult,
  ReadingBookUpdateResult,
  ReadingStore,
} from './types';

function sameRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireBothProviderResults<T>(
  results: [
    PromiseSettledResult<T>,
    PromiseSettledResult<T>,
  ],
  operation: string,
): [T, T] {
  const [localResult, firestoreResult] = results;
  if (
    localResult.status === 'rejected' ||
    firestoreResult.status === 'rejected'
  ) {
    throw new Error(`DualReadingStore ${operation} provider failure.`);
  }
  return [localResult.value, firestoreResult.value];
}

function mergeRecords<T extends { id: string }>(
  localRecords: T[],
  firestoreRecords: T[],
  label: string,
): T[] {
  const merged = new Map(localRecords.map((record) => [record.id, record]));
  for (const record of firestoreRecords) {
    const local = merged.get(record.id);
    if (local && !sameRecord(local, record)) {
      throw new Error(`DualReadingStore ${label} divergence detected.`);
    }
    merged.set(record.id, record);
  }
  return [...merged.values()];
}

export class DualReadingStore implements ReadingStore {
  constructor(
    private readonly local: ReadingStore,
    private readonly firestore: ReadingStore,
  ) {}

  async listBooks(options?: { includeArchived?: boolean }): Promise<ReadingBook[]> {
    const [localResult, firestoreResult] = await Promise.allSettled([
      this.local.listBooks(options),
      this.firestore.listBooks(options),
    ]);
    if (localResult.status === 'rejected' && firestoreResult.status === 'rejected') {
      throw new Error('Both ReadingStore providers failed to list books.');
    }
    if (localResult.status === 'rejected') return firestoreResult.status === 'fulfilled' ? firestoreResult.value : [];
    if (firestoreResult.status === 'rejected') return localResult.value;
    return mergeRecords(localResult.value, firestoreResult.value, 'book')
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async getBook(id: string): Promise<ReadingBook | null> {
    const [localResult, firestoreResult] = await Promise.allSettled([
      this.local.getBook(id),
      this.firestore.getBook(id),
    ]);
    if (localResult.status === 'rejected' && firestoreResult.status === 'rejected') {
      throw new Error('Both ReadingStore providers failed to get a book.');
    }
    if (localResult.status === 'rejected') {
      return firestoreResult.status === 'fulfilled' ? firestoreResult.value : null;
    }
    if (firestoreResult.status === 'rejected') return localResult.value;
    if (
      localResult.value &&
      firestoreResult.value &&
      !sameRecord(localResult.value, firestoreResult.value)
    ) {
      throw new Error('DualReadingStore book divergence detected.');
    }
    return firestoreResult.value ?? localResult.value;
  }

  async createBook(book: ReadingBook): Promise<ReadingBook> {
    const results = await Promise.allSettled([
      this.local.createBook(book),
      this.firestore.createBook(book),
    ]);
    const values = requireBothProviderResults(results, 'book creation');
    if (values.some((value) => !sameRecord(value, book))) {
      throw new Error('DualReadingStore book creation divergence detected.');
    }
    return book;
  }

  async updateBook(
    id: string,
    expectedRevision: number,
    book: ReadingBook,
  ): Promise<ReadingBookUpdateResult> {
    const results = await Promise.allSettled([
      this.local.updateBook(id, expectedRevision, book),
      this.firestore.updateBook(id, expectedRevision, book),
    ]);
    const values = requireBothProviderResults(results, 'book update');
    if (!sameRecord(values[0], values[1])) {
      throw new Error('DualReadingStore book update divergence detected.');
    }
    return values[0];
  }

  async listCaptures(filter?: ReadingCaptureListFilter): Promise<ReadingCapture[]> {
    const [localResult, firestoreResult] = await Promise.allSettled([
      this.local.listCaptures(filter),
      this.firestore.listCaptures(filter),
    ]);
    if (localResult.status === 'rejected' && firestoreResult.status === 'rejected') {
      throw new Error('Both ReadingStore providers failed to list captures.');
    }
    if (localResult.status === 'rejected') {
      return firestoreResult.status === 'fulfilled' ? firestoreResult.value : [];
    }
    if (firestoreResult.status === 'rejected') return localResult.value;
    return mergeRecords(localResult.value, firestoreResult.value, 'capture')
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .slice(0, filter?.limit ?? 100);
  }

  async listCapturesForDelivery(
    status: 'pending' | 'claimed',
  ): Promise<ReadingQueueEntry[]> {
    const results = await Promise.allSettled([
      this.local.listCapturesForDelivery(status),
      this.firestore.listCapturesForDelivery(status),
    ]);
    const values = requireBothProviderResults(
      results,
      'delivery capture listing',
    );
    return mergeRecords(values[0], values[1], 'delivery capture')
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  }

  async getCapture(id: string): Promise<ReadingQueueEntry | null> {
    const [localResult, firestoreResult] = await Promise.allSettled([
      this.local.getCapture(id),
      this.firestore.getCapture(id),
    ]);
    if (localResult.status === 'rejected' && firestoreResult.status === 'rejected') {
      throw new Error('Both ReadingStore providers failed to get a capture.');
    }
    if (localResult.status === 'rejected') {
      return firestoreResult.status === 'fulfilled' ? firestoreResult.value : null;
    }
    if (firestoreResult.status === 'rejected') return localResult.value;
    if (
      localResult.value &&
      firestoreResult.value &&
      !sameRecord(localResult.value, firestoreResult.value)
    ) {
      throw new Error('DualReadingStore capture divergence detected.');
    }
    return firestoreResult.value ?? localResult.value;
  }

  async createCapture(
    command: CaptureCreateCommand,
  ): Promise<CaptureCreateResult> {
    const results = await Promise.allSettled([
      this.local.createCapture(command),
      this.firestore.createCapture(command),
    ]);
    const values = requireBothProviderResults(results, 'capture creation');
    if (!sameRecord(values[0], values[1])) {
      throw new Error('DualReadingStore capture creation divergence detected.');
    }
    return values[0];
  }

  async createGenericDelivery(entry: GenericDelivery): Promise<GenericDelivery> {
    const results = await Promise.allSettled([
      this.local.createGenericDelivery(entry),
      this.firestore.createGenericDelivery(entry),
    ]);
    const values = requireBothProviderResults(results, 'generic delivery creation');
    if (!sameRecord(values[0], values[1])) {
      throw new Error('DualReadingStore generic delivery creation divergence detected.');
    }
    return values[0];
  }

  async transitionCapture(
    command: CaptureTransitionCommand,
  ): Promise<CaptureTransitionResult> {
    const results = await Promise.allSettled([
      this.local.transitionCapture(command),
      this.firestore.transitionCapture(command),
    ]);
    const values = requireBothProviderResults(results, 'capture transition');
    if (!sameRecord(values[0], values[1])) {
      throw new Error('DualReadingStore capture transition divergence detected.');
    }
    return values[0];
  }
}
