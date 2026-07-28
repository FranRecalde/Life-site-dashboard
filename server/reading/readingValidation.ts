import {
  CreateReadingBookInput,
  CreateReadingCaptureInput,
  ReadingBookStatus,
  ReadingCaptureListFilter,
  ReadingCaptureStatus,
  ReadingCaptureType,
  ReadingSource,
  UpdateReadingBookInput,
} from '../../src/types';

const READING_SOURCES = new Set<ReadingSource>(['physical', 'kindle', 'audiobook']);
const CAPTURE_TYPES = new Set<ReadingCaptureType>([
  'thought',
  'quote_and_thought',
  'question',
  'action',
  'summary',
]);
const BOOK_STATUSES = new Set<ReadingBookStatus>(['active', 'archived']);
const CAPTURE_STATUSES = new Set<ReadingCaptureStatus>([
  'pending',
  'in_progress',
  'delivered',
  'needs_attention',
]);
const LOCATOR_KINDS = new Set(['page', 'location', 'chapter', 'timestamp']);

export class ReadingValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ReadingValidationError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ReadingValidationError('invalid_body', 'Request body must be an object.');
  }
  return value;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    throw new ReadingValidationError(
      'unexpected_field',
      `Field "${unknown}" is not allowed.`,
    );
  }
}

