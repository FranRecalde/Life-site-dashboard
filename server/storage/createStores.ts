import path from 'path';
import { getFirestoreClient, testFirestoreConnection } from './firestoreClient';
import { SettingsStore, SessionStore, HabitStore, StorageProviderType, SessionData } from './types';
import { LocalSettingsStore } from './localSettingsStore';
import { MemorySessionStore } from './memorySessionStore';
import { FirestoreSettingsStore } from './firestoreSettingsStore';
import { FirestoreSessionStore } from './firestoreSessionStore';
import { LocalHabitStore } from './localHabitStore';
import { FirestoreHabitStore } from './firestoreHabitStore';
import { DualHabitStore } from './dualHabitStore';
import { UserSettings } from '../../src/types';
import {
  PersistentStorageConfiguration,
  requireValidPersistentStorageConfiguration,
  resolvePersistentStorageConfiguration,
} from './storageConfig';

// Dual Settings Store - writes to both, reads from Firestore with fallback to local
class DualSettingsStore implements SettingsStore {
  constructor(private local: SettingsStore, private firestore: FirestoreSettingsStore) {}

  async loadSettings(): Promise<UserSettings> {
    try {
      const docRef = (this.firestore as any).db.collection((this.firestore as any).collectionName).doc((this.firestore as any).docId);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        return await this.firestore.loadSettings();
      } else {
        // If the Firestore settings document is absent, seed it from the current local settings.
        const localSettings = await this.local.loadSettings();
        console.log('DualSettingsStore: Firestore settings document is absent. Seeding from local settings...');
        await this.firestore.saveSettings(localSettings);
        return localSettings;
      }
    } catch (e: any) {
      // Clear, redacted server logging for Firestore connection failures
      console.error('Firestore connection failure in DualSettingsStore.loadSettings:', e.message || e);
      console.warn('DualSettingsStore: Falling back to local file due to Firestore connection failure.');
      return await this.local.loadSettings();
    }
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    await Promise.all([
      this.local.saveSettings(settings).catch(e => console.error('DualSettingsStore: local save settings failed:', e.message || e)),
      this.firestore.saveSettings(settings).catch(e => console.error('Firestore connection failure in DualSettingsStore.saveSettings:', e.message || e))
    ]);
  }
}

// Dual Session Store - writes to both, reads from local with fallback to Firestore
class DualSessionStore implements SessionStore {
  constructor(private local: SessionStore, private firestore: SessionStore) {}

  async createSession(token: string, username: string, maxAgeMs: number): Promise<void> {
    await Promise.all([
      this.local.createSession(token, username, maxAgeMs).catch(e => console.error('DualSessionStore: local create session failed:', e.message || e)),
      this.firestore.createSession(token, username, maxAgeMs).catch(e => console.error('Firestore connection failure in DualSessionStore.createSession:', e.message || e))
    ]);
  }

  async getSession(token: string): Promise<SessionData | null> {
    let firestoreSession: SessionData | null = null;

    // Validate sessions through Firestore first
    try {
      firestoreSession = await this.firestore.getSession(token);
    } catch (e: any) {
      console.error('Firestore connection failure in DualSessionStore.getSession:', e.message || e);
    }

    if (firestoreSession) {
      if (this.isExpired(firestoreSession)) {
        console.log('DualSessionStore: Firestore session is expired.');
        return null;
      }
      return firestoreSession;
    }

    // Temporary memory fallback during migration
    try {
      const localSession = await this.local.getSession(token);
      if (localSession) {
        if (this.isExpired(localSession)) {
          console.log('DualSessionStore: Local memory session is expired.');
          return null;
        }
        console.log('DualSessionStore: Valid local memory session found (temporary fallback).');
        return localSession;
      }
    } catch (e: any) {
      console.error('DualSessionStore: Failed to fetch local session:', e.message || e);
    }

    return null;
  }

  async deleteSession(token: string): Promise<void> {
    await Promise.all([
      this.local.deleteSession(token).catch(e => console.error('DualSessionStore: local delete session failed:', e.message || e)),
      this.firestore.deleteSession(token).catch(e => console.error('Firestore connection failure in DualSessionStore.deleteSession:', e.message || e))
    ]);
  }

  isExpired(session: SessionData): boolean {
    return new Date(session.expiresAt).getTime() < Date.now();
  }
}

export interface Stores {
  settings: SettingsStore;
  sessions: SessionStore;
  habits: HabitStore;
  provider: StorageProviderType;
  testFirestoreConnection: () => Promise<boolean>;
}

/**
 * Factory to construct and return the chosen storage stores configuration.
 */
export function createStores(
  configuration: PersistentStorageConfiguration = resolvePersistentStorageConfiguration()
): Stores {
  requireValidPersistentStorageConfiguration(configuration);
  const provider = configuration.provider;
  
  const DATA_DIR = path.join(process.cwd(), 'data');
  const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
  const HABITS_FILE = path.join(DATA_DIR, 'habits.json');
  const HABIT_ENTRIES_FILE = path.join(DATA_DIR, 'habit_entries.json');

  const localSettings = new LocalSettingsStore(SETTINGS_FILE);
  const localSessions = new MemorySessionStore();
  const localHabits = new LocalHabitStore(HABITS_FILE, HABIT_ENTRIES_FILE);

  if (provider === 'firestore') {
    const db = getFirestoreClient(configuration.projectId!, configuration.databaseId!);
    return {
      settings: new FirestoreSettingsStore(db),
      sessions: new FirestoreSessionStore(db),
      habits: new FirestoreHabitStore(db),
      provider: 'firestore',
      testFirestoreConnection: () => testFirestoreConnection(db),
    };
  } else if (provider === 'dual') {
    // Dual mode is temporary development/migration tooling. Central validation
    // forbids it in production and Cloud Run so deployed failures cannot fall
    // back to ephemeral files or in-memory sessions.
    const db = getFirestoreClient(configuration.projectId!, configuration.databaseId!);
    return {
      settings: new DualSettingsStore(localSettings, new FirestoreSettingsStore(db)),
      sessions: new DualSessionStore(localSessions, new FirestoreSessionStore(db)),
      habits: new DualHabitStore(localHabits, new FirestoreHabitStore(db)),
      provider: 'dual',
      testFirestoreConnection: () => testFirestoreConnection(db),
    };
  } else {
    // Local storage is explicit and limited to non-deployed development/tests.
    return {
      settings: localSettings,
      sessions: localSessions,
      habits: localHabits,
      provider: 'local',
      testFirestoreConnection: async () => false,
    };
  }
}
