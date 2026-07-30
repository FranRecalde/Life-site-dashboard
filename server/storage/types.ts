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

export interface CaptureCreateCommand {
  capture: ReadingCapture;
}

export type CaptureCreateResult =
  | { outcome: 'created'; capture: ReadingCapture }
  | { outcome: 'book_not_found' | 'book_inactive' | 'book_revision_conflict' };

export interface CaptureTransitionCommand {
  captureId: string;
  expectedStatus: ReadingCaptureStatus;
  expectedUpdatedAt: string;
  capture: ReadingCapture;
}

export type CaptureTransitionResult =
  | { outcome: 'updated'; capture: ReadingCapture }
  | { outcome: 'not_found' }
  | { outcome: 'state_conflict' };

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
    status: 'pending' | 'claimed',
  ): Promise<ReadingCapture[]>;
  getCapture(id: string): Promise<ReadingCapture | null>;
  createCapture(command: CaptureCreateCommand): Promise<CaptureCreateResult>;
  transitionCapture(command: CaptureTransitionCommand): Promise<CaptureTransitionResult>;
}

export type StorageProviderType = 'local' | 'dual' | 'firestore';
