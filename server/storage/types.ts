import {
  UserSettings,
  Habit,
  HabitEntry,
  ReadingBook,
  ReadingCapture,
  ReadingCaptureListFilter,
  ReadingCaptureStatus,
} from '../../src/types';

export interface SessionData {
  username: string;
  createdAt: string; // ISO String
  expiresAt: string; // ISO String
}

export interface SettingsStore {
  loadSettings(): Promise<UserSettings>;
  saveSettings(settings: UserSettings): Promise<void>;
}

export interface SessionStore {
  createSession(token: string, username: string, maxAgeMs: number): Promise<void>;
  getSession(token: string): Promise<SessionData | null>;
  deleteSession(token: string): Promise<void>;
  isExpired(session: SessionData): boolean;
}

export interface HabitStore {
  listHabits(context?: 'personal' | 'professional'): Promise<Habit[]>;
  getHabit(id: string): Promise<Habit | null>;
  createHabit(habitData: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'archived'>, pregeneratedId?: string): Promise<Habit>;
  updateHabit(id: string, updates: Partial<Omit<Habit, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Habit | null>;
  archiveHabit(id: string): Promise<Habit | null>;
  unarchiveHabit(id: string): Promise<Habit | null>;
  getEntries(habitId: string, startDate: string, endDate: string): Promise<HabitEntry[]>;
  upsertEntry(habitId: string, date: string, completed: boolean): Promise<HabitEntry>;
  deleteEntry(habitId: string, date: string): Promise<void>;
}

export type ReadingBookUpdateResult =
  | { outcome: 'updated'; book: ReadingBook }
  | { outcome: 'not_found' }
  | { outcome: 'revision_conflict' };

export interface IdempotentCaptureCreateCommand {
  idempotencyKeyHash: string;
  payloadHash: string;
  capture: ReadingCapture;
}

export type IdempotentCaptureCreateResult =
  | { outcome: 'created' | 'replayed'; capture: ReadingCapture }
  | { outcome: 'conflict' | 'book_not_found' | 'book_inactive' | 'book_revision_conflict' };

export interface CaptureTransitionCommand {
  captureId: string;
  expectedStatus: ReadingCaptureStatus;
  leaseGuard: CaptureLeaseGuard;
  capture: ReadingCapture;
}

export type CaptureLeaseGuard =
  | { kind: 'none' }
  | { kind: 'current'; leaseId: string; observedAt: string }
  | { kind: 'expired'; leaseId: string; observedAt: string };

export type CaptureLeaseGuardFailure =
  | 'lease_conflict'
  | 'lease_expired'
  | 'lease_not_expired';

export type CaptureTransitionResult =
  | { outcome: 'updated'; capture: ReadingCapture }
  | { outcome: 'not_found' }
  | { outcome: 'state_conflict' }
  | { outcome: CaptureLeaseGuardFailure };

export function getCaptureLeaseGuardFailure(
  capture: ReadingCapture,
  guard: CaptureLeaseGuard,
): CaptureLeaseGuardFailure | null {
  if (guard.kind === 'none') {
    return capture.deliveryLease ? 'lease_conflict' : null;
  }

  const lease = capture.deliveryLease;
  if (!lease || lease.leaseId !== guard.leaseId) {
    return 'lease_conflict';
  }

  const expiresAt = Date.parse(lease.expiresAt);
  const observedAt = Date.parse(guard.observedAt);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(observedAt)) {
    return 'lease_conflict';
  }

  if (guard.kind === 'current') {
    return expiresAt <= observedAt ? 'lease_expired' : null;
  }
  return expiresAt > observedAt ? 'lease_not_expired' : null;
}

export interface ReadingStore {
  listBooks(options?: { includeArchived?: boolean }): Promise<ReadingBook[]>;
  getBook(id: string): Promise<ReadingBook | null>;
  createBook(book: ReadingBook): Promise<ReadingBook>;
  updateBook(
    id: string,
    expectedRevision: number,
    book: ReadingBook,
  ): Promise<ReadingBookUpdateResult>;
  listCaptures(filter?: ReadingCaptureListFilter): Promise<ReadingCapture[]>;
  listCapturesForDelivery(
    status: 'pending' | 'in_progress',
  ): Promise<ReadingCapture[]>;
  getCapture(id: string): Promise<ReadingCapture | null>;
  createCaptureIdempotently(
    command: IdempotentCaptureCreateCommand,
  ): Promise<IdempotentCaptureCreateResult>;
  transitionCapture(command: CaptureTransitionCommand): Promise<CaptureTransitionResult>;
}

export type StorageProviderType = 'local' | 'dual' | 'firestore';
