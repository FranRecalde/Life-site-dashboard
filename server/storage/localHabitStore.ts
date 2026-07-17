import fs from 'fs';
import path from 'path';
import { Habit, HabitEntry } from '../../src/types';
import { HabitStore } from './types';

export class LocalHabitStore implements HabitStore {
  private habitsFile: string;
  private entriesFile: string;

  constructor(habitsFile: string, entriesFile: string) {
    this.habitsFile = habitsFile;
    this.entriesFile = entriesFile;
  }

  private ensureDir(): void {
    const habitsDir = path.dirname(this.habitsFile);
    if (!fs.existsSync(habitsDir)) {
      fs.mkdirSync(habitsDir, { recursive: true });
    }
    const entriesDir = path.dirname(this.entriesFile);
    if (!fs.existsSync(entriesDir)) {
      fs.mkdirSync(entriesDir, { recursive: true });
    }
  }

  private readHabits(): Habit[] {
    this.ensureDir();
    if (!fs.existsSync(this.habitsFile)) {
      fs.writeFileSync(this.habitsFile, JSON.stringify([], null, 2));
      return [];
    }
    try {
      return JSON.parse(fs.readFileSync(this.habitsFile, 'utf-8'));
    } catch (e) {
      return [];
    }
  }

  private writeHabits(habits: Habit[]): void {
    this.ensureDir();
    fs.writeFileSync(this.habitsFile, JSON.stringify(habits, null, 2));
  }

  private readEntries(): HabitEntry[] {
    this.ensureDir();
    if (!fs.existsSync(this.entriesFile)) {
      fs.writeFileSync(this.entriesFile, JSON.stringify([], null, 2));
      return [];
    }
    try {
      return JSON.parse(fs.readFileSync(this.entriesFile, 'utf-8'));
    } catch (e) {
      return [];
    }
  }

  private writeEntries(entries: HabitEntry[]): void {
    this.ensureDir();
    fs.writeFileSync(this.entriesFile, JSON.stringify(entries, null, 2));
  }

  async listHabits(context?: 'personal' | 'professional'): Promise<Habit[]> {
    const habits = this.readHabits();
    if (context) {
      return habits.filter(h => h.context === context);
    }
    return habits;
  }

  async getHabit(id: string): Promise<Habit | null> {
    const habits = this.readHabits();
    return habits.find(h => h.id === id) || null;
  }

  async createHabit(habitData: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'archived'>, pregeneratedId?: string): Promise<Habit> {
    const habits = this.readHabits();
    const now = new Date().toISOString();
    const id = pregeneratedId || Math.random().toString(36).substring(2, 15);
    const newHabit: Habit = {
      ...habitData,
      id,
      archived: false,
      createdAt: now,
      updatedAt: now
    };
    habits.push(newHabit);
    this.writeHabits(habits);
    return newHabit;
  }

  async updateHabit(id: string, updates: Partial<Omit<Habit, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Habit | null> {
    const habits = this.readHabits();
    const index = habits.findIndex(h => h.id === id);
    if (index === -1) return null;

    const now = new Date().toISOString();
    const updatedHabit: Habit = {
      ...habits[index],
      ...updates,
      updatedAt: now
    };

    habits[index] = updatedHabit;
    this.writeHabits(habits);
    return updatedHabit;
  }

  async archiveHabit(id: string): Promise<Habit | null> {
    const now = new Date().toISOString();
    return this.updateHabit(id, { archived: true, archivedAt: now });
  }

  async unarchiveHabit(id: string): Promise<Habit | null> {
    const habits = this.readHabits();
    const index = habits.findIndex(h => h.id === id);
    if (index === -1) return null;

    const now = new Date().toISOString();
    const updatedHabit: Habit = {
      ...habits[index],
      archived: false,
      archivedAt: undefined,
      updatedAt: now
    };
    // Delete archivedAt property
    delete updatedHabit.archivedAt;

    habits[index] = updatedHabit;
    this.writeHabits(habits);
    return updatedHabit;
  }

  async getEntries(habitId: string, startDate: string, endDate: string): Promise<HabitEntry[]> {
    const entries = this.readEntries();
    return entries.filter(e => 
      e.habitId === habitId && 
      e.date >= startDate && 
      e.date <= endDate
    ).sort((a, b) => a.date.localeCompare(b.date));
  }

  async upsertEntry(habitId: string, date: string, completed: boolean): Promise<HabitEntry> {
    const entries = this.readEntries();
    const index = entries.findIndex(e => e.habitId === habitId && e.date === date);
    const now = new Date().toISOString();

    if (index !== -1) {
      entries[index] = {
        ...entries[index],
        completed,
        completedAt: completed ? now : null,
        updatedAt: now
      };
      this.writeEntries(entries);
      return entries[index];
    } else {
      const newEntry: HabitEntry = {
        habitId,
        date,
        completed,
        completedAt: completed ? now : null,
        updatedAt: now
      };
      entries.push(newEntry);
      this.writeEntries(entries);
      return newEntry;
    }
  }

  async deleteEntry(habitId: string, date: string): Promise<void> {
    const entries = this.readEntries();
    const filtered = entries.filter(e => !(e.habitId === habitId && e.date === date));
    this.writeEntries(filtered);
  }
}
