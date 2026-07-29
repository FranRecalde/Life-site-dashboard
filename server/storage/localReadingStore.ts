import fs from 'fs';
import path from 'path';
import { ReadingBook, ReadingCapture, ReadingCaptureListFilter } from '../../src/types';
import {
  CaptureTransitionCommand,
  CaptureTransitionResult,
  getCaptureLeaseGuardFailure,
  IdempotentCaptureCreateCommand,
  IdempotentCaptureCreateResult,
  ReadingBookUpdateResult,
  ReadingStore,
} from './types';

interface ReadingIdempotencyClaim {
  payloadHash: string;
  captureId: string;
  createdAt: string;
}

interface LocalReadingState {
  version: 1;
  books: ReadingBook[];
  captures: ReadingCapture[];
  idempotency: Record<string, ReadingIdempotencyClaim>;
}

const emptyState = (): LocalReadingState => ({
  version: 1,
  books: [],
  captures: [],
  idempotency: {},
});

function bookMatchesCapture(book: ReadingBook, capture: ReadingCapture): boolean {
  return (
    book.revision === capture.bookRevision &&
    book.title === capture.bookTitle &&
    book.author === capture.bookAuthor &&
    book.destinationNotePath === capture.destinationNotePath &&
    JSON.stringify(book.tags) === JSON.stringify(capture.bookTags)
  );
}

export class LocalReadingStore implements ReadingStore {
  private lockTail: Promise<void> = Promise.resolve();

  constructor(private readonly stateFile: string) {}

  private async withLock<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = this.lockTail;
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.lockTail = previous.then(() => current, () => current);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private readState(): LocalReadingState {
    if (!fs.existsSync(this.stateFile)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf-8')) as Partial<LocalReadingState>;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.books) ||
      !Array.isArray(parsed.captures) ||
      !parsed.idempotency ||
      typeof parsed.idempotency !== 'object' ||
      Array.isArray(parsed.idempotency)
    ) {
      throw new Error('Local ReadingStore state is invalid.');
    }
    return parsed as LocalReadingState;
  }

  private writeState(state: LocalReadingState): void {
    const directory = path.dirname(this.stateFile);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryFile = `${this.stateFile}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(temporaryFile, JSON.stringify(state, null, 2), 'utf-8');
      fs.renameSync(temporaryFile, this.stateFile);
    } finally {
      if (fs.existsSync(temporaryFile)) {
        fs.unlinkSync(temporaryFile);
      }
    }
  }

  async listBooks(options?: { includeArchived?: boolean }): Promise<ReadingBook[]> {
    return this.withLock(() => {
      const books = this.readState().books;
      return books
        .filter((book) => options?.includeArchived || book.status === 'active')
        .sort((a, b) => a.title.localeCompare(b.title));
    });
  }

  async getBook(id: string): Promise<ReadingBook | null> {
    return this.withLock(() => (
      this.readState().books.find((book) => book.id === id) ?? null
    ));
  }

  async createBook(book: ReadingBook): Promise<ReadingBook> {
    return this.withLock(() => {
      const state = this.readState();
      if (state.books.some((existing) => existing.id === book.id)) {
        throw new Error('Reading book ID already exists.');
      }
      state.books.push(book);
      this.writeState(state);
      return book;
    });
  }

  async updateBook(
    id: string,
    expectedRevision: number,
    book: ReadingBook,
  ): Promise<ReadingBookUpdateResult> {
    return this.withLock(() => {
      const state = this.readState();
      const index = state.books.findIndex((existing) => existing.id === id);
      if (index === -1) return { outcome: 'not_found' };
      if (state.books[index].revision !== expectedRevision) {
        return { outcome: 'revision_conflict' };
      }
      state.books[index] = book;
      this.writeState(state);
      return { outcome: 'updated', book };
    });
  }

  async listCaptures(filter?: ReadingCaptureListFilter): Promise<ReadingCapture[]> {
    return this.withLock(() => {
      let captures = this.readState().captures;
      if (filter?.bookId) {
        captures = captures.filter((capture) => capture.bookId === filter.bookId);
      }
      if (filter?.status) {
        captures = captures.filter((capture) => capture.status === filter.status);
      }
      captures = captures.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
      return captures.slice(0, filter?.limit ?? 100);
    });
  }

  async listCapturesForDelivery(
    status: 'pending' | 'in_progress',
  ): Promise<ReadingCapture[]> {
    return this.withLock(() => (
      this.readState().captures
        .filter((capture) => capture.status === status)
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
    ));
  }

  async getCapture(id: string): Promise<ReadingCapture | null> {
    return this.withLock(() => (
      this.readState().captures.find((capture) => capture.id === id) ?? null
    ));
  }

  async createCaptureIdempotently(
    command: IdempotentCaptureCreateCommand,
  ): Promise<IdempotentCaptureCreateResult> {
    return this.withLock(() => {
      const state = this.readState();
      const claim = state.idempotency[command.idempotencyKeyHash];
      if (claim) {
        if (claim.payloadHash !== command.payloadHash) {
          return { outcome: 'conflict' };
        }
        const existing = state.captures.find((capture) => capture.id === claim.captureId);
        if (!existing) {
          throw new Error('Reading idempotency claim references a missing capture.');
        }
        return { outcome: 'replayed', capture: existing };
      }

      const book = state.books.find((candidate) => candidate.id === command.capture.bookId);
      if (!book) return { outcome: 'book_not_found' };
      if (book.status !== 'active') return { outcome: 'book_inactive' };
      if (!bookMatchesCapture(book, command.capture)) {
        return { outcome: 'book_revision_conflict' };
      }

      const existingCapture = state.captures.find(
        (capture) => capture.id === command.capture.id,
      );
      if (existingCapture) {
        if (existingCapture.payloadHash !== command.payloadHash) {
          return { outcome: 'conflict' };
        }
        state.idempotency[command.idempotencyKeyHash] = {
          payloadHash: command.payloadHash,
          captureId: existingCapture.id,
          createdAt: existingCapture.receivedAt,
        };
        this.writeState(state);
        return { outcome: 'replayed', capture: existingCapture };
      }

      state.captures.push(command.capture);
      state.idempotency[command.idempotencyKeyHash] = {
        payloadHash: command.payloadHash,
        captureId: command.capture.id,
        createdAt: command.capture.receivedAt,
      };
      this.writeState(state);
      return { outcome: 'created', capture: command.capture };
    });
  }

  async transitionCapture(
    command: CaptureTransitionCommand,
  ): Promise<CaptureTransitionResult> {
    return this.withLock(() => {
      const state = this.readState();
      const index = state.captures.findIndex(
        (capture) => capture.id === command.captureId,
      );
      if (index === -1) return { outcome: 'not_found' };
      const current = state.captures[index];
      if (current.status !== command.expectedStatus) {
        return { outcome: 'state_conflict' };
      }
      const leaseGuardFailure = getCaptureLeaseGuardFailure(
        current,
        command.leaseGuard,
      );
      if (leaseGuardFailure) return { outcome: leaseGuardFailure };
      state.captures[index] = command.capture;
      this.writeState(state);
      return { outcome: 'updated', capture: command.capture };
    });
  }
}
