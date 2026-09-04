import fs from 'fs';
import path from 'path';
import { GenericDelivery, ReadingBook, ReadingCapture, ReadingCaptureListFilter, ReadingQueueEntry } from '../../src/types';
import {
  CaptureCreateCommand,
  CaptureCreateResult,
  CaptureTransitionCommand,
  CaptureTransitionResult,
  ReadingBookUpdateResult,
  ReadingStore,
} from './types';
import { normalizeReadingQueueEntryState } from './readingCaptureState';
import {
  deleteReadingDeliveryMarker,
  listReadingDeliveryMarkerIds,
} from './readingDeliveryMarkers';

interface LocalReadingState {
  version: 1;
  books: ReadingBook[];
  captures: ReadingQueueEntry[];
}

const emptyState = (): LocalReadingState => ({
  version: 1,
  books: [],
  captures: [],
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

  constructor(
    private readonly stateFile: string,
    private readonly options: { reconcileDeliveryMarkers?: boolean } = {},
  ) {}

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
    const parsed = fs.existsSync(this.stateFile)
      ? JSON.parse(fs.readFileSync(this.stateFile, 'utf-8')) as Partial<LocalReadingState>
      : emptyState();
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.books) ||
      !Array.isArray(parsed.captures)
    ) {
      throw new Error('Local ReadingStore state is invalid.');
    }
    const state: LocalReadingState = {
      version: 1,
      books: parsed.books,
      captures: parsed.captures.map((capture) => normalizeReadingQueueEntryState(capture as ReadingQueueEntry)),
    };
    if (this.options.reconcileDeliveryMarkers !== false) {
      this.reconcileDeliveryMarkers(state);
    }
    return state;
  }

  private reconcileDeliveryMarkers(state: LocalReadingState): void {
    const markerIds = listReadingDeliveryMarkerIds(this.stateFile);
    if (markerIds.length === 0) return;
    const markerIdsToDelete: string[] = [];
    let changed = false;
    for (const captureId of markerIds) {
      const index = state.captures.findIndex((capture) => capture.id === captureId);
      if (index === -1) {
        console.warn('Reading delivery marker references an unknown capture.');
        continue;
      }
      const current = state.captures[index];
      if (current.status !== 'done') {
        const timestamp = new Date().toISOString();
        state.captures[index] = {
          ...current,
          status: 'done',
          claimedAt: undefined,
          doneAt: timestamp,
          deliveryAttempts: {
            ...current.deliveryAttempts,
            lastErrorCode: undefined,
          },
          updatedAt: timestamp,
        };
        changed = true;
      }
      markerIdsToDelete.push(captureId);
    }
    if (changed) this.writeState(state);
    for (const captureId of markerIdsToDelete) {
      deleteReadingDeliveryMarker(this.stateFile, captureId);
    }
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
      let captures = this.readState().captures.filter((capture): capture is ReadingCapture => capture.deliveryKind === 'reading');
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
    status: 'pending' | 'claimed',
  ): Promise<ReadingQueueEntry[]> {
    return this.withLock(() => (
      this.readState().captures
        .filter((capture) => capture.status === status)
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
    ));
  }

  async getCapture(id: string): Promise<ReadingQueueEntry | null> {
    return this.withLock(() => (
      this.readState().captures.find((capture) => capture.id === id) ?? null
    ));
  }

  async createCapture(
    command: CaptureCreateCommand,
  ): Promise<CaptureCreateResult> {
    return this.withLock(() => {
      const state = this.readState();
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
        throw new Error('Reading capture ID already exists.');
      }

      state.captures.push(command.capture);
      this.writeState(state);
      return { outcome: 'created', capture: command.capture };
    });
  }

  async createGenericDelivery(entry: GenericDelivery): Promise<GenericDelivery> {
    return this.withLock(() => {
      const state = this.readState();
      if (state.captures.some((capture) => capture.id === entry.id)) {
        throw new Error('Reading delivery ID already exists.');
      }
      state.captures.push(entry);
      this.writeState(state);
      return entry;
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
      if (
        current.status !== command.expectedStatus ||
        current.updatedAt !== command.expectedUpdatedAt
      ) {
        return { outcome: 'state_conflict' };
      }
      state.captures[index] = command.capture;
      this.writeState(state);
      return { outcome: 'updated', capture: command.capture };
    });
  }
}
