import fs from 'fs';
import path from 'path';
import { UserSettings } from '../../src/types';
import { SettingsStore } from './types';

export const defaultSettings: UserSettings = {
  theme: 'light',
  refreshIntervalMinutes: 5,
  defaultCalendarView: 'day',
  firstDayOfWeek: 'monday',
  dateFormat: 'british',
  notesDefaultMode: 'append',
  obsidian: {
    vaultName: "Francisco's Vault",
    personalFolder: 'Personal',
    professionalFolder: 'Professional',
    favoritesFolder: 'Favorites',
    inboxFolder: 'Fleeting Notes',
    personalInboxFile: 'Fleeting Notes/Personal Inbox.md',
    professionalInboxFile: 'Fleeting Notes/Professional Inbox.md',
    connectionMode: 'auto',
  },
  todoist: {
    personalLabel: 'personal',
    professionalLabel: 'professional',
  },
  weather: {
    location: 'Munich',
    units: 'C',
  },
  calendar: {
    selectedCalendarIds: ['primary'],
    workingHoursStart: '04:00',
    workingHoursEnd: '00:00',
  }
};

export class LocalSettingsStore implements SettingsStore {
  private settingsFile: string;

  constructor(settingsFile: string) {
    this.settingsFile = settingsFile;
  }

  async loadSettings(): Promise<UserSettings> {
    let settings = defaultSettings;
    if (fs.existsSync(this.settingsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.settingsFile, 'utf-8'));
        settings = { ...defaultSettings, ...data };
      } catch (e) {
        settings = defaultSettings;
      }
    } else {
      await this.saveSettings(defaultSettings);
    }

    // Migrate old default value "Inbox" to "Fleeting Notes"
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
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    const dir = path.dirname(this.settingsFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2));
  }
}
