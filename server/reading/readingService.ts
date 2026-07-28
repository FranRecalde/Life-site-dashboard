import crypto from 'crypto';
import {
  CreateReadingCaptureInput,
  ReadingBook,
  ReadingCapture,
  ReadingCaptureCreatorType,
  ReadingCaptureListFilter,
} from '../../src/types';
import {
  CaptureLeaseGuard,
  CaptureTransitionResult,
  ReadingStore,
} from '../storage/types';
import {
  type CreateReadingActionCaptureInput,
  validateCaptureListFilter,
  validateCreateBookInput,
  validateCreateCaptureInput,
  validateCreateReadingActionCaptureInput,
  validateIdempotencyKey,
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
  | 'idempotency_conflict'
  | 'capture_not_found'
  | 'capture_state_conflict'
  | 'capture_lease_conflict'
  | 'capture_lease_expired'
  | 'capture_lease_not_expired'
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

export function hashReadingIdempotencyIdentity(
  scope: ReadingCaptureCreatorType,
  key: string,
): string {
  const canonicalIdentity = JSON.stringify([scope, key]);
  return crypto.createHash('sha256').update(canonicalIdentity).digest('hex');
}

function captureIdFromIdempotencyHash(hash: string): string {
  return `reading_${hash.slice(0, 32)}`;
}

export function normalizeReadingBookIdentity(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

export function hashReadingActionCapturePayload(
  input: CreateReadingActionCaptureInput,
  bookId: string,
): string {
  const canonicalPayload = JSON.stringify({
    bookId,
    bookTitle: normalizeReadingBookIdentity(input.bookTitle),
    bookAuthor: input.bookAuthor
      ? normalizeReadingBookIdentity(input.bookAuthor)
      : null,
    originalText: input.originalText,
    captureType: input.captureType,
    source: input.source ?? null,
    locator: input.locator
      ? { kind: input.locator.kind, value: input.locator.value }
      : null,
  });
  return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
}

export class ReadingService {
  constructor(
    private readonly store: ReadingStore,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly createLeaseId: () => string = () => crypto.randomUUID(),
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
    return this.createValidatedCapture(
      input,
      idempotencyKey,
      creatorType,
      hashReadingCapturePayload(input),
    );
  }

  async createCaptureFromAction(
    value: unknown,
    rawIdempotencyKey: unknown,
  ): Promise<{ outcome: 'created' | 'replayed'; capture: ReadingCapture }> {
    const input = validateCreateReadingActionCaptureInput(value);
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey);
    const idempotencyKeyHash = hashReadingIdempotencyIdentity(
      'custom_gpt',
      idempotencyKey,
    );
    const normalizedTitle = normalizeReadingBookIdentity(input.bookTitle);
    const normalizedAuthor = input.bookAuthor
      ? normalizeReadingBookIdentity(input.bookAuthor)
      : undefined;
    const existingCapture = await this.store.getCapture(
      captureIdFromIdempotencyHash(idempotencyKeyHash),
    );
    if (existingCapture) {
      const replayPayloadHash = hashReadingActionCapturePayload(
        input,
        existingCapture.bookId,
      );
      if (
        existingCapture.creatorType !== 'custom_gpt' ||
        existingCapture.payloadHash !== replayPayloadHash
      ) {
        throw new ReadingServiceError(
          'idempotency_conflict',
          'The Idempotency-Key was already used with a different payload.',
        );
      }
      return { outcome: 'replayed', capture: existingCapture };
    }

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
    return this.createValidatedCapture(
      captureInput,
      idempotencyKey,
      'custom_gpt',
      hashReadingActionCapturePayload(input, matchedBook.id),
    );
  }

  private async createValidatedCapture(
    input: CreateReadingCaptureInput,
    idempotencyKey: string,
    creatorType: ReadingCaptureCreatorType,
    payloadHash: string,
  ): Promise<{ outcome: 'created' | 'replayed'; capture: ReadingCapture }> {
    const idempotencyKeyHash = hashReadingIdempotencyIdentity(
      creatorType,
      idempotencyKey,
    );

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

  async claimCapture(
    captureId: string,
    ownerId: string,
    leaseDurationMs: number,
  ): Promise<ReadingCapture> {
    if (
      typeof ownerId !== 'string' ||
      ownerId.trim().length === 0 ||
      !Number.isSafeInteger(leaseDurationMs) ||
      leaseDurationMs <= 0
    ) {
      throw new ReadingServiceError(
        'invalid_delivery_metadata',
        'A delivery owner and positive lease duration are required.',
      );
    }

    const current = await this.getCaptureForTransition(captureId, 'pending');
    const timestamp = this.now();
    const observedAtMs = Date.parse(timestamp);
    if (!Number.isFinite(observedAtMs)) {
      throw new ReadingServiceError(
        'invalid_delivery_metadata',
        'The delivery timestamp is invalid.',
      );
    }
    const leaseId = this.createLeaseId();
    if (typeof leaseId !== 'string' || leaseId.length === 0) {
      throw new ReadingServiceError(
        'invalid_delivery_metadata',
        'A delivery lease ID could not be generated.',
      );
    }
    const capture: ReadingCapture = {
      ...current,
      status: 'in_progress',
      deliveryAttempts: {
        count: current.deliveryAttempts.count + 1,
        lastAttemptAt: timestamp,
      },
      deliveryLease: {
        leaseId,
        ownerId: ownerId.trim(),
        acquiredAt: timestamp,
        expiresAt: new Date(observedAtMs + leaseDurationMs).toISOString(),
      },
      updatedAt: timestamp,
    };
    return this.executeTransition(current, capture, { kind: 'none' });
  }

  async confirmDelivery(
    captureId: string,
    leaseId: string,
  ): Promise<ReadingCapture> {
    this.validateLeaseId(leaseId);
    const current = await this.getCaptureForTransition(captureId, 'in_progress');
    const observedAt = this.now();
    const capture: ReadingCapture = {
      ...current,
      status: 'delivered',
      deliveryAttempts: {
        ...current.deliveryAttempts,
        lastErrorCode: undefined,
      },
      deliveryLease: undefined,
      deliveredAt: observedAt,
      updatedAt: observedAt,
    };
    return this.executeTransition(current, capture, {
      kind: 'current',
      leaseId,
      observedAt,
    });
  }

  async reportDeliveryFailure(
    captureId: string,
    leaseId: string,
    errorCode: string,
  ): Promise<ReadingCapture> {
    this.validateLeaseId(leaseId);
    if (!errorCode || !/^[A-Z0-9_]{1,64}$/.test(errorCode)) {
      throw new ReadingServiceError(
        'invalid_delivery_metadata',
        'A sanitized delivery error code is required.',
      );
    }
    const current = await this.getCaptureForTransition(captureId, 'in_progress');
    const observedAt = this.now();
    const capture: ReadingCapture = {
      ...current,
      status: 'needs_attention',
      deliveryAttempts: {
        ...current.deliveryAttempts,
        lastErrorCode: errorCode,
      },
      deliveryLease: undefined,
      updatedAt: observedAt,
    };
    return this.executeTransition(current, capture, {
      kind: 'current',
      leaseId,
      observedAt,
    });
  }

  async recoverExpiredLease(
    captureId: string,
    leaseId: string,
  ): Promise<ReadingCapture> {
    this.validateLeaseId(leaseId);
    const current = await this.getCaptureForTransition(captureId, 'in_progress');
    const observedAt = this.now();
    const capture: ReadingCapture = {
      ...current,
      status: 'pending',
      deliveryAttempts: {
        ...current.deliveryAttempts,
        lastErrorCode: undefined,
      },
      deliveryLease: undefined,
      updatedAt: observedAt,
    };
    return this.executeTransition(current, capture, {
      kind: 'expired',
      leaseId,
      observedAt,
    });
  }

  async retryCapture(captureId: string): Promise<ReadingCapture> {
    const current = await this.getCaptureForTransition(
      captureId,
      'needs_attention',
    );
    const observedAt = this.now();
    const capture: ReadingCapture = {
      ...current,
      status: 'pending',
      deliveryAttempts: {
        ...current.deliveryAttempts,
        lastErrorCode: undefined,
      },
      deliveryLease: undefined,
      updatedAt: observedAt,
    };
    return this.executeTransition(current, capture, { kind: 'none' });
  }

  private async getCaptureForTransition(
    captureId: string,
    expectedStatus: ReadingCapture['status'],
  ): Promise<ReadingCapture> {
    const current = await this.store.getCapture(captureId);
    if (!current) {
      throw new ReadingServiceError('capture_not_found', 'Capture not found.');
    }
    if (current.status !== expectedStatus) {
      throw new ReadingServiceError(
        'invalid_capture_transition',
        `Expected a ${expectedStatus} capture, but found ${current.status}.`,
      );
    }
    return current;
  }

  private validateLeaseId(leaseId: string): void {
    if (typeof leaseId !== 'string' || leaseId.length === 0) {
      throw new ReadingServiceError(
        'invalid_delivery_metadata',
        'A delivery lease ID is required.',
      );
    }
  }

  private async executeTransition(
    current: ReadingCapture,
    capture: ReadingCapture,
    leaseGuard: CaptureLeaseGuard,
  ): Promise<ReadingCapture> {
    const result = await this.store.transitionCapture({
      captureId: current.id,
      expectedStatus: current.status,
      leaseGuard,
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
      lease_conflict: {
        code: 'capture_lease_conflict',
        message: 'The delivery lease no longer matches the current capture.',
      },
      lease_expired: {
        code: 'capture_lease_expired',
        message: 'The delivery lease has expired.',
      },
      lease_not_expired: {
        code: 'capture_lease_not_expired',
        message: 'The delivery lease has not expired.',
      },
    };
    const failure = failures[result.outcome];
    throw new ReadingServiceError(failure.code, failure.message);
  }

  formatCapture(capture: ReadingCapture): string {
    return formatReadingCaptureMarkdown(capture);
  }
}
