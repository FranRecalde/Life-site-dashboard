import { Firestore } from '@google-cloud/firestore';
import { UserSettings } from '../../src/types';
import { SettingsStore } from './types';
import { defaultSettings } from './localSettingsStore';

export class FirestoreSettingsStore implements SettingsStore {
  private db: Firestore;
  private collectionName = 'settings';
  private docId = 'global_settings';

  constructor(db: Firestore) {
    this.db = db;
  }

  async loadSettings(): Promise<UserSettings> {
    try {
      const docRef = this.db.collection(this.collectionName).doc(this.docId);
      const docSnap = await docRef.get();
      let settings = defaultSettings;

      if (docSnap.exists) {
        const data = docSnap.data();
        if (data) {
          settings = { ...defaultSettings, ...data };
        }
      } else {
        // Pre-seed the document if it doesn't exist
        await this.saveSettings(defaultSettings);
      }

      // Keep the existing migration logic
      let migrated = false;
      if (settings.obsidian && settings.obsidian.inboxFolder === 'Inbox') {
        settings.obsidian.inboxFolder = 'Fleeting Notes';
        if (settings.obsidian.personalInboxFile === 'Inbox/Personal Inbox.md') {
          settings.obsidian.personalInboxFile = 'Fleeting Notes/Personal Inbox.md';
        }
        if (settings.obsidian.professionalInboxFile === 'Inbox/Professional Inbox.md') {
          settings.obsidian.professionalInboxFile = 'Fleeting Notes/Professional Inbox.md';
        }
        migrated = true;
      }

      if (settings.obsidian && settings.obsidian.vaultName === 'LifeVault') {
        settings.obsidian.vaultName = "Francisco's Vault";
        migrated = true;
      }

      if (migrated) {
        await this.saveSettings(settings);
      }

      return settings;
    } catch (e: any) {
      console.error('FirestoreSettingsStore.loadSettings connection failure:', e.message || e);
      throw e;
    }
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    try {
      const docRef = this.db.collection(this.collectionName).doc(this.docId);
      await docRef.set(settings, { merge: true });
    } catch (e: any) {
      console.error('FirestoreSettingsStore.saveSettings connection failure:', e.message || e);
      throw e;
    }
  }
}
