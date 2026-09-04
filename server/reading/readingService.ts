import crypto from 'crypto';
import {
  CreateReadingCaptureInput,
  CreateGenericDeliveryInput,
  GenericDelivery,
  ReadingBook,
  ReadingCapture,
  ReadingCaptureCreatorType,
  ReadingCaptureListFilter,
  ReadingQueueEntry,
} from '../../src/types';
import {
  CaptureTransitionResult,
  ReadingStore,
} from '../storage/types';
import {
  validateCaptureListFilter,
  validateCreateBookInput,
  validateCreateCaptureInput,
  validateCreateReadingActionCaptureInput,
  validateUpdateBookInput,
} from './readingValidation';
import {
  formatReadingCaptureMarkdown,
  READING_MARKDOWN_RENDER_VERSION,
} from './readingFormatter';

export type ReadingServiceErrorCode =
  | 'book_not_found'
  | 'book_ambiguous'
  | 'book_inactive'
  | 'book_revision_conflict'
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

export function normalizeReadingBookIdentity(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

export const READING_CLAIM_STALE_MS = 300_000;

export class ReadingService {
  constructor(
    private readonly store: ReadingStore,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly createCaptureId: () => string = () => (
      `reading_${crypto.randomBytes(16).toString('hex')}`
    ),
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

  async listPendingDeliveriesForBridge(): Promise<ReadingQueueEntry[]> {
    return this.store.listCapturesForDelivery('pending');
  }

  async listPendingCapturesForBridge(): Promise<ReadingCapture[]> {
    return (await this.listPendingDeliveriesForBridge())
      .filter((entry): entry is ReadingCapture => entry.deliveryKind === 'reading');
  }

  async getCapture(captureId: string): Promise<ReadingCapture | null> {
    try {
      return await this.requireReadingCapture(captureId);
    } catch (error) {
      if (
        error instanceof ReadingServiceError &&
        error.code === 'capture_not_found'
      ) {
        return null;
      }
      throw error;
    }
  }

  async getDeliveryEntry(id: string): Promise<ReadingQueueEntry | null> {
    try {
      return await this.requireDeliveryEntry(id);
    } catch (error) {
      if (error instanceof ReadingServiceError && error.code === 'capture_not_found') return null;
      throw error;
    }
  }

  async createCapture(
    value: unknown,
    creatorType: ReadingCaptureCreatorType = 'life_site',
  ): Promise<{ outcome: 'created'; capture: ReadingCapture }> {
    const input = validateCreateCaptureInput(value);
    return this.createValidatedCapture(input, creatorType);
  }

  async createCaptureFromAction(
    value: unknown,
  ): Promise<{ outcome: 'created'; capture: ReadingCapture }> {
    const input = validateCreateReadingActionCaptureInput(value);
    const normalizedTitle = normalizeReadingBookIdentity(input.bookTitle);
    const normalizedAuthor = input.bookAuthor
      ? normalizeReadingBookIdentity(input.bookAuthor)
      : undefined;
    const titleMatches = (await this.store.listBooks({ includeArchived: true }))
      .filter((book) => (
        normalizeReadingBookIdentity(book.title) === normalizedTitle &&
        (
          normalizedAuthor === undefined ||
          normalizeReadingBookIdentity(book.author) === normalizedAuthor
        )
      ));
    const activeMatches = titleMatches.filter((book) => book.status === 'active');

    if (activeMatches.length > 1) {
      throw new ReadingServiceError(
        'book_ambiguous',
        'More than one active book matches the supplied title and author.',
      );
    }
    if (activeMatches.length === 0) {
      if (titleMatches.length > 0) {
        throw new ReadingServiceError('book_inactive', 'The matching book is archived.');
      }
      throw new ReadingServiceError('book_not_found', 'Book not found.');
    }

    const matchedBook = activeMatches[0];
    const captureInput: CreateReadingCaptureInput = {
      bookId: matchedBook.id,
      originalText: input.originalText,
      captureType: input.captureType,
      source: input.source,
      locator: input.locator,
    };
    return this.createValidatedCapture(captureInput, 'custom_gpt');
  }

  private async createValidatedCapture(
    input: CreateReadingCaptureInput,
    creatorType: ReadingCaptureCreatorType,
  ): Promise<{ outcome: 'created'; capture: ReadingCapture }> {
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
        deliveryKind: 'reading',
        id: this.createCaptureId(),
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
        markdownRenderVersion: READING_MARKDOWN_RENDER_VERSION,
        deliveryAttempts: { count: 0 },
        updatedAt: timestamp,
      };
      const result = await this.store.createCapture({ capture });
      if (result.outcome === 'created') {
        return result;
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

  async createGenericDelivery(input: CreateGenericDeliveryInput): Promise<GenericDelivery> {
    if (
      typeof input.destinationNotePath !== 'string' || !input.destinationNotePath ||
      typeof input.renderedMarkdown !== 'string' || !input.renderedMarkdown
    ) {
      throw new ReadingServiceError('invalid_delivery_metadata', 'A destination path and rendered Markdown body are required.');
    }
    const timestamp = this.now();
    return this.store.createGenericDelivery({
      deliveryKind: 'generic', id: this.createCaptureId(),
      destinationNotePath: input.destinationNotePath,
      renderedMarkdown: input.renderedMarkdown,
      receivedAt: timestamp, status: 'pending', deliveryAttempts: { count: 0 }, updatedAt: timestamp,
    });
  }

  async claimCapture(
    captureId: string,
  ): Promise<ReadingCapture> {
    return this.requireReadingEntry(await this.claimDelivery(captureId));
  }

  async claimDelivery(id: string): Promise<ReadingQueueEntry> {
    const current = await this.requireDeliveryEntry(id);
    const timestamp = this.now();
    const observedAtMs = Date.parse(timestamp);
    if (!Number.isFinite(observedAtMs)) {
      throw new ReadingServiceError(
        'invalid_delivery_metadata',
        'The delivery timestamp is invalid.',
      );
    }
    if (current.status === 'claimed') {
      const claimedAtMs = Date.parse(current.claimedAt ?? '');
      if (
        !Number.isFinite(claimedAtMs) ||
        observedAtMs - claimedAtMs < READING_CLAIM_STALE_MS
      ) {
        throw new ReadingServiceError(
          'invalid_capture_transition',
          'The capture is already claimed and is not stale.',
        );
      }
    } else {
      this.requireCaptureStatus(current, 'pending');
    }
    const capture: ReadingQueueEntry = {
      ...current,
      status: 'claimed',
      deliveryAttempts: {
        count: current.deliveryAttempts.count + 1,
        lastAttemptAt: timestamp,
      },
      claimedAt: timestamp,
      updatedAt: timestamp,
    };
    return this.executeTransition(current, capture);
  }

  async claimNextCapture(): Promise<ReadingCapture | null> {
    const candidates = [
      ...(await this.store.listCapturesForDelivery('pending')).filter((entry): entry is ReadingCapture => entry.deliveryKind === 'reading'),
      ...(await this.store.listCapturesForDelivery('claimed')).filter((entry): entry is ReadingCapture => entry.deliveryKind === 'reading'),
    ].sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
    for (const capture of candidates) {
      try {
        return await this.claimCapture(capture.id);
      } catch (error) {
        if (
          error instanceof ReadingServiceError &&
          (
            error.code === 'invalid_capture_transition' ||
            error.code === 'capture_state_conflict'
          )
        ) {
          continue;
        }
        throw error;
      }
    }
    return null;
  }

  async confirmDelivery(captureId: string): Promise<ReadingCapture> {
    return this.requireReadingEntry(await this.confirmDeliveryEntry(captureId));
  }

  async confirmDeliveryEntry(id: string): Promise<ReadingQueueEntry> {
    const current = await this.requireDeliveryEntry(id);
    if (current.status === 'done') return current;
    this.requireCaptureStatus(current, 'claimed');
    const observedAt = this.now();
    const capture: ReadingQueueEntry = {
      ...current,
      status: 'done',
      deliveryAttempts: {
        ...current.deliveryAttempts,
        lastErrorCode: undefined,
      },
      claimedAt: undefined,
      doneAt: observedAt,
      updatedAt: observedAt,
    };
    return this.executeTransition(current, capture);
  }

  async reportDeliveryFailure(
    captureId: string,
    errorCode: string,
  ): Promise<ReadingCapture> {
    if (!errorCode || !/^[A-Z0-9_]{1,64}$/.test(errorCode)) {
      throw new ReadingServiceError(
        'invalid_delivery_metadata',
        'A sanitized delivery error code is required.',
      );
    }
    const current = await this.requireReadingCapture(captureId);
    if (
      current.status === 'claimed' &&
      current.deliveryAttempts.lastErrorCode === errorCode
    ) {
      return current;
    }
    this.requireCaptureStatus(current, 'claimed');
    const observedAt = this.now();
    const capture: ReadingCapture = {
      ...current,
      deliveryAttempts: {
        ...current.deliveryAttempts,
        lastErrorCode: errorCode,
      },
      updatedAt: observedAt,
    };
    return this.requireReadingEntry(await this.executeTransition(current, capture));
  }

  private async requireReadingCapture(captureId: string): Promise<ReadingCapture> {
    return this.requireReadingEntry(await this.requireDeliveryEntry(captureId));
  }

  private async requireDeliveryEntry(id: string): Promise<ReadingQueueEntry> {
    const current = await this.store.getCapture(id);
    if (!current) {
      throw new ReadingServiceError('capture_not_found', 'Capture not found.');
    }
    return current;
  }

  private requireReadingEntry(entry: ReadingQueueEntry): ReadingCapture {
    if (entry.deliveryKind !== 'reading') {
      throw new ReadingServiceError('capture_not_found', 'Capture not found.');
    }
    return entry;
  }

  private requireCaptureStatus(
    capture: ReadingQueueEntry,
    expectedStatus: ReadingCapture['status'],
  ): void {
    if (capture.status !== expectedStatus) {
      throw new ReadingServiceError(
        'invalid_capture_transition',
        `Expected a ${expectedStatus} capture, but found ${capture.status}.`,
      );
    }
  }

  private async executeTransition(
    current: ReadingQueueEntry,
    capture: ReadingQueueEntry,
  ): Promise<ReadingQueueEntry> {
    const result = await this.store.transitionCapture({
      captureId: current.id,
      expectedStatus: current.status,
      expectedUpdatedAt: current.updatedAt,
      capture,
    });
    if (result.outcome === 'updated') return result.capture;
    this.throwForTransitionFailure(result);
  }

  private throwForTransitionFailure(
    result: Exclude<CaptureTransitionResult, { outcome: 'updated' }>,
  ): never;
  private throwForTransitionFailure(result: CaptureTransitionResult): void;
  private throwForTransitionFailure(result: CaptureTransitionResult): void {
    if (result.outcome === 'updated') return;
    const failures: Record<
      Exclude<CaptureTransitionResult['outcome'], 'updated'>,
      { code: ReadingServiceErrorCode; message: string }
    > = {
      not_found: {
        code: 'capture_not_found',
        message: 'Capture not found.',
      },
      state_conflict: {
        code: 'capture_state_conflict',
        message: 'The capture state changed before the transition completed.',
      },
    };
    const failure = failures[result.outcome];
    throw new ReadingServiceError(failure.code, failure.message);
  }

  formatCapture(capture: ReadingCapture): string {
    return formatReadingCaptureMarkdown(capture);
  }
}
