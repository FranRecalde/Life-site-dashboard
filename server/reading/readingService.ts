import crypto from 'crypto';
import {
  CreateReadingCaptureInput,
  ReadingBook,
  ReadingCapture,
  ReadingCaptureCreatorType,
  ReadingCaptureListFilter,
  ReadingCaptureStatus,
  ReadingDeliveryLease,
} from '../../src/types';
import { ReadingStore } from '../storage/types';
import {
  validateCaptureListFilter,
  validateCreateBookInput,
  validateCreateCaptureInput,
  validateIdempotencyKey,
  validateUpdateBookInput,
} from './readingValidation';
import {
  formatReadingCaptureMarkdown,
  READING_MARKDOWN_RENDER_VERSION,
} from './readingFormatter';

export type ReadingServiceErrorCode =
  | 'book_not_found'
  | 'book_inactive'
  | 'book_revision_conflict'
  | 'idempotency_conflict'
  | 'capture_not_found'
  | 'capture_state_conflict'
  | 'invalid_capture_transition'
  | 'invalid_delivery_metadata';

export class ReadingServiceError extends Error {
  constructor(
    readonly code: ReadingServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReadingServiceError';
  }
}

export interface CaptureTransitionDetails {
  lease?: ReadingDeliveryLease;
  errorCode?: string;
}

const ALLOWED_TRANSITIONS: Record<ReadingCaptureStatus, ReadingCaptureStatus[]> = {
  pending: ['in_progress'],
  in_progress: ['pending', 'delivered', 'needs_attention'],
  needs_attention: ['pending'],
  delivered: [],
};

export function hashReadingCapturePayload(input: CreateReadingCaptureInput): string {
  const canonicalPayload = JSON.stringify({
    bookId: input.bookId,
    originalText: input.originalText,
    captureType: input.captureType,
    source: input.source ?? null,
    locator: input.locator
      ? { kind: input.locator.kind, value: input.locator.value }
      : null,
  });
  return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
}

export function hashReadingIdempotencyKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function captureIdFromIdempotencyHash(hash: string): string {
  return `reading_${hash.slice(0, 32)}`;
}

export class ReadingService {
  constructor(
    private readonly store: ReadingStore,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async listBooks(includeArchived = false): Promise<ReadingBook[]> {
    return this.store.listBooks({ includeArchived });
  }

  async createBook(value: unknown): Promise<ReadingBook> {
    const input = validateCreateBookInput(value);
    const timestamp = this.now();
    const book: ReadingBook = {
      id: this.createId(),
      title: input.title,
      author: input.author,
      destinationNotePath: input.destinationNotePath,
      tags: input.tags ?? [],
      defaultSource: input.defaultSource,
      status: 'active',
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.store.createBook(book);
  }

  async updateBook(id: string, value: unknown): Promise<ReadingBook> {
    const input = validateUpdateBookInput(value);
    const current = await this.store.getBook(id);
    if (!current) {
      throw new ReadingServiceError('book_not_found', 'Book not found.');
    }
    const updated: ReadingBook = {
      ...current,
      title: input.title ?? current.title,
      author: input.author ?? current.author,
      destinationNotePath: input.destinationNotePath ?? current.destinationNotePath,
      tags: input.tags ?? current.tags,
      defaultSource:
        input.defaultSource === null
          ? undefined
          : input.defaultSource ?? current.defaultSource,
      status: input.status ?? current.status,
      revision: current.revision + 1,
      updatedAt: this.now(),
    };
    const result = await this.store.updateBook(id, input.expectedRevision, updated);
    if (result.outcome === 'not_found') {
      throw new ReadingServiceError('book_not_found', 'Book not found.');
    }
    if (result.outcome === 'revision_conflict') {
      throw new ReadingServiceError(
        'book_revision_conflict',
        'The book was changed by another request.',
      );
    }
    return result.book;
  }

  async listCaptures(value: {
    bookId?: unknown;
    status?: unknown;
    limit?: unknown;
  } = {}): Promise<ReadingCapture[]> {
    const filter: ReadingCaptureListFilter = validateCaptureListFilter(value);
    return this.store.listCaptures(filter);
  }

  async createCapture(
    value: unknown,
    rawIdempotencyKey: unknown,
    creatorType: ReadingCaptureCreatorType = 'life_site',
  ): Promise<{ outcome: 'created' | 'replayed'; capture: ReadingCapture }> {
    const input = validateCreateCaptureInput(value);
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey);
    const idempotencyKeyHash = hashReadingIdempotencyKey(idempotencyKey);
    const payloadHash = hashReadingCapturePayload(input);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const book = await this.store.getBook(input.bookId);
      if (!book) {
        throw new ReadingServiceError('book_not_found', 'Book not found.');
      }
      if (book.status !== 'active') {
        throw new ReadingServiceError('book_inactive', 'Book is archived.');
      }
      const timestamp = this.now();
      const capture: ReadingCapture = {
        id: captureIdFromIdempotencyHash(idempotencyKeyHash),
        bookId: book.id,
        bookRevision: book.revision,
        bookTitle: book.title,
        bookAuthor: book.author,
        bookTags: [...book.tags],
        destinationNotePath: book.destinationNotePath,
        originalText: input.originalText,
        captureType: input.captureType,
        source: input.source ?? book.defaultSource,
        locator: input.locator ? { ...input.locator } : undefined,
        capturedAt: timestamp,
        receivedAt: timestamp,
        creatorType,
        status: 'pending',
        payloadHash,
        markdownRenderVersion: READING_MARKDOWN_RENDER_VERSION,
        deliveryAttempts: { count: 0 },
        updatedAt: timestamp,
      };
      const result = await this.store.createCaptureIdempotently({
        idempotencyKeyHash,
        payloadHash,
        capture,
      });
      if (result.outcome === 'created' || result.outcome === 'replayed') {
        return result;
      }
      if (result.outcome === 'conflict') {
        throw new ReadingServiceError(
          'idempotency_conflict',
          'The Idempotency-Key was already used with a different payload.',
        );
      }
      if (result.outcome === 'book_not_found') {
        throw new ReadingServiceError('book_not_found', 'Book not found.');
      }
      if (result.outcome === 'book_inactive') {
        throw new ReadingServiceError('book_inactive', 'Book is archived.');
      }
    }

    throw new ReadingServiceError(
      'book_revision_conflict',
      'The book changed while the capture was being created.',
    );
  }

