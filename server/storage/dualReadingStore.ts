import { ReadingBook, ReadingCapture, ReadingCaptureListFilter } from '../../src/types';
import {
  CaptureTransitionCommand,
  CaptureTransitionResult,
  IdempotentCaptureCreateCommand,
  IdempotentCaptureCreateResult,
  ReadingBookUpdateResult,
  ReadingStore,
} from './types';

function sameRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
    const successes = results.filter(
      (result): result is PromiseFulfilledResult<ReadingBook> => result.status === 'fulfilled',
    );
    if (successes.length === 0) {
      throw new Error('Both ReadingStore providers failed to create a book.');
    }
    if (successes.some((result) => !sameRecord(result.value, book))) {
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
    const successes = results.filter(
      (result): result is PromiseFulfilledResult<ReadingBookUpdateResult> =>
        result.status === 'fulfilled',
    );
    if (successes.length === 0) {
      throw new Error('Both ReadingStore providers failed to update a book.');
    }
    if (
      successes.length === 2 &&
      !sameRecord(successes[0].value, successes[1].value)
    ) {
      throw new Error('DualReadingStore book update divergence detected.');
    }
    return successes[0].value;
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

  async getCapture(id: string): Promise<ReadingCapture | null> {
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

  async createCaptureIdempotently(
    command: IdempotentCaptureCreateCommand,
  ): Promise<IdempotentCaptureCreateResult> {
    const results = await Promise.allSettled([
      this.local.createCaptureIdempotently(command),
      this.firestore.createCaptureIdempotently(command),
    ]);
    const successes = results.filter(
      (result): result is PromiseFulfilledResult<IdempotentCaptureCreateResult> =>
        result.status === 'fulfilled',
    );
    if (successes.length === 0) {
      throw new Error('Both ReadingStore providers failed to create a capture.');
    }
    if (successes.length === 1) return successes[0].value;

    const values = successes.map((result) => result.value);
    if (values.some((value) => value.outcome === 'conflict')) {
      return { outcome: 'conflict' };
    }
    const nonCaptureOutcomes = values.filter(
      (value) => value.outcome !== 'created' && value.outcome !== 'replayed',
    );
    if (nonCaptureOutcomes.length > 0) {
      if (!sameRecord(values[0], values[1])) {
        throw new Error('DualReadingStore capture creation divergence detected.');
      }
      return values[0];
    }
    const captureResults = values as Array<{
      outcome: 'created' | 'replayed';
      capture: ReadingCapture;
    }>;
    if (!sameRecord(captureResults[0].capture, captureResults[1].capture)) {
      throw new Error('DualReadingStore capture record divergence detected.');
    }
    return {
      outcome: captureResults.some((result) => result.outcome === 'replayed')
        ? 'replayed'
        : 'created',
      capture: captureResults[0].capture,
    };
  }

  async transitionCapture(
    command: CaptureTransitionCommand,
  ): Promise<CaptureTransitionResult> {
    const results = await Promise.allSettled([
      this.local.transitionCapture(command),
      this.firestore.transitionCapture(command),
    ]);
    const successes = results.filter(
      (result): result is PromiseFulfilledResult<CaptureTransitionResult> =>
        result.status === 'fulfilled',
    );
    if (successes.length !== 2) {
      throw new Error('DualReadingStore capture transition provider failure.');
    }
    if (!sameRecord(successes[0].value, successes[1].value)) {
      throw new Error('DualReadingStore capture transition divergence detected.');
    }
    return successes[0].value;
  }
}
