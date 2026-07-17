import { Firestore } from '@google-cloud/firestore';
import { Habit, HabitEntry } from '../../src/types';
import { HabitStore } from './types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function cleanObject<T extends object>(obj: T): T {
  const result = { ...obj } as any;
  Object.keys(result).forEach(key => {
    if (result[key] === undefined) {
      delete result[key];
    }
  });
  return result;
}

export class FirestoreHabitStore implements HabitStore {
  private db: Firestore;
  private habitsCollection = 'habits';

  constructor(db: Firestore) {
    this.db = db;
  }

  async listHabits(context?: 'personal' | 'professional'): Promise<Habit[]> {
    const path = this.habitsCollection;
    try {
      let query: any = this.db.collection(this.habitsCollection);
      if (context) {
        query = query.where('context', '==', context);
      }
      const snapshot = await query.get();
      const habits: Habit[] = [];
      snapshot.forEach((doc: any) => {
        habits.push(doc.data() as Habit);
      });
      return habits;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async getHabit(id: string): Promise<Habit | null> {
    const path = `${this.habitsCollection}/${id}`;
    try {
      const docSnap = await this.db.collection(this.habitsCollection).doc(id).get();
      if (!docSnap.exists) return null;
      return docSnap.data() as Habit;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  async createHabit(habitData: Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'archived'>, pregeneratedId?: string): Promise<Habit> {
    const docRef = pregeneratedId 
      ? this.db.collection(this.habitsCollection).doc(pregeneratedId) 
      : this.db.collection(this.habitsCollection).doc();
    
    const path = `${this.habitsCollection}/${docRef.id}`;
    try {
      const now = new Date().toISOString();
      const newHabit: Habit = {
        ...habitData,
        id: docRef.id,
        archived: false,
        createdAt: now,
        updatedAt: now
      };
      await docRef.set(cleanObject(newHabit));
      return newHabit;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }

  async updateHabit(id: string, updates: Partial<Omit<Habit, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Habit | null> {
    const docRef = this.db.collection(this.habitsCollection).doc(id);
    const path = `${this.habitsCollection}/${id}`;
    try {
      const docSnap = await docRef.get();
      if (!docSnap.exists) return null;

      const now = new Date().toISOString();
      const existing = docSnap.data() as Habit;
      const updatedHabit: Habit = {
        ...existing,
        ...updates,
        updatedAt: now
      };
      await docRef.set(cleanObject(updatedHabit));
      return updatedHabit;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  async archiveHabit(id: string): Promise<Habit | null> {
    const now = new Date().toISOString();
    return this.updateHabit(id, { archived: true, archivedAt: now });
  }

  async unarchiveHabit(id: string): Promise<Habit | null> {
    const docRef = this.db.collection(this.habitsCollection).doc(id);
    const path = `${this.habitsCollection}/${id}`;
    try {
      const docSnap = await docRef.get();
      if (!docSnap.exists) return null;

      const now = new Date().toISOString();
      const existing = docSnap.data() as Habit;
      const updatedHabit: Habit = {
        ...existing,
        archived: false,
        archivedAt: undefined,
        updatedAt: now
      };
      await docRef.set(cleanObject(updatedHabit));
      return updatedHabit;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  async getEntries(habitId: string, startDate: string, endDate: string): Promise<HabitEntry[]> {
    const path = `${this.habitsCollection}/${habitId}/entries`;
    try {
      const snapshot = await this.db.collection(this.habitsCollection).doc(habitId)
        .collection('entries')
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .get();
      const entries: HabitEntry[] = [];
      snapshot.forEach((doc: any) => {
        entries.push(doc.data() as HabitEntry);
      });
      return entries.sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  async upsertEntry(habitId: string, date: string, completed: boolean): Promise<HabitEntry> {
    const docRef = this.db.collection(this.habitsCollection).doc(habitId).collection('entries').doc(date);
    const path = `${this.habitsCollection}/${habitId}/entries/${date}`;
    try {
      const now = new Date().toISOString();
      const entry: HabitEntry = {
        habitId,
        date,
        completed,
        completedAt: completed ? now : null,
        updatedAt: now
      };
      await docRef.set(cleanObject(entry));
      return entry;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  async deleteEntry(habitId: string, date: string): Promise<void> {
    const path = `${this.habitsCollection}/${habitId}/entries/${date}`;
    try {
      await this.db.collection(this.habitsCollection).doc(habitId).collection('entries').doc(date).delete();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}