  async transitionCapture(
    captureId: string,
    nextStatus: ReadingCaptureStatus,
    details: CaptureTransitionDetails = {},
  ): Promise<ReadingCapture> {
    const current = await this.store.getCapture(captureId);
    if (!current) {
      throw new ReadingServiceError('capture_not_found', 'Capture not found.');
    }
    if (!ALLOWED_TRANSITIONS[current.status].includes(nextStatus)) {
      throw new ReadingServiceError(
        'invalid_capture_transition',
        `Cannot transition a capture from ${current.status} to ${nextStatus}.`,
      );
    }
    if (nextStatus === 'in_progress' && !details.lease) {
      throw new ReadingServiceError(
        'invalid_delivery_metadata',
        'A delivery lease is required.',
      );
    }
    if (
      nextStatus === 'needs_attention' &&
      (!details.errorCode || !/^[A-Z0-9_]{1,64}$/.test(details.errorCode))
    ) {
      throw new ReadingServiceError(
        'invalid_delivery_metadata',
        'A sanitized delivery error code is required.',
      );
    }

    const timestamp = this.now();
    const capture: ReadingCapture = {
      ...current,
      status: nextStatus,
      deliveryAttempts: {
        count:
          nextStatus === 'in_progress'
            ? current.deliveryAttempts.count + 1
            : current.deliveryAttempts.count,
        lastAttemptAt:
          nextStatus === 'in_progress'
            ? timestamp
            : current.deliveryAttempts.lastAttemptAt,
        lastErrorCode:
          nextStatus === 'needs_attention'
            ? details.errorCode
            : nextStatus === 'pending' || nextStatus === 'delivered'
              ? undefined
              : current.deliveryAttempts.lastErrorCode,
      },
      deliveryLease: nextStatus === 'in_progress' ? details.lease : undefined,
      deliveredAt: nextStatus === 'delivered' ? timestamp : current.deliveredAt,
      updatedAt: timestamp,
    };
    const result = await this.store.transitionCapture({
      captureId,
      expectedStatus: current.status,
      capture,
    });
    if (result.outcome === 'not_found') {
      throw new ReadingServiceError('capture_not_found', 'Capture not found.');
    }
    if (result.outcome === 'state_conflict') {
      throw new ReadingServiceError(
        'capture_state_conflict',
        'The capture state changed before the transition completed.',
      );
    }
    return result.capture;
  }

  formatCapture(capture: ReadingCapture): string {
    return formatReadingCaptureMarkdown(capture);
  }
}
