import { UserSettings, Habit, HabitEntry } from '../../src/types';

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

export type StorageProviderType = 'local' | 'dual' | 'firestore';
