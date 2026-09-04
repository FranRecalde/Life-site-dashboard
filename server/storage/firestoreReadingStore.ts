import { Firestore } from '@google-cloud/firestore';
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

function cleanFirestoreRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function bookMatchesCapture(book: ReadingBook, capture: ReadingCapture): boolean {
  return (
    book.revision === capture.bookRevision &&
    book.title === capture.bookTitle &&
    book.author === capture.bookAuthor &&
    book.destinationNotePath === capture.destinationNotePath &&
    JSON.stringify(book.tags) === JSON.stringify(capture.bookTags)
  );
}

export class FirestoreReadingStore implements ReadingStore {
  private readonly booksCollection = 'reading_books';
  private readonly capturesCollection = 'reading_captures';
  constructor(private readonly db: Firestore) {}

  async listBooks(options?: { includeArchived?: boolean }): Promise<ReadingBook[]> {
    const snapshot = await this.db.collection(this.booksCollection).get();
    const books: ReadingBook[] = [];
    snapshot.forEach((document) => {
      const book = document.data() as ReadingBook;
      if (options?.includeArchived || book.status === 'active') {
        books.push(book);
      }
    });
    return books.sort((a, b) => a.title.localeCompare(b.title));
  }

  async getBook(id: string): Promise<ReadingBook | null> {
    const snapshot = await this.db.collection(this.booksCollection).doc(id).get();
    return snapshot.exists ? snapshot.data() as ReadingBook : null;
  }

  async createBook(book: ReadingBook): Promise<ReadingBook> {
    await this.db
      .collection(this.booksCollection)
      .doc(book.id)
      .create(cleanFirestoreRecord(book));
    return book;
  }

  async updateBook(
    id: string,
    expectedRevision: number,
    book: ReadingBook,
  ): Promise<ReadingBookUpdateResult> {
    const reference = this.db.collection(this.booksCollection).doc(id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return { outcome: 'not_found' };
      const current = snapshot.data() as ReadingBook;
      if (current.revision !== expectedRevision) {
        return { outcome: 'revision_conflict' };
      }
      transaction.set(reference, cleanFirestoreRecord(book));
      return { outcome: 'updated', book };
    });
  }

  async listCaptures(filter?: ReadingCaptureListFilter): Promise<ReadingCapture[]> {
    const snapshot = await this.db.collection(this.capturesCollection).get();
    let captures: ReadingCapture[] = [];
    snapshot.forEach((document) => {
      const capture = normalizeReadingQueueEntryState(document.data() as ReadingQueueEntry);
      if (capture.deliveryKind === 'reading') captures.push(capture);
    });
    if (filter?.bookId) {
      captures = captures.filter((capture) => capture.bookId === filter.bookId);
    }
    if (filter?.status) {
      captures = captures.filter((capture) => capture.status === filter.status);
    }
    captures.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return captures.slice(0, filter?.limit ?? 100);
  }

  async listCapturesForDelivery(
    status: 'pending' | 'claimed',
  ): Promise<ReadingQueueEntry[]> {
    const snapshot = await this.db.collection(this.capturesCollection).get();
    const captures: ReadingQueueEntry[] = [];
    snapshot.forEach((document) => {
      const capture = normalizeReadingQueueEntryState(
        document.data() as ReadingQueueEntry,
      );
      if (capture.status === status) captures.push(capture);
    });
    return captures.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  }

  async getCapture(id: string): Promise<ReadingQueueEntry | null> {
    const snapshot = await this.db.collection(this.capturesCollection).doc(id).get();
    return snapshot.exists
      ? normalizeReadingQueueEntryState(snapshot.data() as ReadingQueueEntry)
      : null;
  }

  async createCapture(
    command: CaptureCreateCommand,
  ): Promise<CaptureCreateResult> {
    const captureReference = this.db
      .collection(this.capturesCollection)
      .doc(command.capture.id);
    const bookReference = this.db
      .collection(this.booksCollection)
      .doc(command.capture.bookId);

    return this.db.runTransaction(async (transaction) => {
      const [bookSnapshot, captureSnapshot] = await Promise.all([
        transaction.get(bookReference),
        transaction.get(captureReference),
      ]);
      if (!bookSnapshot.exists) return { outcome: 'book_not_found' };
      const book = bookSnapshot.data() as ReadingBook;
      if (book.status !== 'active') return { outcome: 'book_inactive' };
      if (!bookMatchesCapture(book, command.capture)) {
        return { outcome: 'book_revision_conflict' };
      }

      if (captureSnapshot.exists) {
        throw new Error('Reading capture ID already exists.');
      }

      transaction.create(captureReference, cleanFirestoreRecord(command.capture));
      return { outcome: 'created', capture: command.capture };
    });
  }

  async createGenericDelivery(entry: GenericDelivery): Promise<GenericDelivery> {
    const reference = this.db.collection(this.capturesCollection).doc(entry.id);
    await this.db.runTransaction(async (transaction) => {
      if ((await transaction.get(reference)).exists) {
        throw new Error('Reading delivery ID already exists.');
      }
      transaction.create(reference, cleanFirestoreRecord(entry));
    });
    return entry;
  }

  async transitionCapture(
    command: CaptureTransitionCommand,
  ): Promise<CaptureTransitionResult> {
    const reference = this.db
      .collection(this.capturesCollection)
      .doc(command.captureId);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return { outcome: 'not_found' };
      const current = normalizeReadingQueueEntryState(
        snapshot.data() as ReadingQueueEntry,
      );
      if (
        current.status !== command.expectedStatus ||
        current.updatedAt !== command.expectedUpdatedAt
      ) {
        return { outcome: 'state_conflict' };
      }
      transaction.set(reference, cleanFirestoreRecord(command.capture));
      return { outcome: 'updated', capture: command.capture };
    });
  }
}