function requireTrimmedString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw new ReadingValidationError('invalid_field', `${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ReadingValidationError('invalid_field', `${field} is required.`);
  }
  if (trimmed.length > maxLength) {
    throw new ReadingValidationError(
      'invalid_field',
      `${field} cannot exceed ${maxLength} characters.`,
    );
  }
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new ReadingValidationError(
      'invalid_field',
      `${field} cannot contain control characters.`,
    );
  }
  return trimmed;
}

function optionalSource(value: unknown, field: string): ReadingSource | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !READING_SOURCES.has(value as ReadingSource)) {
    throw new ReadingValidationError(
      'invalid_source',
      `${field} must be physical, kindle, or audiobook.`,
    );
  }
  return value as ReadingSource;
}

function validateTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ReadingValidationError('invalid_tags', 'tags must be an array.');
  }
  if (value.length > 20) {
    throw new ReadingValidationError('invalid_tags', 'tags cannot contain more than 20 items.');
  }
  const tags = value.map((tag) => requireTrimmedString(tag, 'tag', 50));
  if (new Set(tags).size !== tags.length) {
    throw new ReadingValidationError('invalid_tags', 'tags cannot contain duplicates.');
  }
  return tags;
}

export function validateDestinationNotePath(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ReadingValidationError(
      'invalid_destination_path',
      'destinationNotePath must be a string.',
    );
  }
  if (!value || value !== value.trim() || value.length > 500) {
    throw new ReadingValidationError(
      'invalid_destination_path',
      'destinationNotePath must be an exact relative Markdown path.',
    );
  }
  if (
    value.includes('\\') ||
    value.startsWith('/') ||
    value.startsWith('//') ||
    /^[a-zA-Z]:/.test(value) ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new ReadingValidationError(
      'invalid_destination_path',
      'destinationNotePath must be a safe relative path.',
    );
  }
  const segments = value.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    segments.some((segment) => /[<>:"|?*]/.test(segment) || /[. ]$/.test(segment)) ||
    segments[0] !== 'Literature notes' ||
    segments.length < 2 ||
    !segments[segments.length - 1].endsWith('.md')
  ) {
    throw new ReadingValidationError(
      'invalid_destination_path',
      'destinationNotePath must point beneath Literature notes/ and end in .md.',
    );
  }
  return value;
}

export function validateCreateBookInput(value: unknown): CreateReadingBookInput {
  const body = requireRecord(value);
  rejectUnknownKeys(body, ['title', 'author', 'destinationNotePath', 'tags', 'defaultSource']);
  return {
    title: requireTrimmedString(body.title, 'title', 200),
    author: requireTrimmedString(body.author, 'author', 160),
    destinationNotePath: validateDestinationNotePath(body.destinationNotePath),
    tags: validateTags(body.tags),
    defaultSource: optionalSource(body.defaultSource, 'defaultSource'),
  };
}

export function validateUpdateBookInput(value: unknown): UpdateReadingBookInput {
  const body = requireRecord(value);
  rejectUnknownKeys(body, [
    'expectedRevision',
    'title',
    'author',
    'destinationNotePath',
    'tags',
    'defaultSource',
    'status',
  ]);
  if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) {
    throw new ReadingValidationError(
      'invalid_revision',
      'expectedRevision must be a positive integer.',
    );
  }
  const result: UpdateReadingBookInput = {
    expectedRevision: Number(body.expectedRevision),
  };
  if (body.title !== undefined) {
    result.title = requireTrimmedString(body.title, 'title', 200);
  }
  if (body.author !== undefined) {
    result.author = requireTrimmedString(body.author, 'author', 160);
  }
  if (body.destinationNotePath !== undefined) {
    result.destinationNotePath = validateDestinationNotePath(body.destinationNotePath);
  }
  if (body.tags !== undefined) {
    result.tags = validateTags(body.tags);
  }
  if (body.defaultSource === null) {
    result.defaultSource = null;
  } else if (body.defaultSource !== undefined) {
    result.defaultSource = optionalSource(body.defaultSource, 'defaultSource');
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !BOOK_STATUSES.has(body.status as ReadingBookStatus)) {
      throw new ReadingValidationError(
        'invalid_status',
        'status must be active or archived.',
      );
    }
    result.status = body.status as ReadingBookStatus;
  }
  if (Object.keys(result).length === 1) {
    throw new ReadingValidationError('empty_update', 'At least one book field is required.');
  }
  return result;
}

export function validateCreateCaptureInput(value: unknown): CreateReadingCaptureInput {
  const body = requireRecord(value);
  rejectUnknownKeys(body, ['bookId', 'originalText', 'captureType', 'source', 'locator']);
  const bookId = requireTrimmedString(body.bookId, 'bookId', 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(bookId)) {
    throw new ReadingValidationError('invalid_book_id', 'bookId is invalid.');
  }
  if (typeof body.originalText !== 'string' || !body.originalText.trim()) {
    throw new ReadingValidationError(
      'invalid_original_text',
      'originalText is required.',
    );
  }
  if (body.originalText.length > 50_000) {
    throw new ReadingValidationError(
      'invalid_original_text',
      'originalText cannot exceed 50000 characters.',
    );
  }
  if (
    typeof body.captureType !== 'string' ||
    !CAPTURE_TYPES.has(body.captureType as ReadingCaptureType)
  ) {
    throw new ReadingValidationError(
      'invalid_capture_type',
      'captureType is invalid.',
    );
  }

  let locator: CreateReadingCaptureInput['locator'];
  if (body.locator !== undefined) {
    if (!isRecord(body.locator)) {
      throw new ReadingValidationError('invalid_locator', 'locator must be an object.');
    }
    rejectUnknownKeys(body.locator, ['kind', 'value']);
    if (
      typeof body.locator.kind !== 'string' ||
      !LOCATOR_KINDS.has(body.locator.kind)
    ) {
      throw new ReadingValidationError('invalid_locator', 'locator kind is invalid.');
    }
    locator = {
      kind: body.locator.kind as NonNullable<CreateReadingCaptureInput['locator']>['kind'],
      value: requireTrimmedString(body.locator.value, 'locator value', 160),
    };
  }

  return {
    bookId,
    originalText: body.originalText,
    captureType: body.captureType as ReadingCaptureType,
    source: optionalSource(body.source, 'source'),
    locator,
  };
}

export function validateIdempotencyKey(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 16 ||
    value.length > 200 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new ReadingValidationError(
      'invalid_idempotency_key',
      'Idempotency-Key must be 16 to 200 printable characters.',
    );
  }
  return value;
}

export function validateCaptureListFilter(value: {
  bookId?: unknown;
  status?: unknown;
  limit?: unknown;
}): ReadingCaptureListFilter {
  const filter: ReadingCaptureListFilter = {};
  if (value.bookId !== undefined) {
    filter.bookId = requireTrimmedString(value.bookId, 'bookId', 128);
  }
  if (value.status !== undefined) {
    if (
      typeof value.status !== 'string' ||
      !CAPTURE_STATUSES.has(value.status as ReadingCaptureStatus)
    ) {
      throw new ReadingValidationError('invalid_status', 'Capture status is invalid.');
    }
    filter.status = value.status as ReadingCaptureStatus;
  }
  if (value.limit !== undefined) {
    const parsed = typeof value.limit === 'string' ? Number(value.limit) : value.limit;
    if (!Number.isSafeInteger(parsed) || Number(parsed) < 1 || Number(parsed) > 200) {
      throw new ReadingValidationError(
        'invalid_limit',
        'limit must be an integer between 1 and 200.',
      );
    }
    filter.limit = Number(parsed);
  }
  return filter;
}
