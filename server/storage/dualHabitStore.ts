import { Habit, HabitEntry } from '../../src/types';
import { HabitStore } from './types';

export class DualHabitStore implements HabitStore {
  constructor(private local: HabitStore, private firestore: HabitStore) {}

  async listHabits(context?: 'personal' | 'professional'): Promise<Habit[]> {
    try {
      return await this.firestore.listHabits(context);
    } catch (e: any) {
      console.error('Firestore connection failure in DualHabitStore.listHabits:', e.message || e);
      console.warn('DualHabitStore: Falling back to local store for listHabits.');
      return await this.local.listHabits(context);
    }
  }

  async getHabit(id: string): Promise<Habit | null> {
    try {
      return await this.firestore.getHabit(id);
    } catch (e: any) {
      console.error('Firestore connection failure in DualHabitStore.getHabit:', e.message || e);
      console.warn('DualHabitStore: Falling back to local store for getHabit.');
      return await this.local.getHabit(id);
    }
  }

  async createHabit(habitData: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'archived'>, pregeneratedId?: string): Promise<Habit> {
    const id = pregeneratedId || Math.random().toString(36).substring(2, 15);
    const [localResult, firestoreResult] = await Promise.allSettled([
      this.local.createHabit(habitData, id),
      this.firestore.createHabit(habitData, id)
    ]);

    if (firestoreResult.status === 'fulfilled') {
      return firestoreResult.value;
    } else {
      console.error('Firestore connection failure in DualHabitStore.createHabit:', firestoreResult.reason);
      if (localResult.status === 'fulfilled') {
        console.warn('DualHabitStore: Habit created in local store only.');
        return localResult.value;
      }
      throw new Error('Both local and Firestore habit creation failed');
    }
  }

  async updateHabit(id: string, updates: Partial<Omit<Habit, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Habit | null> {
    const [localResult, firestoreResult] = await Promise.allSettled([
      this.local.updateHabit(id, updates),
      this.firestore.updateHabit(id, updates)
    ]);

    if (firestoreResult.status === 'fulfilled') {
      return firestoreResult.value;
    } else {
      console.error('Firestore connection failure in DualHabitStore.updateHabit:', firestoreResult.reason);
      if (localResult.status === 'fulfilled') {
        console.warn('DualHabitStore: Habit updated in local store only.');
        return localResult.value;
      }
      return null;
    }
  }

  async archiveHabit(id: string): Promise<Habit | null> {
    const [localResult, firestoreResult] = await Promise.allSettled([
      this.local.archiveHabit(id),
      this.firestore.archiveHabit(id)
    ]);

    if (firestoreResult.status === 'fulfilled') {
      return firestoreResult.value;
    } else {
      console.error('Firestore connection failure in DualHabitStore.archiveHabit:', firestoreResult.reason);
      if (localResult.status === 'fulfilled') {
        console.warn('DualHabitStore: Habit archived in local store only.');
        return localResult.value;
      }
      return null;
    }
  }

  async unarchiveHabit(id: string): Promise<Habit | null> {
    const [localResult, firestoreResult] = await Promise.allSettled([
      this.local.unarchiveHabit(id),
      this.firestore.unarchiveHabit(id)
    ]);

    if (firestoreResult.status === 'fulfilled') {
      return firestoreResult.value;
    } else {
      console.error('Firestore connection failure in DualHabitStore.unarchiveHabit:', firestoreResult.reason);
      if (localResult.status === 'fulfilled') {
        console.warn('DualHabitStore: Habit unarchived in local store only.');
        return localResult.value;
      }
      return null;
    }
  }

  async getEntries(habitId: string, startDate: string, endDate: string): Promise<HabitEntry[]> {
    try {
      return await this.firestore.getEntries(habitId, startDate, endDate);
    } catch (e: any) {
      console.error('Firestore connection failure in DualHabitStore.getEntries:', e.message || e);
      console.warn('DualHabitStore: Falling back to local store for getEntries.');
      return await this.local.getEntries(habitId, startDate, endDate);
    }
  }

  async upsertEntry(habitId: string, date: string, completed: boolean): Promise<HabitEntry> {
    const [localResult, firestoreResult] = await Promise.allSettled([
      this.local.upsertEntry(habitId, date, completed),
      this.firestore.upsertEntry(habitId, date, completed)
    ]);

    if (firestoreResult.status === 'fulfilled') {
      return firestoreResult.value;
    } else {
      console.error('Firestore connection failure in DualHabitStore.upsertEntry:', firestoreResult.reason);
      if (localResult.status === 'fulfilled') {
        console.warn('DualHabitStore: Habit entry upserted in local store only.');
        return localResult.value;
      }
      throw new Error('Both local and Firestore habit entry upsert failed');
    }
  }

  async deleteEntry(habitId: string, date: string): Promise<void> {
    const [localResult, firestoreResult] = await Promise.allSettled([
      this.local.deleteEntry(habitId, date),
      this.firestore.deleteEntry(habitId, date)
    ]);

    if (firestoreResult.status === 'rejected') {
      console.error('Firestore connection failure in DualHabitStore.deleteEntry:', firestoreResult.reason);
    }
    if (localResult.status === 'rejected') {
      console.error('Local deleteEntry failed:', localResult.reason);
    }
  }
}
