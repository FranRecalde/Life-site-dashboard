import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { 
  UserSettings, 
  DashboardSnapshot, 
  CalendarEvent, 
  TodoistTask, 
  ObsidianNote, 
  WeatherSnapshot, 
  ServiceStatus,
  TodoistProjectSummary,
  TodoistProjectTask,
  TodoistSection
} from './src/types';
import { createStores, type Stores } from './server/storage/createStores';
import {
  evaluatePersistentStorageStatus,
  PersistentStorageConfigurationError,
  type PersistentStorageConfiguration,
  resolvePersistentStorageConfiguration,
  storageReadinessHttpStatus,
} from './server/storage/storageConfig';
import {
  evaluateSafeSecretAvailability,
  getSafeSecretConfigurationStatus,
  getSecretStore,
  getSecretProvider,
  redactSecrets,
  resolveSecretStoreConfiguration,
  type SafeSecretAvailabilityStatus,
} from './server/storage/secretStore';
import {
  buildGoogleAuthorizationUrl,
  buildGoogleRefreshTokenBody,
  buildGoogleTokenExchangeBody,
  createSignedGoogleOAuthState,
  isUsableGoogleOAuthSession,
  persistGoogleOAuthAuthorization,
  resolveGoogleOAuthRedirectUri,
  validateSignedGoogleOAuthState,
} from './server/auth/googleOAuth';
import {
  getLocalYYYYMMDD,
  calculateScheduledHabitStreak,
  calculateWeeklyTargetProgress,
  calculateCompletionRate
} from './src/services/habitEngine';
import { ReadingService } from './server/reading/readingService';
import { createReadingBrowserRouter } from './server/reading/readingBrowserRoutes';

const normalizeSecretValue = (value?: string | null): string =>
  typeof value === 'string' ? value.trim() : '';

export type ResolvedAuthConfig =
  | {
      ready: true;
      username: string;
      passwordHash: string;
      sessionSecret: string;
    }
  | {
      ready: false;
      reason:
        | 'missing_username'
        | 'missing_password_hash'
        | 'missing_session_secret'
        | 'default_username_forbidden'
        | 'default_password_forbidden'
        | 'invalid_password_hash'
        | 'secret_configuration_invalid';
    };

let resolvedAuthConfig: ResolvedAuthConfig = {
  ready: false,
  reason: 'missing_username'
};

function startInvalidStorageConfigurationServer(
  configuration: PersistentStorageConfiguration
): void {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'Life Site Dashboard', timestamp: new Date().toISOString() });
  });

  app.get('/api/readiness', async (_req, res) => {
    const storageStatus = await evaluatePersistentStorageStatus(configuration, async () => false);
    res.status(storageReadinessHttpStatus(storageStatus)).json({
      status: 'unavailable',
      details: {
        serverRunning: true,
        ...storageStatus,
      },
    });
  });

  // Configuration-invalid processes expose no normal application routes.
  app.use((_req, res) => {
    res.status(503).json({ status: 'unavailable', error: 'Persistent storage configuration is invalid.' });
  });

  app.listen(port, '0.0.0.0', () => {
    console.error(`Life Site diagnostic-only server running on port ${port}.`);
  });
}

// Validate persistent storage before any local files are created or normal routes start.
const PERSISTENT_STORAGE_CONFIGURATION = resolvePersistentStorageConfiguration();
const SECRET_STORE_CONFIGURATION = resolveSecretStoreConfiguration();
let resolvedStores: Stores | null = null;
try {
  resolvedStores = createStores(PERSISTENT_STORAGE_CONFIGURATION);
} catch (error) {
  if (!(error instanceof PersistentStorageConfigurationError)) {
    throw error;
  }
  console.error(`[Persistent Storage Configuration Error] ${error.message}`);
  startInvalidStorageConfigurationServer(PERSISTENT_STORAGE_CONFIGURATION);
}

if (resolvedStores) {
const STORES = resolvedStores;
const READING_SERVICE = new ReadingService(STORES.reading);

// Self-bootstrapping data directories
const DATA_DIR = path.join(process.cwd(), 'data');
const VAULT_DIR = path.join(DATA_DIR, 'vault');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure directories exist
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(VAULT_DIR, { recursive: true });

// Pre-seed Obsidian vault folders
const folders = ['Personal', 'Professional', 'Favorites', 'Inbox', 'Fleeting Notes'];
folders.forEach(f => {
  fs.mkdirSync(path.join(VAULT_DIR, f), { recursive: true });
});

// Helper to pre-seed default markdown files if vault is empty
function preseedVault() {
  const personalInbox = path.join(VAULT_DIR, 'Inbox', 'Personal Inbox.md');
  const professionalInbox = path.join(VAULT_DIR, 'Inbox', 'Professional Inbox.md');
  const personalFleeting = path.join(VAULT_DIR, 'Fleeting Notes', 'Personal Inbox.md');
  const professionalFleeting = path.join(VAULT_DIR, 'Fleeting Notes', 'Professional Inbox.md');

  if (!fs.existsSync(personalInbox)) {
    fs.writeFileSync(personalInbox, `# Personal Inbox\n\n- Remember to buy fresh coffee beans.\n- Schedule dentist appointment for Tuesday.`);
  }
  if (!fs.existsSync(professionalInbox)) {
    fs.writeFileSync(professionalInbox, `# Professional Inbox\n\n- Draft meeting recap for design review.\n- Update client proposal with new scoping details.`);
  }
  if (!fs.existsSync(personalFleeting)) {
    fs.writeFileSync(personalFleeting, `# Personal Inbox\n\n- Remember to buy fresh coffee beans.\n- Schedule dentist appointment for Tuesday.`);
  }
  if (!fs.existsSync(professionalFleeting)) {
    fs.writeFileSync(professionalFleeting, `# Professional Inbox\n\n- Draft meeting recap for design review.\n- Update client proposal with new scoping details.`);
  }
}
preseedVault();

// Default Settings values
const defaultSettings: UserSettings = {
  theme: 'light',
  refreshIntervalMinutes: 5,
  defaultCalendarView: 'day',
  firstDayOfWeek: 'monday',
  dateFormat: 'british',
  notesDefaultMode: 'append',
  obsidian: {
    vaultName: 'LifeVault',
    personalFolder: 'Personal',
    professionalFolder: 'Professional',
    favoritesFolder: 'Favorites',
    inboxFolder: 'Fleeting Notes',
    personalInboxFile: 'Fleeting Notes/Personal Inbox.md',
    professionalInboxFile: 'Fleeting Notes/Professional Inbox.md',
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

// Default Secrets values
type Secrets = {
  todoistToken: string;
  googleClientId: string;
  googleClientSecret: string;
  googleAccessToken: string;
  googleRefreshToken: string;
  googleTokenExpiry: number;
  googleWriteAuthorized?: boolean;
};

const defaultSecrets: Secrets = {
  todoistToken: '',
  googleClientId: '',
  googleClientSecret: '',
  googleAccessToken: '',
  googleRefreshToken: '',
  googleTokenExpiry: 0,
  googleWriteAuthorized: false,
};

// Load or initialize Settings delegating to STORES
async function loadSettings(): Promise<UserSettings> {
  return await STORES.settings.loadSettings();
}

async function saveSettings(settings: UserSettings): Promise<void> {
  await STORES.settings.saveSettings(settings);
}

// Load or initialize Secrets via SecretStore
let cachedSecrets: Secrets = { ...defaultSecrets };

let secretAvailability: SafeSecretAvailabilityStatus = {
  usernameSecretAvailable: false,
  passwordHashSecretAvailable: false,
  sessionSecretAvailable: false,
  requiredLoginSecretsAvailable: false,
  todoistSecretAvailable: false,
  googleClientIdSecretAvailable: false,
  googleClientSecretAvailable: false,
  googleRefreshTokenAvailable: false,
  googleWriteAuthorizedStateAvailable: false,
  writableOAuthSecretConfigurationReady: false,
};

async function initializeSecrets() {
  const provider = getSecretProvider(SECRET_STORE_CONFIGURATION);

  console.log(`[Secrets] Initializing secrets with provider: ${provider}`);

  if (!SECRET_STORE_CONFIGURATION.valid) {
    resolvedAuthConfig = { ready: false, reason: 'secret_configuration_invalid' };
    console.error(
      `[Secrets] Configuration unavailable. Reason: ${SECRET_STORE_CONFIGURATION.reason}.`,
    );
    return;
  }

  const store = getSecretStore(SECRET_STORE_CONFIGURATION);

  const getSafeSecret = async (secretId: string): Promise<string | null> => {
    try {
      return await store.getSecret(secretId);
    } catch {
      console.warn(`[Secrets] Secret retrieval failed. Reason: secret_read_failed.`);
      return null;
    }
  };

  const username = normalizeSecretValue(await getSafeSecret('LIFE_SITE_USERNAME'));
  const passwordHash = normalizeSecretValue(await getSafeSecret('LIFE_SITE_PASSWORD_HASH'));
  const sessionSecret = normalizeSecretValue(await getSafeSecret('SESSION_SECRET'));
  const todoistToken = normalizeSecretValue(await getSafeSecret('TODOIST_API_TOKEN'));
  const googleClientId = normalizeSecretValue(await getSafeSecret('GOOGLE_CLIENT_ID'));
  const googleClientSecret = normalizeSecretValue(await getSafeSecret('GOOGLE_CLIENT_SECRET'));
  const googleRefreshToken = normalizeSecretValue(await getSafeSecret('GOOGLE_REFRESH_TOKEN'));
  const googleWriteAuthorized = normalizeSecretValue(await getSafeSecret('GOOGLE_WRITE_AUTHORIZED'));

  cachedSecrets.todoistToken = todoistToken;
  cachedSecrets.googleClientId = googleClientId;
  cachedSecrets.googleClientSecret = googleClientSecret;
  cachedSecrets.googleRefreshToken = googleRefreshToken;
  cachedSecrets.googleWriteAuthorized = googleWriteAuthorized === 'true';

  secretAvailability = evaluateSafeSecretAvailability(SECRET_STORE_CONFIGURATION, {
    LIFE_SITE_USERNAME: username,
    LIFE_SITE_PASSWORD_HASH: passwordHash,
    SESSION_SECRET: sessionSecret,
    TODOIST_API_TOKEN: todoistToken,
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
    GOOGLE_REFRESH_TOKEN: googleRefreshToken,
    GOOGLE_WRITE_AUTHORIZED: googleWriteAuthorized,
  });

  if (SECRET_STORE_CONFIGURATION.provider === 'existing') {
    process.env.LIFE_SITE_USERNAME = username;
    process.env.LIFE_SITE_PASSWORD_HASH = passwordHash;
    process.env.SESSION_SECRET = sessionSecret;
    process.env.TODOIST_API_TOKEN = todoistToken;
    process.env.GOOGLE_CLIENT_ID = googleClientId;
    process.env.GOOGLE_CLIENT_SECRET = googleClientSecret;
    process.env.GOOGLE_REFRESH_TOKEN = googleRefreshToken;
    process.env.GOOGLE_WRITE_AUTHORIZED = googleWriteAuthorized;
  }

  const isProduction = SECRET_STORE_CONFIGURATION.deployedRuntime;

  if (!username) {
    resolvedAuthConfig = { ready: false, reason: 'missing_username' };
  } else if (!passwordHash) {
    resolvedAuthConfig = { ready: false, reason: 'missing_password_hash' };
  } else if (!sessionSecret) {
    resolvedAuthConfig = { ready: false, reason: 'missing_session_secret' };
  } else if (isProduction && username === 'admin') {
    resolvedAuthConfig = { ready: false, reason: 'default_username_forbidden' };
  } else if (isProduction && passwordHash === 'password') {
    resolvedAuthConfig = { ready: false, reason: 'default_password_forbidden' };
  } else if (isProduction && !isPasswordHashValid(passwordHash)) {
    resolvedAuthConfig = { ready: false, reason: 'invalid_password_hash' };
  } else if (!isProduction && passwordHash.includes('$') && !isPasswordHashValid(passwordHash)) {
    resolvedAuthConfig = { ready: false, reason: 'invalid_password_hash' };
  } else {
    resolvedAuthConfig = {
      ready: true,
      username,
      passwordHash,
      sessionSecret
    };
  }

  const authConfig = resolvedAuthConfig;
  if (authConfig.ready) {
    console.log(`[Secrets] Successfully completed secrets loading flow from ${provider}.`);
  } else {
    console.warn(`[Secrets] Configuration not ready from ${provider}. Reason: ${(authConfig as any).reason}`);
  }
}

function loadSecrets(): Secrets {
  return { ...cachedSecrets };
}

function getConfiguredSessionSecret(): string {
  return resolvedAuthConfig.ready ? resolvedAuthConfig.sessionSecret : '';
}

// Global console log override to redact secrets from all logs
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function getRedactableSecrets(): string[] {
  const list: string[] = [];
  try {
    const secrets = loadSecrets();
    if (secrets.todoistToken) list.push(secrets.todoistToken);
    if (secrets.googleClientId) list.push(secrets.googleClientId);
    if (secrets.googleClientSecret) list.push(secrets.googleClientSecret);
    if (secrets.googleAccessToken) list.push(secrets.googleAccessToken);
    if (secrets.googleRefreshToken) list.push(secrets.googleRefreshToken);
  } catch (e) {}
  
  if (process.env.LIFE_SITE_USERNAME) list.push(process.env.LIFE_SITE_USERNAME);
  if (process.env.LIFE_SITE_PASSWORD_HASH) list.push(process.env.LIFE_SITE_PASSWORD_HASH);
  if (process.env.SESSION_SECRET) list.push(process.env.SESSION_SECRET);
  if (process.env.TODOIST_API_TOKEN) list.push(process.env.TODOIST_API_TOKEN);
  
  return list.filter(Boolean);
}

function safeRedact(args: any[]): any[] {
  const known = getRedactableSecrets();
  return args.map(arg => {
    if (typeof arg === 'string') {
      return redactSecrets(arg, known);
    } else if (arg instanceof Error) {
      arg.message = redactSecrets(arg.message, known);
      if (arg.stack) {
        arg.stack = redactSecrets(arg.stack, known);
      }
      return arg;
    } else if (typeof arg === 'object' && arg !== null) {
      try {
        const json = JSON.stringify(arg);
        const redactedJson = redactSecrets(json, known);
        return JSON.parse(redactedJson);
      } catch (e) {
        return arg;
      }
    }
    return arg;
  });
}

console.log = (...args: any[]) => originalLog(...safeRedact(args));
console.error = (...args: any[]) => originalError(...safeRedact(args));
console.warn = (...args: any[]) => originalWarn(...safeRedact(args));

// Persistent sync-tracking helper
const SYNC_FILE = path.join(DATA_DIR, 'sync_tracking.json');

interface SyncTracking {
  google_calendar?: string;
  todoist?: string;
}

function loadSyncTracking(): SyncTracking {
  try {
    if (fs.existsSync(SYNC_FILE)) {
      return JSON.parse(fs.readFileSync(SYNC_FILE, 'utf-8'));
    }
  } catch (e) {
    // Ignore
  }
  return {};
}

function updateSyncTracking(service: 'google_calendar' | 'todoist', timestamp: string) {
  try {
    const data = loadSyncTracking();
    data[service] = timestamp;
    fs.writeFileSync(SYNC_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    // Ignore
  }
}

// Persistent dashboard snapshots caching helper
const CACHE_FILE = path.join(DATA_DIR, 'dashboard_cache.json');

interface DashboardCache {
  calendarEvents?: CalendarEvent[];
  tasks?: TodoistTask[];
  todoistProjects?: TodoistProjectSummary[];
  weather?: WeatherSnapshot;
  todoistSections?: TodoistSection[];
  todoistInboxProjectId?: string | null;
}

function loadDashboardCache(): DashboardCache {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  } catch (e) {
    // Ignore
  }
  return {};
}

function saveDashboardCache(data: Partial<DashboardCache>) {
  try {
    const existing = loadDashboardCache();
    const updated = { ...existing, ...data };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(updated, null, 2));
  } catch (e) {
    // Ignore
  }
}

// Basic Login Rate Limiting Configuration
const loginAttempts = new Map<string, { count: number; lockUntil: number }>();

function handleRateLimit(ip: string): { allowed: boolean; remainingMs?: number } {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (attempt) {
    if (attempt.lockUntil > now) {
      return { allowed: false, remainingMs: attempt.lockUntil - now };
    }
    if (now - attempt.lockUntil > 15 * 60 * 1000) {
      loginAttempts.set(ip, { count: 0, lockUntil: 0 });
      return { allowed: true };
    }
  }
  return { allowed: true };
}

function registerLoginAttempt(ip: string, success: boolean) {
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, lockUntil: 0 };
  if (success) {
    loginAttempts.delete(ip);
  } else {
    attempt.count += 1;
    if (attempt.count >= 5) {
      attempt.lockUntil = now + 15 * 60 * 1000;
    }
    loginAttempts.set(ip, attempt);
  }
}

async function saveSecretsAsync(secrets: Secrets) {
  const store = getSecretStore(SECRET_STORE_CONFIGURATION);
  const provider = getSecretProvider(SECRET_STORE_CONFIGURATION);

  const oldSecrets = { ...cachedSecrets };
  cachedSecrets = { ...secrets };

  try {
    if (provider === 'secretmanager') {
      if (secrets.todoistToken !== oldSecrets.todoistToken) {
        console.log('[Secrets] Saving TODOIST_API_TOKEN to Secret Manager...');
        await store.setSecretVersion('TODOIST_API_TOKEN', secrets.todoistToken);
      }
      if (secrets.googleClientId !== oldSecrets.googleClientId) {
        console.log('[Secrets] Saving GOOGLE_CLIENT_ID to Secret Manager...');
        await store.setSecretVersion('GOOGLE_CLIENT_ID', secrets.googleClientId);
      }
      if (secrets.googleClientSecret !== oldSecrets.googleClientSecret) {
        console.log('[Secrets] Saving GOOGLE_CLIENT_SECRET to Secret Manager...');
        await store.setSecretVersion('GOOGLE_CLIENT_SECRET', secrets.googleClientSecret);
      }
      if (secrets.googleRefreshToken && secrets.googleRefreshToken !== oldSecrets.googleRefreshToken) {
        console.log('[Secrets] Saving GOOGLE_REFRESH_TOKEN to Secret Manager...');
        await store.setSecretVersion('GOOGLE_REFRESH_TOKEN', secrets.googleRefreshToken);
      }
      if (secrets.googleWriteAuthorized !== oldSecrets.googleWriteAuthorized) {
        console.log('[Secrets] Saving GOOGLE_WRITE_AUTHORIZED to Secret Manager...');
        await store.setSecretVersion('GOOGLE_WRITE_AUTHORIZED', secrets.googleWriteAuthorized ? 'true' : 'false');
      }
    } else {
      if (secrets.todoistToken !== oldSecrets.todoistToken) {
        await store.setSecretVersion('TODOIST_API_TOKEN', secrets.todoistToken);
      }
      if (secrets.googleClientId !== oldSecrets.googleClientId) {
        await store.setSecretVersion('GOOGLE_CLIENT_ID', secrets.googleClientId);
      }
      if (secrets.googleClientSecret !== oldSecrets.googleClientSecret) {
        await store.setSecretVersion('GOOGLE_CLIENT_SECRET', secrets.googleClientSecret);
      }
      if (secrets.googleRefreshToken !== oldSecrets.googleRefreshToken) {
        await store.setSecretVersion('GOOGLE_REFRESH_TOKEN', secrets.googleRefreshToken);
      }
      if (secrets.googleWriteAuthorized !== oldSecrets.googleWriteAuthorized) {
        await store.setSecretVersion('GOOGLE_WRITE_AUTHORIZED', secrets.googleWriteAuthorized ? 'true' : 'false');
      }

    }
    secretAvailability.todoistSecretAvailable = !!secrets.todoistToken;
    secretAvailability.googleClientIdSecretAvailable = !!secrets.googleClientId;
    secretAvailability.googleClientSecretAvailable = !!secrets.googleClientSecret;
    secretAvailability.googleRefreshTokenAvailable = !!secrets.googleRefreshToken;
    secretAvailability.googleWriteAuthorizedStateAvailable = true;
  } catch {
    console.error(`[Secrets] Secret persistence failed for provider ${provider}.`);
    // Restore the old cache in case of failure so it stays in sync
    cachedSecrets = oldSecrets;
    throw new Error('secret_persistence_failed');
  }
}

async function saveSecrets(secrets: Secrets): Promise<void> {
  await saveSecretsAsync(secrets);
}

function isPasswordHashValid(hash: string): boolean {
  if (!hash) return false;
  const parts = hash.split('$');
  if (parts.length !== 4) return false;
  const [scheme, iterationsStr, salt, rawHash] = parts;
  if (scheme !== 'pbkdf2_sha256') return false;
  const iterations = parseInt(iterationsStr, 10);
  if (isNaN(iterations) || iterations <= 0) return false;
  if (!salt || salt.length === 0) return false;
  if (!rawHash || rawHash.length !== 64 || !/^[0-9a-fA-F]+$/.test(rawHash)) return false;
  return true;
}

// Password Verifier
function verifyPassword(password: string, storedHash: string): boolean {
  try {
    if (!storedHash) return false;
    // Expected format: pbkdf2_sha256$iterations$salt$hash
    const parts = storedHash.split('$');
    if (parts.length === 4) {
      const [scheme, iterationsStr, salt, hash] = parts;
      if (scheme !== 'pbkdf2_sha256') {
        return false;
      }
      const iterations = parseInt(iterationsStr, 10);
      if (isNaN(iterations) || iterations <= 0) {
        return false;
      }
      if (!salt || salt.length === 0) {
        return false;
      }
      if (!hash || hash.length !== 64 || !/^[0-9a-fA-F]+$/.test(hash)) {
        return false;
      }
      const testHash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
      const bufTest = Buffer.from(testHash, 'hex');
      const bufStored = Buffer.from(hash, 'hex');
      return crypto.timingSafeEqual(bufTest, bufStored);
    }
    // Remove the plaintext password fallback when NODE_ENV=production
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    // Plaintext fallback for easy config/development (e.g. LIFE_SITE_PASSWORD_HASH="password")
    if (password === storedHash) {
      console.warn('[Warning] Development plaintext password compatibility is active.');
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Weather caching
let cachedWeather: WeatherSnapshot | undefined = undefined;

// Startup validation errors tracker
const startupValidationErrors: string[] = [];

async function startServer() {
  await initializeSecrets();

  const secretProviderName = getSecretProvider(SECRET_STORE_CONFIGURATION);
  const safeSecretConfiguration = getSafeSecretConfigurationStatus(SECRET_STORE_CONFIGURATION);
  const username = resolvedAuthConfig.ready ? resolvedAuthConfig.username : '';
  const passwordHash = resolvedAuthConfig.ready ? resolvedAuthConfig.passwordHash : '';
  const sessionSecret = resolvedAuthConfig.ready ? resolvedAuthConfig.sessionSecret : '';

  // Print safe configuration facts on startup
  console.log(`[Startup Info] Secret Provider: ${secretProviderName}`);
  console.log(`[Startup Info] Username Configured: ${!!username}`);
  console.log(`[Startup Info] Password Hash Configured: ${!!passwordHash}`);
  console.log(`[Startup Info] Password Hash Format Valid: ${isPasswordHashValid(passwordHash)}`);
  console.log(`[Startup Info] Session Secret Configured: ${!!sessionSecret}`);
  console.log(`[Startup Info] Secret Manager Project Configured: ${safeSecretConfiguration.secretManagerProjectConfigured}`);
  console.log(`[Startup Info] Secret Name Prefix Configured: ${safeSecretConfiguration.secretNamePrefixConfigured}`);
  console.log(`[Startup Info] Secret Configuration Valid: ${safeSecretConfiguration.secretConfigurationValid}`);
  console.log(`[Startup Info] Deployed Runtime: ${PERSISTENT_STORAGE_CONFIGURATION.deployedRuntime}`);
  console.log(`[Startup Info] Storage Provider: ${STORES.provider}`);
  console.log(`[Startup Info] Firestore Project Configured: ${PERSISTENT_STORAGE_CONFIGURATION.firestoreProjectConfigured}`);
  console.log(`[Startup Info] Firestore Database Configured: ${PERSISTENT_STORAGE_CONFIGURATION.firestoreDatabaseConfigured}`);

  const authConfig = resolvedAuthConfig;
  // Validate required production configuration during startup (Requirement 1 & 2)
  if (SECRET_STORE_CONFIGURATION.deployedRuntime) {
    if (!SECRET_STORE_CONFIGURATION.valid) {
      startupValidationErrors.push(`secret_configuration_${SECRET_STORE_CONFIGURATION.reason}`);
    }
    if (!authConfig.ready) {
      const unready = authConfig as any;
      if (unready.reason === 'missing_username') {
        startupValidationErrors.push('LIFE_SITE_USERNAME must be set when NODE_ENV=production.');
      } else if (unready.reason === 'missing_password_hash') {
        startupValidationErrors.push('LIFE_SITE_PASSWORD_HASH must be set when NODE_ENV=production.');
      } else if (unready.reason === 'missing_session_secret') {
        startupValidationErrors.push('SESSION_SECRET must be set when running in a deployed environment.');
      } else if (unready.reason === 'default_username_forbidden') {
        startupValidationErrors.push('LIFE_SITE_USERNAME must be set and cannot be the default "admin" when NODE_ENV=production.');
      } else if (unready.reason === 'default_password_forbidden') {
        startupValidationErrors.push('LIFE_SITE_PASSWORD_HASH must be set and cannot be the default "password" when NODE_ENV=production.');
      } else if (unready.reason === 'invalid_password_hash') {
        startupValidationErrors.push('LIFE_SITE_PASSWORD_HASH must use secure PBKDF2 hash scheme (starting with pbkdf2_sha256$) and be syntactically valid when NODE_ENV=production. Plaintext password fallbacks are forbidden.');
      }
    }

    if (startupValidationErrors.length > 0) {
      console.error('[Startup Validation Error] Production configuration is invalid:\n' + startupValidationErrors.map(e => `- ${e}`).join('\n'));
    } else {
      console.log('[Startup Validation] Production configuration successfully validated.');
    }
  }

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json());

  // Simple custom cookie parser middleware
  app.use((req: any, res, next) => {
    const list: Record<string, string> = {};
    const rc = req.headers.cookie;
    if (rc) {
      rc.split(';').forEach((cookie: string) => {
        const parts = cookie.split('=');
        list[parts.shift()!.trim()] = decodeURIComponent(parts.join('='));
      });
    }
    req.cookies = list;
    next();
  });

  // Authentication Middleware
  const authMiddleware = async (req: any, res: any, next: any) => {
    let sessionToken = req.cookies.session_token;

    // Fallback to Authorization Header for iframe environments
    if (!sessionToken && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        sessionToken = parts[1];
      }
    }

    if (!sessionToken) {
      return res.status(401).json({ success: false, error: 'Unauthenticated' });
    }
    try {
      const session = await STORES.sessions.getSession(sessionToken);
      if (!session || STORES.sessions.isExpired(session)) {
        if (session) {
          try {
            await STORES.sessions.deleteSession(sessionToken);
          } catch (e) {
            // Log and ignore to prevent blocking cookie clearance
          }
        }
        res.clearCookie('session_token', { path: '/', sameSite: 'none', secure: true });
        return res.status(401).json({ success: false, error: 'Session expired' });
      }
      req.user = session.username;
      next();
    } catch (err: any) {
      if (STORES.provider === 'firestore') {
        console.error('Firestore connection failure in authMiddleware:', err.message || err);
        return res.status(503).json({ success: false, error: 'Service Unavailable', message: 'Persistent storage is unavailable.' });
      }
      next(err);
    }
  };

  app.use(
    '/api/reading',
    authMiddleware,
    createReadingBrowserRouter(READING_SERVICE),
  );

  // -------------------------------------------------------------
  // Public Routes
  // -------------------------------------------------------------

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'Life Site Dashboard', timestamp: new Date().toISOString() });
  });

  app.get('/api/readiness', async (req, res) => {
    try {
      const serverRunning = true;
      const storageStatus = await evaluatePersistentStorageStatus(
        PERSISTENT_STORAGE_CONFIGURATION,
        STORES.testFirestoreConnection
      );

      const safeSecretConfiguration = getSafeSecretConfigurationStatus(SECRET_STORE_CONFIGURATION);
      const authConfig = resolvedAuthConfig;
      const usernameVal = authConfig.ready ? authConfig.username : '';
      const passwordHashVal = authConfig.ready ? authConfig.passwordHash : '';
      const sessionSecretVal = authConfig.ready ? authConfig.sessionSecret : '';

      const usernameConfigured = !!usernameVal;
      const passwordHashConfigured = !!passwordHashVal;
      const passwordHashFormatValid = isPasswordHashValid(passwordHashVal);
      const sessionSecretConfigured = !!sessionSecretVal;
      const authConfigurationReady = authConfig.ready;
      const authConfigurationReason = !authConfig.ready ? (authConfig as any).reason : 'ready';

      const productionConfigValid = startupValidationErrors.length === 0;

      const status =
        serverRunning &&
        storageStatus.persistentStorageReady &&
        safeSecretConfiguration.secretConfigurationValid &&
        authConfigurationReady &&
        productionConfigValid;

      if (!status) {
        return res.status(503).json({
          status: 'unavailable',
          details: {
            serverRunning,
            ...storageStatus,
            ...safeSecretConfiguration,
            ...secretAvailability,
            usernameConfigured,
            passwordHashConfigured,
            passwordHashFormatValid,
            sessionSecretConfigured,
            authConfigurationReady,
            authConfigurationReason,
            productionConfigValid,
            startupValidationErrors: startupValidationErrors.length > 0 ? startupValidationErrors : undefined
          }
        });
      }

      res.json({
        status: 'ready',
        details: {
          serverRunning,
          ...storageStatus,
          ...safeSecretConfiguration,
          ...secretAvailability,
          usernameConfigured,
          passwordHashConfigured,
          passwordHashFormatValid,
          sessionSecretConfigured,
          authConfigurationReady,
          authConfigurationReason,
          productionConfigValid
        }
      });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const rateCheck = handleRateLimit(String(ip));
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `Too many login attempts. Please try again in ${Math.ceil((rateCheck.remainingMs || 0) / 1000 / 60)} minutes.`
      });
    }

    const { username, password } = req.body;
    const authConfig = resolvedAuthConfig;

     // 1. Confirm that username and password configuration required for the current environment is available
     if (!authConfig.ready) {
       console.warn(`[Login Error] Login configuration is unavailable. Internal Reason: ${(authConfig as any).reason}`);
       return res.status(503).json({
         success: false,
         error: 'Login configuration is unavailable',
         code: 'AUTH_CONFIGURATION_UNAVAILABLE'
       });
     }
 
     // 2. In production, validate PBKDF2 format (this is guaranteed since resolvedAuthConfig.ready is true)
     // 3. In development/preview, allow the existing development-compatible password format (guaranteed as well)
 
     // 4. Compare the submitted credentials
     const expectedUser = (authConfig as any).username || '';
     const expectedHash = (authConfig as any).passwordHash || '';

    if (username !== expectedUser) {
      registerLoginAttempt(String(ip), false);
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const isValid = verifyPassword(password, expectedHash);
    if (!isValid) {
      registerLoginAttempt(String(ip), false);
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    registerLoginAttempt(String(ip), true);

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days

    // 5. Create the session through the selected SessionStore
    try {
      await STORES.sessions.createSession(sessionToken, username, maxAgeMs);
    } catch (err: any) {
      console.error('Persistent storage failure in login:', err.message || err);
      return res.status(503).json({
        success: false,
        error: 'Persistent storage is unavailable'
      });
    }

    // 6. Return success only after session creation succeeds
    res.cookie('session_token', sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      secure: true
    });

    res.json({ success: true, username, token: sessionToken });
  });

  app.post('/api/auth/logout', async (req: any, res) => {
    let sessionToken = req.cookies.session_token;
    if (!sessionToken && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        sessionToken = parts[1];
      }
    }
    if (sessionToken) {
      try {
        await STORES.sessions.deleteSession(sessionToken);
      } catch (err: any) {
        if (STORES.provider === 'firestore') {
          console.error('Firestore connection failure in logout:', err.message || err);
          return res.status(503).json({ success: false, error: 'Service Unavailable', message: 'Persistent storage is unavailable.' });
        }
        throw err;
      }
    }
    res.clearCookie('session_token', { path: '/', sameSite: 'none', secure: true });
    res.json({ success: true });
  });

  app.get('/api/auth/me', async (req: any, res) => {
    let sessionToken = req.cookies.session_token;
    if (!sessionToken && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        sessionToken = parts[1];
      }
    }
    if (!sessionToken) {
      return res.json({ authenticated: false });
    }
    try {
      const session = await STORES.sessions.getSession(sessionToken);
      if (!session || STORES.sessions.isExpired(session)) {
        if (session) {
          try {
            await STORES.sessions.deleteSession(sessionToken);
          } catch (e) {
            // Ignore failure to delete session when expired to prevent login loop
          }
        }
        res.clearCookie('session_token', { path: '/', sameSite: 'none', secure: true });
        return res.json({ authenticated: false });
      }
      res.json({ authenticated: true, username: session.username });
    } catch (err: any) {
      if (STORES.provider === 'firestore') {
        console.error('Firestore connection failure in /api/auth/me:', err.message || err);
        return res.status(503).json({ success: false, error: 'Service Unavailable', message: 'Persistent storage is unavailable.' });
      }
      throw err;
    }
  });

  // -------------------------------------------------------------
  // Protected Routes
  // -------------------------------------------------------------

  app.get('/api/settings', authMiddleware, async (req, res) => {
    try {
      const settings = await loadSettings();
      res.json({ success: true, data: settings });
    } catch (err: any) {
      if (STORES.provider === 'firestore') {
        console.error('Firestore connection failure in GET /api/settings:', err.message || err);
        return res.status(503).json({ success: false, error: 'Service Unavailable', message: 'Persistent storage is unavailable.' });
      }
      throw err;
    }
  });

  // Protected settings non-secret export endpoint (Requirement 13)
  app.get('/api/settings/export', authMiddleware, async (req, res) => {
    try {
      const settings = await loadSettings();
      res.json({
        success: true,
        exportType: 'non-secret-settings',
        timestamp: new Date().toISOString(),
        settings: {
          theme: settings.theme,
          refreshIntervalMinutes: settings.refreshIntervalMinutes,
          defaultCalendarView: settings.defaultCalendarView,
          firstDayOfWeek: settings.firstDayOfWeek,
          dateFormat: settings.dateFormat,
          notesDefaultMode: settings.notesDefaultMode,
          obsidian: settings.obsidian,
          todoist: settings.todoist,
          weather: settings.weather,
          calendar: settings.calendar
        }
      });
    } catch (err: any) {
      console.error('Failed to export settings:', err.message || err);
      res.status(500).json({ success: false, error: 'Failed to export settings.' });
    }
  });

  app.put('/api/settings', authMiddleware, async (req, res) => {
    try {
      const settings = await loadSettings();
      const updated = { ...settings, ...req.body };
      await saveSettings(updated);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      if (STORES.provider === 'firestore') {
        console.error('Firestore connection failure in PUT /api/settings:', err.message || err);
        return res.status(503).json({ success: false, error: 'Service Unavailable', message: 'Persistent storage is unavailable.' });
      }
      throw err;
    }
  });

  // Protected settings persistence confirmation endpoint
  app.get('/api/settings/confirm-persistence', authMiddleware, async (req, res) => {
    try {
      const settings = await loadSettings();
      res.json({
        success: true,
        persisted: true,
        provider: STORES.provider,
        timestamp: new Date().toISOString(),
        data: {
          theme: settings.theme,
          refreshIntervalMinutes: settings.refreshIntervalMinutes,
        }
      });
    } catch (err: any) {
      if (STORES.provider === 'firestore') {
        console.error('Firestore connection failure in confirm-persistence:', err.message || err);
        return res.status(503).json({ success: false, error: 'Service Unavailable', message: 'Persistent storage is unavailable.' });
      }
      res.status(500).json({
        success: false,
        persisted: false,
        provider: STORES.provider,
        error: err.message
      });
    }
  });

  // Connections setup secure endpoint (stores tokens server-side only)
  app.get('/api/settings/connections', authMiddleware, (req, res) => {
    const secrets = loadSecrets();
    res.json({
      success: true,
      data: {
        todoistToken: secrets.todoistToken ? 'configured' : 'not_configured',
        todoistConfigured: !!getTodoistToken(),
        googleClientId: secrets.googleClientId ? 'configured' : 'not_configured',
        googleClientSecret: secrets.googleClientSecret ? 'configured' : 'not_configured',
        googleConnected: secrets.googleRefreshToken ? 'connected' : 'disconnected',
        googleWriteAuthorized: !!secrets.googleWriteAuthorized
      }
    });
  });

  app.get('/api/storage/diagnostic', authMiddleware, async (req, res) => {
    const storageStatus = await evaluatePersistentStorageStatus(
      PERSISTENT_STORAGE_CONFIGURATION,
      STORES.testFirestoreConnection
    );
    const safeSecretConfiguration = getSafeSecretConfigurationStatus(SECRET_STORE_CONFIGURATION);
    const diagnosticReady =
      storageStatus.persistentStorageReady &&
      safeSecretConfiguration.secretConfigurationValid &&
      secretAvailability.requiredLoginSecretsAvailable;
    res.status(diagnosticReady ? 200 : 503).json({
      success: diagnosticReady,
      provider: storageStatus.storageProvider,
      deployedRuntime: storageStatus.deployedRuntime,
      projectConfigured: storageStatus.firestoreProjectConfigured,
      databaseConfigured: storageStatus.firestoreDatabaseConfigured,
      configurationValid: storageStatus.persistentStorageConfigurationValid,
      firestoreReachable: storageStatus.firestoreReachable,
      persistentStorageReady: storageStatus.persistentStorageReady,
      ...safeSecretConfiguration,
      ...secretAvailability,
    });
  });

  app.post('/api/settings/connections', authMiddleware, async (req, res) => {
    try {
      const secrets = loadSecrets();
      const { todoistToken, googleClientId, googleClientSecret, action } = req.body;

      if (action === 'remove_todoist_token') {
        secrets.todoistToken = '';
        await saveSecrets(secrets);
        return res.json({ success: true, message: 'Todoist token removed successfully.' });
      }

      if (todoistToken !== undefined) {
        const lowerToken = todoistToken.trim().toLowerCase();
        if (lowerToken !== '' && lowerToken !== 'configured' && lowerToken !== 'not_configured') {
          const cleaned = todoistToken.trim().replace(/\r?\n|\r/g, '').replace(/^Bearer\s+/i, '');
          secrets.todoistToken = cleaned;
        } else if (todoistToken === '') {
          secrets.todoistToken = '';
        }
      }
      if (googleClientId !== undefined) {
        const lowerClientId = googleClientId.trim().toLowerCase();
        if (lowerClientId !== '' && lowerClientId !== 'configured' && lowerClientId !== 'not_configured') {
          secrets.googleClientId = googleClientId.trim();
        } else if (googleClientId === '') {
          secrets.googleClientId = '';
        }
      }
      if (googleClientSecret !== undefined) {
        const lowerSecret = googleClientSecret.trim().toLowerCase();
        if (lowerSecret !== '' && lowerSecret !== 'configured' && lowerSecret !== 'not_configured') {
          secrets.googleClientSecret = googleClientSecret;
        } else if (googleClientSecret === '') {
          secrets.googleClientSecret = '';
        }
      }

      await saveSecrets(secrets);
      res.json({ success: true, message: 'Connections configuration saved securely.' });
    } catch (err: any) {
      console.error('Failed to save connections configuration:', redactSecrets(err.message || err));
      res.status(500).json({ success: false, error: 'Failed to persist connections configuration securely.' });
    }
  });

  // -------------------------------------------------------------
  // Google OAuth Flow for Google Calendar
  // -------------------------------------------------------------

  const googleOAuthRuntime = {
    nodeEnv: process.env.NODE_ENV,
    cloudRunService: process.env.K_SERVICE,
  };

  app.get('/api/auth/google/url', authMiddleware, (req: any, res) => {
    let redirectUri: string;
    try {
      redirectUri = resolveGoogleOAuthRedirectUri({
        host: req.get('host'),
        forwardedHost: req.get('x-forwarded-host'),
        forwardedProtocol: req.get('x-forwarded-proto'),
        protocol: req.protocol,
      }, googleOAuthRuntime);
    } catch {
      return res.status(400).json({ success: false, error: 'Unapproved OAuth request host' });
    }

    const secrets = loadSecrets();
    const clientId = secrets.googleClientId;

    if (!clientId) {
      return res.status(400).json({ success: false, error: 'Google Client ID is not configured' });
    }

    // Least-privilege combination: read-only calendar list, and read/write calendar events
    const scope = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';

    // Generate signed state tied to session
    let sessionToken = req.cookies.session_token;
    if (!sessionToken && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        sessionToken = parts[1];
      }
    }

    if (!sessionToken) {
      return res.status(401).json({ success: false, error: 'Unauthenticated' });
    }

    const sessionSecretVal = getConfiguredSessionSecret();
    if (!sessionSecretVal) {
      return res.status(503).json({ success: false, error: 'Login configuration is unavailable' });
    }
    const stateValue = createSignedGoogleOAuthState(sessionToken, sessionSecretVal);

    const authUrl = buildGoogleAuthorizationUrl(clientId, redirectUri, scope, stateValue);

    res.json({ success: true, url: authUrl });
  });

  app.get('/api/auth/google/callback', async (req: any, res) => {
    let redirectUri: string;
    try {
      redirectUri = resolveGoogleOAuthRedirectUri({
        host: req.get('host'),
        forwardedHost: req.get('x-forwarded-host'),
        forwardedProtocol: req.get('x-forwarded-proto'),
        protocol: req.protocol,
      }, googleOAuthRuntime);
    } catch {
      return res.status(400).send('Unapproved OAuth request host');
    }

    const code = req.query.code as string;
    if (!code) {
      return res.redirect('/?error=oauth_failed');
    }

    const state = req.query.state as string;
    if (!state) {
      return res.status(400).send('OAuth state parameter is missing');
    }

    // Tie it to the authenticated session
    let sessionToken = req.cookies.session_token;
    if (!sessionToken && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        sessionToken = parts[1];
      }
    }

    if (!sessionToken) {
      return res.status(400).send('Session token is missing for OAuth state validation');
    }

    const session = await STORES.sessions.getSession(sessionToken);
    if (!isUsableGoogleOAuthSession(session, storedSession => STORES.sessions.isExpired(storedSession))) {
      return res.status(400).send('Session has expired or is invalid');
    }

    // Sign it using the existing server session secret
    const sessionSecretVal = getConfiguredSessionSecret();
    if (!sessionSecretVal) {
      return res.status(503).send('Login configuration is unavailable');
    }
    const stateValidation = validateSignedGoogleOAuthState(state, sessionToken, sessionSecretVal);
    if ('reason' in stateValidation) {
      if (stateValidation.reason === 'malformed') {
        return res.status(400).send('OAuth state parameter is malformed');
      }
      if (stateValidation.reason === 'expired') {
        return res.status(400).send('OAuth state parameter has expired');
      }
      return res.status(400).send('OAuth state parameter signature is invalid');
    }

    try {
      const secrets = loadSecrets();
      const clientId = secrets.googleClientId;
      const clientSecret = secrets.googleClientSecret;

      if (!clientId || !clientSecret) {
        return res.status(400).send('Google credentials missing on server.');
      }

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: buildGoogleTokenExchangeBody(code, clientId, clientSecret, redirectUri)
      });

      const tokenData = await response.json();
      if (!response.ok) {
        console.error('Google token exchange failed. Reason: token_exchange_rejected.');
        return res.status(400).send('OAuth Token exchange failed');
      }

      const durableState = await persistGoogleOAuthAuthorization(
        getSecretStore(SECRET_STORE_CONFIGURATION),
        {
          refreshToken: secrets.googleRefreshToken,
          writeAuthorized: !!secrets.googleWriteAuthorized,
        },
        tokenData.refresh_token,
      );

      cachedSecrets = {
        ...secrets,
        googleAccessToken: typeof tokenData.access_token === 'string' ? tokenData.access_token : '',
        googleRefreshToken: durableState.refreshToken,
        googleTokenExpiry:
          typeof tokenData.expires_in === 'number'
            ? Date.now() + (tokenData.expires_in * 1000)
            : 0,
        googleWriteAuthorized: durableState.writeAuthorized,
      };
      secretAvailability.googleRefreshTokenAvailable = !!durableState.refreshToken;
      secretAvailability.googleWriteAuthorizedStateAvailable = true;

      // Redirect user back to settings with success parameter
      res.redirect('/?google_connected=true');
    } catch {
      console.error('Google OAuth callback failed. Reason: oauth_callback_failed.');
      res.status(500).send('Internal Server Error during Google Calendar authentication');
    }
  });

  // Automated Token Refresher Helper
  async function getGoogleAccessToken(): Promise<string | null> {
    const secrets = loadSecrets();
    const clientId = secrets.googleClientId;
    const clientSecret = secrets.googleClientSecret;
    const refreshToken = secrets.googleRefreshToken;

    if (!refreshToken || !clientId || !clientSecret) {
      return null;
    }

    // If still valid for another 60 seconds, reuse it
    if (secrets.googleAccessToken && secrets.googleTokenExpiry > Date.now() + 60000) {
      return secrets.googleAccessToken;
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: buildGoogleRefreshTokenBody(refreshToken, clientId, clientSecret)
      });

      const tokenData = await response.json();
      if (!response.ok) {
        console.error('Google access-token refresh failed. Reason: token_refresh_rejected.');
        return null;
      }

      secrets.googleAccessToken = tokenData.access_token;
      secrets.googleTokenExpiry = Date.now() + (tokenData.expires_in * 1000);
      cachedSecrets = { ...secrets };
      return tokenData.access_token;
    } catch (e: any) {
      console.error('Network error refreshing Google access token:', redactSecrets(e.message || String(e)));
      return null;
    }
  }

  // -------------------------------------------------------------
  // Weather Service
  // -------------------------------------------------------------

  async function fetchCurrentWeather(location: string, units: 'C' | 'F'): Promise<WeatherSnapshot> {
    try {
      // 1. Geocode location name using free Open-Meteo Geocoding API
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
      );
      const geoData = await geoRes.json();
      
      let lat = 48.1351; // default Munich lat
      let lon = 11.5820; // default Munich lon
      let resolvedName = location;

      if (geoData && geoData.results && geoData.results.length > 0) {
        const result = geoData.results[0];
        lat = result.latitude;
        lon = result.longitude;
        resolvedName = `${result.name}, ${result.country_code ? result.country_code.toUpperCase() : ''}`;
      }

      // 2. Fetch forecast/current weather from Open-Meteo
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=${units === 'F' ? 'fahrenheit' : 'celsius'}`;
      const weatherRes = await fetch(weatherUrl);
      const weatherData = await weatherRes.json();

      if (!weatherRes.ok || !weatherData.current_weather) {
        throw new Error('Weather forecast not available');
      }

      const cw = weatherData.current_weather;
      
      // Map WMO Weather Codes to descriptive conditions
      const weatherCode = cw.weathercode;
      let condition = 'Sunny';
      let icon = 'sunny';

      if ([1, 2, 3].includes(weatherCode)) {
        condition = 'Partly Cloudy';
        icon = 'cloud';
      } else if ([45, 48].includes(weatherCode)) {
        condition = 'Foggy';
        icon = 'foggy';
      } else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weatherCode)) {
        condition = 'Rainy';
        icon = 'rainy';
      } else if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
        condition = 'Snowy';
        icon = 'ac_unit';
      } else if ([95, 96, 99].includes(weatherCode)) {
        condition = 'Thunderstorm';
        icon = 'thunderstorm';
      }

      const snapshot: WeatherSnapshot = {
        location: resolvedName,
        temperature: Math.round(cw.temperature),
        units,
        condition,
        icon,
        fetchedAt: new Date().toISOString()
      };

      cachedWeather = snapshot;
      return snapshot;
    } catch (e) {
      console.error('Weather fetching error:', e);
      if (cachedWeather) {
        return cachedWeather;
      }
      return {
        location: location,
        temperature: 0,
        units: units,
        condition: 'Unknown',
        icon: 'cloud_off',
        fetchedAt: new Date().toISOString()
      };
    }
  }

  app.get('/api/weather/current', authMiddleware, async (req, res) => {
    const settings = await loadSettings();
    const weather = await fetchCurrentWeather(settings.weather.location, settings.weather.units);
    res.json({ success: true, data: weather });
  });

  app.get('/api/weather/status', authMiddleware, async (req, res) => {
    res.json({
      success: true,
      data: {
        provider: 'weather',
        status: 'connected',
        lastSuccessfulSync: cachedWeather ? cachedWeather.fetchedAt : undefined
      }
    });
  });

  // -------------------------------------------------------------
  // Todoist Service
  // -------------------------------------------------------------

  class TodoistApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
      this.name = 'TodoistApiError';
    }
  }

  function getTodoistToken(): string {
    const secrets = loadSecrets();
    const rawToken = secrets.todoistToken || '';
    
    const cleaned = rawToken.trim().replace(/\r?\n|\r/g, '');
    
    if (!cleaned) {
      return '';
    }
    
    const token = cleaned.replace(/^Bearer\s+/i, '');
    
    const lower = token.toLowerCase();
    if (lower === 'configured' || lower === 'not_configured' || lower === 'undefined' || lower === 'null') {
      return '';
    }
    
    return token;
  }

  async function fetchTodoistSections(): Promise<TodoistSection[]> {
    const token = getTodoistToken();

    if (!token) {
      return [];
    }

    try {
      const rawSections = await fetchTodoistWithPagination(
        'https://api.todoist.com/api/v1/sections',
        token,
        'results'
      );

      return rawSections.map((section: any) => ({
        id: section.id,
        name: section.name,
        projectId: section.project_id,
        sectionOrder: section.section_order ?? 0,
        isCollapsed: section.is_collapsed ?? false
      }));
    } catch (e: any) {
      let msg = e.message || 'Unknown error';
      if (token && msg.includes(token)) {
        msg = msg.replaceAll(token, '[REDACTED]');
      }
      console.error('Todoist sections fetch error:', msg);
      throw e;
    }
  }

  async function fetchTodoistTasks(): Promise<TodoistTask[]> {
    const token = getTodoistToken();

    if (!token) {
      return [];
    }

    try {
      const settings = await loadSettings();
      const rawTasks = await fetchTodoistWithPagination(
        'https://api.todoist.com/api/v1/tasks',
        token,
        'results'
      );

      return rawTasks.map((t: any) => {
        const labels = t.labels || [];
        const isOverdue = t.due ? new Date(t.due.date).getTime() < Date.now() && !t.completed : false;
        
        // Context filtering helper
        let context: 'personal' | 'professional' | 'unknown' = 'unknown';
        if (labels.includes(settings.todoist.personalLabel)) context = 'personal';
        else if (labels.includes(settings.todoist.professionalLabel)) context = 'professional';

        return {
          id: t.id,
          provider: 'todoist',
          title: t.content,
          description: t.description,
          dueDate: t.due ? t.due.date : undefined,
          dueDatetime: t.due ? t.due.datetime : undefined,
          isOverdue,
          labels,
          priority: t.priority,
          recurring: t.due ? t.due.is_recurring : false,
          completed: false,
          context,
          parentId: t.parent_id || null,
          childOrder: t.child_order ?? 0,
          projectId: t.project_id,
          sectionId: t.section_id || null
        } as TodoistTask;
      });
    } catch (e: any) {
      let msg = e.message || 'Unknown error';
      if (token && msg.includes(token)) {
        msg = msg.replaceAll(token, '[REDACTED]');
      }
      console.error('Todoist fetch error:', msg);
      throw e;
    }
  }

  app.get('/api/tasks', authMiddleware, async (req, res) => {
    try {
      const tasks = await fetchTodoistTasks();
      res.json({ success: true, data: tasks });
    } catch (e: any) {
      const status = e.status || 500;
      const is401 = status === 401 || (e.message && e.message.includes('status: 401'));
      res.status(is401 ? 401 : status).json({
        success: false,
        error: is401
          ? 'Todoist rejected the saved connection. Open Settings → Connections and enter a current Todoist API token.'
          : (e.message || 'Unknown error'),
        todoistError: is401
      });
    }
  });

  function isValidYYYYMMDD(dateStr: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (month < 1 || month > 12) return false;
    const daysInMonth = new Date(year, month, 0).getDate();
    return day >= 1 && day <= daysInMonth;
  }

  app.post('/api/tasks', authMiddleware, async (req, res) => {
    const { content, context, description, projectId, sectionId, dueDate, priority } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Content cannot be empty and must be a string' });
    }

    if (projectId !== undefined && projectId !== null) {
      if (typeof projectId !== 'string' && typeof projectId !== 'number') {
        return res.status(400).json({ success: false, error: 'Project ID must be a string or number' });
      }
      if (typeof projectId === 'string' && !projectId.trim()) {
        return res.status(400).json({ success: false, error: 'Project ID cannot be empty' });
      }
    }

    if (sectionId !== undefined && sectionId !== null) {
      if (typeof sectionId !== 'string' && typeof sectionId !== 'number') {
        return res.status(400).json({ success: false, error: 'Section ID must be a string or number' });
      }
      if (typeof sectionId === 'string' && !sectionId.trim()) {
        return res.status(400).json({ success: false, error: 'Section ID cannot be empty' });
      }
    }

    if (dueDate !== undefined && dueDate !== null && dueDate !== '') {
      if (typeof dueDate !== 'string' || !isValidYYYYMMDD(dueDate)) {
        return res.status(400).json({ success: false, error: 'Invalid date format or value. Must be YYYY-MM-DD.' });
      }
    }

    if (priority !== undefined && priority !== null) {
      const pNum = Number(priority);
      if (!Number.isInteger(pNum) || pNum < 1 || pNum > 4) {
        return res.status(400).json({ success: false, error: 'Priority must be an integer from 1 to 4' });
      }
    }

    if (description !== undefined && description !== null) {
      if (typeof description !== 'string') {
        return res.status(400).json({ success: false, error: 'Description must be a string' });
      }
    }

    const token = getTodoistToken();

    if (!token) {
      return res.status(400).json({ success: false, error: 'Todoist API token is not configured' });
    }

    try {
      const payload: any = {
        content: content.trim()
      };

      if (description !== undefined && description !== null) {
        payload.description = description;
      }

      const settings = await loadSettings();
      const labels = [];
      if (context === 'personal') {
        labels.push(settings.todoist.personalLabel);
      } else if (context === 'professional') {
        labels.push(settings.todoist.professionalLabel);
      }
      if (labels.length > 0) {
        payload.labels = labels;
      }

      if (priority !== undefined && priority !== null) {
        payload.priority = Number(priority);
      }

      if (dueDate) {
        payload.due_date = dueDate;
      }

      let finalProjectId = projectId;
      let finalSectionId = sectionId;

      if (sectionId) {
        const sections = await fetchTodoistSections();
        const matchingSection = sections.find(s => String(s.id) === String(sectionId));
        if (!matchingSection) {
          return res.status(400).json({ success: false, error: `Section with ID ${sectionId} does not exist.` });
        }
        if (projectId) {
          if (String(matchingSection.projectId) !== String(projectId)) {
            return res.status(400).json({ success: false, error: `Section ${sectionId} does not belong to project ${projectId}.` });
          }
        } else {
          finalProjectId = matchingSection.projectId;
        }
      }

      if (finalProjectId) {
        payload.project_id = finalProjectId;
      }
      if (finalSectionId) {
        payload.section_id = finalSectionId;
      }

      const response = await fetch('https://api.todoist.com/api/v1/tasks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (_) {}
        if (token && errorBody.includes(token)) {
          errorBody = errorBody.replaceAll(token, '[REDACTED]');
        }
        throw new TodoistApiError(`Todoist returned status: ${response.status}. Response: ${errorBody}`, response.status);
      }

      const createdTask = await response.json();
      
      const createdLabels = createdTask.labels || [];
      const isOverdue = createdTask.due ? new Date(createdTask.due.date).getTime() < Date.now() && !createdTask.completed : false;
      
      let contextVal: 'personal' | 'professional' | 'unknown' = 'unknown';
      if (createdLabels.includes(settings.todoist.personalLabel)) contextVal = 'personal';
      else if (createdLabels.includes(settings.todoist.professionalLabel)) contextVal = 'professional';

      const normalizedTask: TodoistTask = {
        id: createdTask.id,
        provider: 'todoist',
        title: createdTask.content,
        description: createdTask.description || '',
        dueDate: createdTask.due ? createdTask.due.date : undefined,
        dueDatetime: createdTask.due ? createdTask.due.datetime : undefined,
        isOverdue,
        labels: createdLabels,
        priority: createdTask.priority,
        recurring: createdTask.due ? createdTask.due.is_recurring : false,
        completed: false,
        context: contextVal,
        parentId: createdTask.parent_id || null,
        childOrder: createdTask.child_order ?? 0,
        projectId: createdTask.project_id,
        sectionId: createdTask.section_id || null
      };

      res.json({ success: true, data: normalizedTask });
    } catch (e: any) {
      const status = e.status || 500;
      const is401 = status === 401 || (e.message && e.message.includes('status: 401'));
      let msg = is401
        ? 'Todoist rejected the saved connection. Open Settings → Connections and enter a current Todoist API token.'
        : (e.message || 'Unknown error');
      if (token && msg.includes(token)) {
        msg = msg.replaceAll(token, '[REDACTED]');
      }
      res.status(is401 ? 401 : status).json({ success: false, error: msg, todoistError: is401 });
    }
  });

  app.patch('/api/tasks/:taskId', authMiddleware, async (req, res) => {
    const { taskId } = req.params;
    if (!taskId || !taskId.trim()) {
      return res.status(400).json({ success: false, error: 'Task ID is required' });
    }

    const bodyKeys = Object.keys(req.body);
    const allowedFields = ['content', 'description', 'dueDate', 'priority'];
    const disallowedKeys = bodyKeys.filter(k => !allowedFields.includes(k));
    if (disallowedKeys.length > 0) {
      return res.status(400).json({ success: false, error: `Invalid field(s) update: ${disallowedKeys.join(', ')}. Only content, description, dueDate, and priority can be updated via this endpoint.` });
    }

    const { content, description, dueDate, priority } = req.body;
    if (content === undefined && description === undefined && dueDate === undefined && priority === undefined) {
      return res.status(400).json({ success: false, error: 'Update payload cannot be empty or contain only undefined fields' });
    }

    if (content !== undefined) {
      if (typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ success: false, error: 'Content must be a non-empty string' });
      }
    }

    if (description !== undefined) {
      if (typeof description !== 'string') {
        return res.status(400).json({ success: false, error: 'Description must be a string' });
      }
    }

    if (dueDate !== undefined && dueDate !== null) {
      if (typeof dueDate !== 'string' || !isValidYYYYMMDD(dueDate)) {
        return res.status(400).json({ success: false, error: 'dueDate must be a string in YYYY-MM-DD format or null to clear' });
      }
    }

    if (priority !== undefined) {
      const pNum = Number(priority);
      if (!Number.isInteger(pNum) || pNum < 1 || pNum > 4) {
        return res.status(400).json({ success: false, error: 'Priority must be an integer from 1 to 4' });
      }
    }

    const token = getTodoistToken();
    if (!token) {
      return res.status(400).json({ success: false, error: 'Todoist API token is not configured' });
    }

    try {
      const payload: any = {};
      if (content !== undefined) {
        payload.content = content.trim();
      }
      if (description !== undefined) {
        payload.description = description;
      }
      if (priority !== undefined) {
        payload.priority = Number(priority);
      }
      if (dueDate !== undefined) {
        if (dueDate === null) {
          payload.due_string = '';
        } else {
          payload.due_date = dueDate;
        }
      }

      const response = await fetch(`https://api.todoist.com/api/v1/tasks/${taskId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (_) {}
        if (token && errorBody.includes(token)) {
          errorBody = errorBody.replaceAll(token, '[REDACTED]');
        }
        throw new TodoistApiError(`Todoist returned status: ${response.status}. Response: ${errorBody}`, response.status);
      }

      const updatedTask = await response.json();
      const settings = await loadSettings();
      const createdLabels = updatedTask.labels || [];
      const isOverdue = updatedTask.due ? new Date(updatedTask.due.date).getTime() < Date.now() && !updatedTask.completed : false;
      
      let contextVal: 'personal' | 'professional' | 'unknown' = 'unknown';
      if (createdLabels.includes(settings.todoist.personalLabel)) contextVal = 'personal';
      else if (createdLabels.includes(settings.todoist.professionalLabel)) contextVal = 'professional';

      const normalizedTask: TodoistTask = {
        id: updatedTask.id,
        provider: 'todoist',
        title: updatedTask.content,
        description: updatedTask.description || '',
        dueDate: updatedTask.due ? updatedTask.due.date : undefined,
        dueDatetime: updatedTask.due ? updatedTask.due.datetime : undefined,
        isOverdue,
        labels: createdLabels,
        priority: updatedTask.priority,
        recurring: updatedTask.due ? updatedTask.due.is_recurring : false,
        completed: updatedTask.completed || false,
        context: contextVal,
        parentId: updatedTask.parent_id || null,
        childOrder: updatedTask.child_order ?? 0,
        projectId: updatedTask.project_id,
        sectionId: updatedTask.section_id || null
      };

      res.json({ success: true, data: normalizedTask });
    } catch (e: any) {
      const status = e.status || 500;
      const is401 = status === 401 || (e.message && e.message.includes('status: 401'));
      const is404 = status === 404 || (e.message && e.message.includes('status: 404'));
      let msg = is401
        ? 'Todoist rejected the saved connection. Open Settings → Connections and enter a current Todoist API token.'
        : (is404 ? 'Task not found' : (e.message || 'Unknown error'));
      if (token && msg.includes(token)) {
        msg = msg.replaceAll(token, '[REDACTED]');
      }
      res.status(is401 ? 401 : (is404 ? 404 : status)).json({ success: false, error: msg, todoistError: is401 });
    }
  });

  app.post('/api/tasks/:taskId/move', authMiddleware, async (req, res) => {
    const { taskId } = req.params;
    if (!taskId || !taskId.trim()) {
      return res.status(400).json({ success: false, error: 'Task ID is required' });
    }

    const moveKeys = Object.keys(req.body);
    const allowedMoveKeys = ['projectId', 'sectionId', 'parentId'];
    const disallowedMoveKeys = moveKeys.filter(k => !allowedMoveKeys.includes(k));
    if (disallowedMoveKeys.length > 0) {
      return res.status(400).json({ success: false, error: `Invalid field(s) for move operation: ${disallowedMoveKeys.join(', ')}.` });
    }

    const schedulingKeys = ['dueDate', 'due', 'due_string', 'deadline', 'date'];
    for (const sk of schedulingKeys) {
      if (req.body[sk] !== undefined) {
        return res.status(400).json({ success: false, error: `Move request cannot contain scheduling field '${sk}'.` });
      }
    }

    let { projectId, sectionId, parentId } = req.body;
    if (!projectId && !sectionId && !parentId) {
      return res.status(400).json({ success: false, error: 'At least one of projectId, sectionId, or parentId must be supplied.' });
    }

    let finalProjectId = projectId;
    let finalSectionId = sectionId;

    if (sectionId) {
      const sections = await fetchTodoistSections();
      const matchingSection = sections.find(s => String(s.id) === String(sectionId));
      if (!matchingSection) {
        return res.status(400).json({ success: false, error: `Section with ID ${sectionId} does not exist.` });
      }
      if (projectId) {
        if (String(matchingSection.projectId) !== String(projectId)) {
          return res.status(400).json({ success: false, error: `Section ${sectionId} does not belong to project ${projectId}.` });
        }
      } else {
        finalProjectId = matchingSection.projectId;
      }
    }

    const token = getTodoistToken();
    if (!token) {
      return res.status(400).json({ success: false, error: 'Todoist API token is not configured' });
    }

    try {
      const movePayload: any = {};
      if (finalProjectId) {
        movePayload.project_id = finalProjectId;
      }
      if (finalSectionId) {
        movePayload.section_id = finalSectionId;
      }
      if (parentId) {
        movePayload.parent_id = parentId;
      }

      const response = await fetch(`https://api.todoist.com/api/v1/tasks/${taskId}/move`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(movePayload)
      });

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (_) {}
        if (token && errorBody.includes(token)) {
          errorBody = errorBody.replaceAll(token, '[REDACTED]');
        }
        throw new TodoistApiError(`Todoist returned status: ${response.status}. Response: ${errorBody}`, response.status);
      }

      // Fetch the updated task to return it normalized
      try {
        const getResponse = await fetch(`https://api.todoist.com/api/v1/tasks/${taskId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (getResponse.ok) {
          const updatedTask = await getResponse.json();
          const settings = await loadSettings();
          const createdLabels = updatedTask.labels || [];
          const isOverdue = updatedTask.due ? new Date(updatedTask.due.date).getTime() < Date.now() && !updatedTask.completed : false;
          
          let contextVal: 'personal' | 'professional' | 'unknown' = 'unknown';
          if (createdLabels.includes(settings.todoist.personalLabel)) contextVal = 'personal';
          else if (createdLabels.includes(settings.todoist.professionalLabel)) contextVal = 'professional';

          const normalizedTask: TodoistTask = {
            id: updatedTask.id,
            provider: 'todoist',
            title: updatedTask.content,
            description: updatedTask.description || '',
            dueDate: updatedTask.due ? updatedTask.due.date : undefined,
            dueDatetime: updatedTask.due ? updatedTask.due.datetime : undefined,
            isOverdue,
            labels: createdLabels,
            priority: updatedTask.priority,
            recurring: updatedTask.due ? updatedTask.due.is_recurring : false,
            completed: updatedTask.completed || false,
            context: contextVal,
            parentId: updatedTask.parent_id || null,
            childOrder: updatedTask.child_order ?? 0,
            projectId: updatedTask.project_id,
            sectionId: updatedTask.section_id || null
          };
          return res.json({ success: true, data: normalizedTask });
        }
      } catch (fetchErr) {
        console.error('Failed to fetch updated task after move, returning general success:', fetchErr);
      }

      res.json({ success: true, moved: true });
    } catch (e: any) {
      const status = e.status || 500;
      const is401 = status === 401 || (e.message && e.message.includes('status: 401'));
      const is404 = status === 404 || (e.message && e.message.includes('status: 404'));
      let msg = is401
        ? 'Todoist rejected the saved connection. Open Settings → Connections and enter a current Todoist API token.'
        : (is404 ? 'Task not found' : (e.message || 'Unknown error'));
      if (token && msg.includes(token)) {
        msg = msg.replaceAll(token, '[REDACTED]');
      }
      res.status(is401 ? 401 : (is404 ? 404 : status)).json({ success: false, error: msg, todoistError: is401 });
    }
  });

  app.post('/api/tasks/:taskId/complete', authMiddleware, async (req: any, res) => {
    const { taskId } = req.params;
    if (!taskId || !taskId.trim()) {
      return res.status(400).json({ success: false, error: 'Task ID is required' });
    }

    const token = getTodoistToken();

    if (!token) {
      return res.status(400).json({ success: false, error: 'Todoist API token is not configured' });
    }

    try {
      const response = await fetch(`https://api.todoist.com/api/v1/tasks/${taskId}/close`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (_) {}
        if (token && errorBody.includes(token)) {
          errorBody = errorBody.replaceAll(token, '[REDACTED]');
        }
        throw new TodoistApiError(`Todoist returned status: ${response.status}. Response: ${errorBody}`, response.status);
      }

      invalidateCompletedTasksCache();
      res.json({ success: true });
    } catch (e: any) {
      const status = e.status || 500;
      const is401 = status === 401 || (e.message && e.message.includes('status: 401'));
      let msg = is401
        ? 'Todoist rejected the saved connection. Open Settings → Connections and enter a current Todoist API token.'
        : (e.message || 'Unknown error');
      if (token && msg.includes(token)) {
        msg = msg.replaceAll(token, '[REDACTED]');
      }
      res.status(is401 ? 401 : status).json({ success: false, error: msg, todoistError: is401 });
    }
  });

  app.post('/api/tasks/:taskId/comments', authMiddleware, async (req: any, res) => {
    const { taskId } = req.params;
    const { content } = req.body;

    if (!taskId || !taskId.trim()) {
      return res.status(400).json({ success: false, error: 'Task ID is required' });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Comment content cannot be empty' });
    }

    const token = getTodoistToken();

    if (!token) {
      return res.status(400).json({ success: false, error: 'Todoist API token is not configured' });
    }

    try {
      const response = await fetch('https://api.todoist.com/api/v1/comments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          task_id: taskId,
          content: content
        })
      });

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (_) {}
        if (token && errorBody.includes(token)) {
          errorBody = errorBody.replaceAll(token, '[REDACTED]');
        }

        // Handle premium/subscription plan limitation for comments
        const errorLower = errorBody.toLowerCase();
        if (
          response.status === 403 || 
          response.status === 402 || 
          errorLower.includes('premium') || 
          errorLower.includes('pro') || 
          errorLower.includes('subscription') || 
          errorLower.includes('plan') || 
          errorLower.includes('upgrade') || 
          errorLower.includes('restricted')
        ) {
          return res.status(403).json({
            success: false,
            error: 'Adding comments is not supported by your Todoist plan. This feature requires a Todoist Pro/Business subscription.'
          });
        }

        throw new TodoistApiError(`Todoist returned status: ${response.status}. Response: ${errorBody}`, response.status);
      }

      const createdComment = await response.json();
      res.json({ success: true, data: createdComment });
    } catch (e: any) {
      const status = e.status || 500;
      const is401 = status === 401 || (e.message && e.message.includes('status: 401'));
      let msg = is401
        ? 'Todoist rejected the saved connection. Open Settings → Connections and enter a current Todoist API token.'
        : (e.message || 'Unknown error');
      if (token && msg.includes(token)) {
        msg = msg.replaceAll(token, '[REDACTED]');
      }
      res.status(is401 ? 401 : status).json({ success: false, error: msg, todoistError: is401 });
    }
  });

  app.get('/api/tasks/status', authMiddleware, (req, res) => {
    const configured = !!getTodoistToken();
    const syncTracking = loadSyncTracking();
    res.json({
      success: true,
      data: {
        provider: 'todoist',
        status: configured ? 'connected' : 'disconnected',
        lastSuccessfulSync: syncTracking.todoist || null
      }
    });
  });

  // -------------------------------------------------------------
  // Habit Tracker Routes
  // -------------------------------------------------------------

  function validateSchedule(schedule: any): string | null {
    if (!schedule || typeof schedule !== 'object') {
      return 'Schedule must be an object';
    }
    const { type } = schedule;
    if (!['daily', 'weekdays', 'selected_days', 'weekly_target'].includes(type)) {
      return 'Invalid schedule type';
    }
    if (type === 'daily' || type === 'weekdays') {
      if (schedule.selectedDays !== undefined || schedule.weeklyTarget !== undefined) {
        return `${type} schedule must not contain contradictory fields (selectedDays or weeklyTarget)`;
      }
    }
    if (type === 'selected_days') {
      if (schedule.weeklyTarget !== undefined) {
        return 'selected_days schedule must not contain weeklyTarget';
      }
      if (!Array.isArray(schedule.selectedDays) || schedule.selectedDays.length === 0) {
        return 'selected_days schedule must have a non-empty selectedDays array';
      }
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      for (const day of schedule.selectedDays) {
        if (!validDays.includes(day)) {
          return `Invalid weekday: ${day}`;
        }
      }
    }
    if (type === 'weekly_target') {
      if (schedule.selectedDays !== undefined) {
        return 'weekly_target schedule must not contain selectedDays';
      }
      if (typeof schedule.weeklyTarget !== 'number' || schedule.weeklyTarget < 1) {
        return 'weekly_target schedule must have a weeklyTarget number greater than or equal to 1';
      }
    }
    return null;
  }

  app.get('/api/habits', authMiddleware, async (req: any, res) => {
    try {
      const context = req.query.context as 'combined' | 'personal' | 'professional' | undefined;
      const includeArchived = req.query.includeArchived === 'true';
      const fromDate = (req.query.from as string) || '1970-01-01';
      const toDate = (req.query.to as string) || getLocalYYYYMMDD();

      const storeContext = context === 'combined' ? undefined : (context === 'personal' || context === 'professional' ? context : undefined);
      let habits = await STORES.habits.listHabits(storeContext);
      
      if (!includeArchived) {
        habits = habits.filter(h => !h.archived);
      }

      const habitsWithEntries = await Promise.all(
        habits.map(async (habit) => {
          const entries = await STORES.habits.getEntries(habit.id, fromDate, toDate);
          return {
            ...habit,
            entries
          };
        })
      );

      res.json({ success: true, data: habitsWithEntries });
    } catch (err: any) {
      console.error('Failed to get habits:', err.message || err);
      res.status(500).json({ success: false, error: 'Failed to retrieve habits.' });
    }
  });

  app.post('/api/habits', authMiddleware, async (req: any, res) => {
    try {
      const { name, context, schedule, startDate } = req.body;
      
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) {
        return res.status(400).json({ success: false, error: 'Name is required' });
      }
      if (trimmedName.length > 100) {
        return res.status(400).json({ success: false, error: 'Name cannot exceed 100 characters' });
      }

      if (!['personal', 'professional'].includes(context)) {
        return res.status(400).json({ success: false, error: 'Invalid context' });
      }

      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ success: false, error: 'Invalid startDate format' });
      }

      const scheduleError = validateSchedule(schedule);
      if (scheduleError) {
        return res.status(400).json({ success: false, error: scheduleError });
      }

      const createdHabit = await STORES.habits.createHabit({
        name: trimmedName,
        context,
        schedule,
        startDate
      });

      res.json({ success: true, data: createdHabit });
    } catch (err: any) {
      console.error('Failed to create habit:', err.message || err);
      res.status(500).json({ success: false, error: 'Failed to create habit.' });
    }
  });

  app.patch('/api/habits/:habitId', authMiddleware, async (req: any, res) => {
    try {
      const { habitId } = req.params;
      
      let habit = await STORES.habits.getHabit(habitId);
      if (!habit) {
        return res.status(404).json({ success: false, error: 'Habit not found' });
      }

      const updates: any = {};
      
      if (req.body.name !== undefined) {
        const trimmedName = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        if (!trimmedName) {
          return res.status(400).json({ success: false, error: 'Name cannot be empty' });
        }
        if (trimmedName.length > 100) {
          return res.status(400).json({ success: false, error: 'Name cannot exceed 100 characters' });
        }
        updates.name = trimmedName;
      }

      if (req.body.context !== undefined) {
        if (!['personal', 'professional'].includes(req.body.context)) {
          return res.status(400).json({ success: false, error: 'Invalid context' });
        }
        updates.context = req.body.context;
      }

      if (req.body.startDate !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.startDate)) {
          return res.status(400).json({ success: false, error: 'Invalid startDate format' });
        }
        const proposedStartDate = req.body.startDate;
        const allEntries = await STORES.habits.getEntries(habitId, '1970-01-01', '2099-12-31');
        const completedBeforeProposed = allEntries.filter(e => e.completed && e.date < proposedStartDate);
        if (completedBeforeProposed.length > 0) {
          return res.status(400).json({
            success: false,
            error: `Cannot set start date to ${proposedStartDate} because there are completed check-ins on earlier dates.`
          });
        }
        updates.startDate = proposedStartDate;
      }

      if (req.body.schedule !== undefined) {
        const scheduleError = validateSchedule(req.body.schedule);
        if (scheduleError) {
          return res.status(400).json({ success: false, error: scheduleError });
        }
        updates.schedule = req.body.schedule;
      }

      if (req.body.archived === true) {
        habit = await STORES.habits.archiveHabit(habitId);
      } else if (req.body.archived === false) {
        habit = await STORES.habits.unarchiveHabit(habitId);
      }

      if (Object.keys(updates).length > 0) {
        habit = await STORES.habits.updateHabit(habitId, updates);
      }

      res.json({ success: true, data: habit });
    } catch (err: any) {
      console.error('Failed to update habit:', err.message || err);
      res.status(500).json({ success: false, error: 'Failed to update habit.' });
    }
  });

  app.get('/api/habits/:habitId/history', authMiddleware, async (req: any, res) => {
    try {
      const { habitId } = req.params;
      const fromDate = (req.query.from as string) || '1970-01-01';
      const toDate = (req.query.to as string) || getLocalYYYYMMDD();

      const habit = await STORES.habits.getHabit(habitId);
      if (!habit) {
        return res.status(404).json({ success: false, error: 'Habit not found' });
      }

      const entries = await STORES.habits.getEntries(habitId, fromDate, toDate);
      res.json({ success: true, data: { habit, entries } });
    } catch (err: any) {
      console.error('Failed to get habit history:', err.message || err);
      res.status(500).json({ success: false, error: 'Failed to retrieve habit history.' });
    }
  });

  app.put('/api/habits/:habitId/entries/:date', authMiddleware, async (req: any, res) => {
    try {
      const { habitId, date } = req.params;
      const { completed } = req.body;

      const habit = await STORES.habits.getHabit(habitId);
      if (!habit) {
        return res.status(404).json({ success: false, error: 'Habit not found' });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, error: 'Invalid date format' });
      }

      if (date < habit.startDate) {
        return res.status(400).json({ success: false, error: 'Cannot check-in to a date before habit startDate' });
      }

      if (typeof completed !== 'boolean') {
        return res.status(400).json({ success: false, error: 'Completed must be a boolean' });
      }

      let updatedEntry = null;
      if (completed) {
        updatedEntry = await STORES.habits.upsertEntry(habitId, date, true);
      } else {
        await STORES.habits.deleteEntry(habitId, date);
      }

      // Freshly calculated habit summary
      const allEntries = await STORES.habits.getEntries(habitId, '1970-01-01', '2099-12-31');
      const today = getLocalYYYYMMDD();
      
      const streak = calculateScheduledHabitStreak(habit, allEntries, today);
      const weekly = calculateWeeklyTargetProgress(habit, allEntries, today);
      const completionRate = calculateCompletionRate(habit, allEntries, habit.startDate, today);

      const summary = {
        ...streak,
        ...weekly,
        completionRate
      };

      res.json({
        success: true,
        data: {
          entry: updatedEntry,
          summary
        }
      });
    } catch (err: any) {
      console.error('Failed to upsert entry:', err.message || err);
      res.status(500).json({ success: false, error: 'Failed to update habit entry.' });
    }
  });

  // -------------------------------------------------------------
  // Todoist Projects Progress Service & Routes
  // -------------------------------------------------------------

  interface CompletedTasksCache {
    items: any[];
    fetchedAt: number;
    progressScope: "lifetime" | "recent";
  }

  let completedTasksCache: CompletedTasksCache | null = null;
  const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

  function invalidateCompletedTasksCache() {
    completedTasksCache = null;
  }

  async function fetchTodoistWithPagination(
    url: string,
    token: string,
    resultsField: 'results' | 'items' = 'results',
    params: Record<string, string> = {}
  ): Promise<any[]> {
    let allItems: any[] = [];
    let nextCursor: string | null = null;
    
    do {
      const queryParams = new URLSearchParams({ ...params, limit: '200' });
      if (nextCursor) {
        queryParams.set('cursor', nextCursor);
      }
      const targetUrl = `${url}?${queryParams.toString()}`;
      
      const response = await fetch(targetUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (_) {}
        if (token && errorBody.includes(token)) {
          errorBody = errorBody.replaceAll(token, '[REDACTED]');
        }
        throw new TodoistApiError(`Todoist returned status: ${response.status}. Response: ${errorBody}`, response.status);
      }
      
      const body = await response.json();
      const items = body[resultsField] || [];
      allItems = allItems.concat(items);
      nextCursor = body.next_cursor || null;
    } while (nextCursor);
    
    return allItems;
  }

  async function getCompletedTasksHistory(token: string, activeProjects: any[]): Promise<{ items: any[]; progressScope: "lifetime" | "recent" }> {
    const now = Date.now();
    if (completedTasksCache && (now - completedTasksCache.fetchedAt < CACHE_DURATION)) {
      return {
        items: completedTasksCache.items,
        progressScope: completedTasksCache.progressScope
      };
    }

    let earliestDate = new Date();
    let hasValidProjectDate = false;
    
    for (const proj of activeProjects) {
      if (proj.created_at) {
        const d = new Date(proj.created_at);
        if (!isNaN(d.getTime())) {
          if (d < earliestDate) {
            earliestDate = d;
            hasValidProjectDate = true;
          }
        }
      }
    }

    if (!hasValidProjectDate) {
      earliestDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
    }

    const today = new Date();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    
    const ranges: { since: string; until: string }[] = [];
    let currentStart = new Date(earliestDate.getTime());
    currentStart.setHours(0, 0, 0, 0);

    while (currentStart < today) {
      let currentEnd = new Date(currentStart.getTime() + ninetyDaysMs);
      if (currentEnd > today) {
        currentEnd = new Date(today.getTime());
      }
      ranges.push({
        since: currentStart.toISOString().replace(/\.\d+Z$/, 'Z'),
        until: currentEnd.toISOString().replace(/\.\d+Z$/, 'Z')
      });
      currentStart = new Date(currentEnd.getTime() + 1000);
    }

    let finalRanges = ranges;
    let progressScope: "lifetime" | "recent" = "lifetime";
    
    if (ranges.length > 4) {
      finalRanges = ranges.slice(-4);
      progressScope = "recent";
    }

    let completedTasks: any[] = [];
    let isRecentFallback = false;

    // Sequential requests to avoid bursting / rate-limiting
    for (const range of finalRanges) {
      try {
        const items = await fetchTodoistWithPagination(
          'https://api.todoist.com/api/v1/tasks/completed/by_completion_date',
          token,
          'items',
          { since: range.since, until: range.until }
        );
        completedTasks = completedTasks.concat(items);
      } catch (err: any) {
        console.error(`Error fetching completed tasks for range ${range.since} - ${range.until}:`, err.message);
        isRecentFallback = true;
      }
    }

    if (isRecentFallback) {
      progressScope = "recent";
    }

    completedTasksCache = {
      items: completedTasks,
      fetchedAt: now,
      progressScope: progressScope
    };

    return {
      items: completedTasks,
      progressScope: progressScope
    };
  }

  function getTaskContext(taskLabels: string[], settings: any): 'personal' | 'professional' | 'unknown' {
    const personalLabel = settings.todoist?.personalLabel || 'personal';
    const proLabel = settings.todoist?.professionalLabel || 'professional';
    
    if (taskLabels.includes(personalLabel)) return 'personal';
    if (taskLabels.includes(proLabel)) return 'professional';
    return 'unknown';
  }

  async function getTodoistProjectSummaries(token: string, contextParam: string): Promise<TodoistProjectSummary[]> {
    const settings = await loadSettings();

    // Fetch projects
    const projects = await fetchTodoistWithPagination(
      'https://api.todoist.com/api/v1/projects',
      token,
      'results'
    );

    // Filter projects: exclude archived, deleted, or Inbox
    const activeProjects = projects.filter(p => {
      if (p.is_archived || p.is_deleted) return false;
      if (p.is_inbox_project || p.inbox_project || p.is_inbox) return false;
      if (p.name?.toLowerCase() === 'inbox') return false;
      return true;
    });

    // Fetch active tasks
    const activeTasks = await fetchTodoistWithPagination(
      'https://api.todoist.com/api/v1/tasks',
      token,
      'results'
    );

    // Fetch/retrieve completed tasks
    const { items: completedTasks, progressScope } = await getCompletedTasksHistory(token, activeProjects);

    // De-duplicate completed tasks by ID (if also active, active takes precedence)
    const activeTaskIds = new Set(activeTasks.map(t => t.id));
    const filteredCompletedTasks = completedTasks.filter(ct => !activeTaskIds.has(ct.id) && !activeTaskIds.has(ct.task_id));

    // Build recurring sets/maps to identify recurring completions
    const activeRecurringTaskIds = new Set(
      activeTasks.filter(t => t.due?.is_recurring || t.recurring).map(t => t.id)
    );

    const completedTaskCompletionCounts: Record<string, number> = {};
    for (const ct of filteredCompletedTasks) {
      const tid = ct.task_id || ct.id;
      if (tid) {
        completedTaskCompletionCounts[tid] = (completedTaskCompletionCounts[tid] || 0) + 1;
      }
    }

    // Map tasks to classify context and recurring status
    const mappedActiveTasks = activeTasks.map(t => {
      const labels = t.labels || [];
      const isRecurring = !!(t.due?.is_recurring || t.recurring);
      return {
        id: t.id,
        project_id: t.project_id,
        recurring: isRecurring,
        context: getTaskContext(labels, settings)
      };
    });

    const mappedCompletedTasks = filteredCompletedTasks.map(ct => {
      const labels = ct.labels || [];
      const tid = ct.task_id || ct.id;
      const isRecurring = activeRecurringTaskIds.has(tid) || (completedTaskCompletionCounts[tid] || 0) > 1 || !!ct.recurring;
      return {
        id: tid,
        project_id: ct.project_id,
        recurring: isRecurring,
        context: getTaskContext(labels, settings)
      };
    });

    // Compute project summaries
    const summaries: TodoistProjectSummary[] = [];

    for (const proj of activeProjects) {
      // Filter tasks by project ID
      let projActive = mappedActiveTasks.filter(t => t.project_id === proj.id);
      let projCompleted = mappedCompletedTasks.filter(t => t.project_id === proj.id);

      // Context filtering
      if (contextParam === 'personal') {
        projActive = projActive.filter(t => t.context === 'personal');
        projCompleted = projCompleted.filter(t => t.context === 'personal');
      } else if (contextParam === 'professional') {
        projActive = projActive.filter(t => t.context === 'professional');
        projCompleted = projCompleted.filter(t => t.context === 'professional');
      }

      // Exclude recurring tasks from completion calculations
      const nonRecurringActive = projActive.filter(t => !t.recurring);
      const nonRecurringCompleted = projCompleted.filter(t => !t.recurring);

      const activeTaskCount = nonRecurringActive.length;
      const completedTaskCount = nonRecurringCompleted.length;
      const totalTaskCount = activeTaskCount + completedTaskCount;

      const percentageCompleted = totalTaskCount === 0
        ? 0
        : Math.min(100, Math.max(0, Math.round((completedTaskCount / totalTaskCount) * 100)));

      // Skip if context-filtering is active and project has no tasks
      if ((contextParam === 'personal' || contextParam === 'professional') && totalTaskCount === 0) {
        continue;
      }

      summaries.push({
        id: proj.id,
        name: proj.name,
        color: proj.color || 'grey',
        isFavorite: !!(proj.is_favorite || proj.favorite),
        parentId: proj.parent_id || null,
        activeTaskCount,
        completedTaskCount,
        totalTaskCount,
        percentageCompleted,
        progressScope
      });
    }

    // Sort summaries:
    // 1. Favorite first
    // 2. Original Todoist project order (child_order/order)
    // 3. Project Name fallback
    const projectOrderMap = new Map(projects.map((p, idx) => [p.id, p.child_order ?? p.order ?? idx]));
    summaries.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) {
        return a.isFavorite ? -1 : 1;
      }
      const orderA = projectOrderMap.get(a.id) ?? 0;
      const orderB = projectOrderMap.get(b.id) ?? 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.name || '').localeCompare(b.name || '');
    });

    return summaries;
  }

  app.get('/api/todoist/projects', authMiddleware, async (req, res) => {
    const token = getTodoistToken();
    const contextParam = req.query.context as string || 'combined';

    if (!token) {
      return res.status(400).json({ success: false, error: 'Todoist API token is not configured' });
    }

    try {
      const summaries = await getTodoistProjectSummaries(token, contextParam);
      res.json({ success: true, data: summaries });
    } catch (e: any) {
      const status = e.status || 500;
      const is401 = status === 401 || (e.message && e.message.includes('status: 401'));
      let msg = is401
        ? 'Todoist rejected the saved connection. Open Settings → Connections and enter a current Todoist API token.'
        : (e.message || 'Unknown error');
      if (token && msg.includes(token)) {
        msg = msg.replaceAll(token, '[REDACTED]');
      }
      res.status(is401 ? 401 : status).json({ success: false, error: msg, todoistError: is401 });
    }
  });

  app.get('/api/todoist/projects/:projectId/tasks', authMiddleware, async (req, res) => {
    const { projectId } = req.params;
    if (!projectId || !projectId.trim() || !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
      return res.status(400).json({ success: false, error: 'Invalid project ID format' });
    }

    const token = getTodoistToken();

    if (!token) {
      return res.status(400).json({ success: false, error: 'Todoist API token is not configured' });
    }

    try {
      const settings = await loadSettings();

      // Fetch projects to validate project ID
      const projects = await fetchTodoistWithPagination(
        'https://api.todoist.com/api/v1/projects',
        token,
        'results'
      );
      const exists = projects.some(p => p.id === projectId);
      if (!exists) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }

      // Fetch active tasks
      const activeTasks = await fetchTodoistWithPagination(
        'https://api.todoist.com/api/v1/tasks',
        token,
        'results'
      );

      // Fetch completed tasks
      const { items: completedTasks } = await getCompletedTasksHistory(token, projects);

      // Filter active and completed tasks for this project
      const projActive = activeTasks.filter(t => t.project_id === projectId);
      const activeTaskIds = new Set(projActive.map(t => t.id));

      // De-duplicate completed tasks from active
      const projCompleted = completedTasks.filter(
        ct => ct.project_id === projectId && !activeTaskIds.has(ct.id) && !activeTaskIds.has(ct.task_id)
      );

      // Active recurring set
      const activeRecurringTaskIds = new Set(
        activeTasks.filter(t => t.due?.is_recurring || t.recurring).map(t => t.id)
      );

      const completedTaskCompletionCounts: Record<string, number> = {};
      for (const ct of completedTasks) {
        const tid = ct.task_id || ct.id;
        if (tid) {
          completedTaskCompletionCounts[tid] = (completedTaskCompletionCounts[tid] || 0) + 1;
        }
      }

      const tasksToReturn: TodoistProjectTask[] = [];

      // Map Active Tasks
      projActive.forEach(t => {
        const labels = t.labels || [];
        tasksToReturn.push({
          id: t.id,
          title: t.content,
          description: t.description || '',
          projectId: t.project_id,
          parentId: t.parent_id || null,
          sectionId: t.section_id || null,
          dueDate: t.due ? t.due.date : undefined,
          dueDatetime: t.due ? t.due.datetime : undefined,
          priority: t.priority,
          labels,
          recurring: !!(t.due?.is_recurring || t.recurring),
          completed: false,
          context: getTaskContext(labels, settings)
        });
      });

      // Map Completed Tasks
      // Keep only one occurrence in detailed view (even if repeatedly completed)
      const seenCompletedTaskIds = new Set<string>();
      projCompleted.forEach(ct => {
        const tid = ct.task_id || ct.id;
        if (seenCompletedTaskIds.has(tid)) return;
        seenCompletedTaskIds.add(tid);

        const labels = ct.labels || [];
        const isRecurring = activeRecurringTaskIds.has(tid) || (completedTaskCompletionCounts[tid] || 0) > 1 || !!ct.recurring;

        tasksToReturn.push({
          id: tid,
          title: ct.content || 'Completed Task',
          description: ct.description || '',
          projectId: ct.project_id,
          parentId: ct.parent_id || null,
          sectionId: ct.section_id || null,
          dueDate: ct.due ? ct.due.date : undefined,
          dueDatetime: ct.due ? ct.due.datetime : undefined,
          priority: ct.priority || 1,
          labels,
          recurring: isRecurring,
          completed: true,
          completedAt: ct.completed_at || null,
          context: getTaskContext(labels, settings)
        });
      });

      res.json({ success: true, data: tasksToReturn });
    } catch (e: any) {
      const status = e.status || 500;
      const is401 = status === 401 || (e.message && e.message.includes('status: 401'));
      let msg = is401
        ? 'Todoist rejected the saved connection. Open Settings → Connections and enter a current Todoist API token.'
        : (e.message || 'Unknown error');
      if (token && msg.includes(token)) {
        msg = msg.replaceAll(token, '[REDACTED]');
      }
      res.status(is401 ? 401 : status).json({ success: false, error: msg, todoistError: is401 });
    }
  });

  // -------------------------------------------------------------
  // Google Calendar Service
  // -------------------------------------------------------------

  async function fetchGoogleCalendarEvents(from: string, to: string): Promise<CalendarEvent[]> {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return [];
    }

    try {
      // 1. Retrieve the user's available Google calendars
      const listResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!listResponse.ok) {
        throw new Error(`Failed to retrieve Google Calendar list. Status: ${listResponse.status}`);
      }

      const listData = await listResponse.json();
      const calendarListItems = listData.items || [];

      // 2. Perform settings migration for selectedCalendarIdsByContext if needed
      let settings = await loadSettings();
      let migrated = false;

      if (!settings.calendar) {
        settings.calendar = {
          selectedCalendarIds: ['primary'],
          workingHoursStart: '04:00',
          workingHoursEnd: '00:00'
        };
        migrated = true;
      }

      if (!settings.calendar.selectedCalendarIdsByContext) {
        const primaryCal = calendarListItems.find((c: any) => c.primary === true) || calendarListItems[0];
        const primaryId = primaryCal ? primaryCal.id : 'primary';

        const schoolCal = calendarListItems.find((c: any) => c.summary && c.summary.toLowerCase() === 'school calendar');
        const schoolId = schoolCal ? schoolCal.id : null;

        const legacyIds = settings.calendar.selectedCalendarIds && settings.calendar.selectedCalendarIds.length > 0
          ? settings.calendar.selectedCalendarIds
          : calendarListItems.filter((c: any) => c.selected === true).map((c: any) => c.id);

        settings.calendar.selectedCalendarIdsByContext = {
          combined: legacyIds.length > 0 ? legacyIds : [primaryId],
          personal: [primaryId],
          professional: schoolId ? [schoolId] : []
        };
        migrated = true;
      }

      if (migrated) {
        await saveSettings(settings);
      }

      // 3. Determine the union of all selected calendars across all contexts
      const combinedIds = settings.calendar.selectedCalendarIdsByContext?.combined || [];
      const personalIds = settings.calendar.selectedCalendarIdsByContext?.personal || [];
      const professionalIds = settings.calendar.selectedCalendarIdsByContext?.professional || [];
      const legacyIds = settings.calendar.selectedCalendarIds || ['primary'];

      const unionSet = new Set<string>([
        ...combinedIds,
        ...personalIds,
        ...professionalIds,
        ...legacyIds
      ]);

      if (unionSet.size === 0) {
        unionSet.add('primary');
      }

      let targetCalendars: { id: string; summary: string }[] = calendarListItems
        .filter((c: any) => unionSet.has(c.id))
        .map((c: any) => ({ id: c.id, summary: c.summary || c.id }));

      if (targetCalendars.length === 0) {
        targetCalendars = Array.from(unionSet).map(id => {
          const matched = calendarListItems.find((c: any) => c.id === id);
          return {
            id,
            summary: matched ? matched.summary : (id === 'primary' ? 'Primary Calendar' : id)
          };
        });
      }

      const timeMin = encodeURIComponent(from);
      const timeMax = encodeURIComponent(to);
      const allEvents: CalendarEvent[] = [];
      const seenEventIds = new Set<string>();

      // 4. Request events separately for every selected calendar ID
      for (const cal of targetCalendars) {
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!response.ok) {
          console.error(`Google Calendar returned status: ${response.status} when loading calendar: "${cal.summary}" (${cal.id}). Skipping.`);
          continue;
        }

        const data = await response.json();
        const events = data.items || [];
        
        const matchedCal = calendarListItems.find((c: any) => c.id === cal.id);
        const canEdit = matchedCal ? (matchedCal.accessRole === 'owner' || matchedCal.accessRole === 'writer') : false;

        for (const e of events) {
          if (seenEventIds.has(e.id)) {
            continue;
          }
          seenEventIds.add(e.id);

          const start = e.start?.dateTime || e.start?.date || '';
          const end = e.end?.dateTime || e.end?.date || '';
          const allDay = !e.start?.dateTime;

          allEvents.push({
            id: e.id,
            provider: 'google_calendar',
            title: e.summary || '(No Title)',
            start,
            end,
            allDay,
            calendarId: cal.id,
            calendarName: cal.summary || 'Primary Calendar',
            description: e.description || '',
            location: e.location || '',
            htmlLink: e.htmlLink || '',
            status: e.status || '',
            recurringEventId: e.recurringEventId || null,
            isRecurring: !!e.recurrence,
            organizer: e.organizer ? { email: e.organizer.email, displayName: e.organizer.displayName } : null,
            canEdit
          });
        }
      }

      // Sort the merged events by start time
      allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      return allEvents;
    } catch (e: any) {
      console.error('Google Calendar event fetching error:', redactSecrets(e.message || String(e)));
      throw e;
    }
  }

  async function handleGoogleCalendarWriteError(error: any, res: any) {
    const errorMsg = String(error.message || error || '').toLowerCase();
    const isPermissionError = 
      errorMsg.includes('insufficientpermission') || 
      errorMsg.includes('insufficient scope') || 
      errorMsg.includes('permission denied') ||
      errorMsg.includes('forbidden') ||
      (error.status === 403) ||
      (error.statusCode === 403) ||
      (error.code === 403) ||
      (error.code === 'insufficientPermission') ||
      (error.message && error.message.includes('insufficientPermission'));

    if (isPermissionError) {
      const secrets = loadSecrets();
      secrets.googleWriteAuthorized = false;
      await saveSecrets(secrets);
      return res.status(403).json({ 
        success: false, 
        error: 'CALENDAR_RECONNECT_REQUIRED', 
        code: 'CALENDAR_RECONNECT_REQUIRED' 
      });
    }

    return res.status(500).json({ success: false, error: error.message || 'Google Calendar write failed' });
  }

  // Diagnostic/Testing endpoint to trigger and verify the write permission reverting behavior
  app.post('/api/calendar/events/test-write', authMiddleware, async (req: any, res: any) => {
    try {
      const { simulateError, errorCode } = req.body;
      if (simulateError) {
        if (errorCode === 'insufficientPermission' || errorCode === '403') {
          const err = new Error('insufficientPermission: Insufficient Permission to write to calendar');
          (err as any).status = 403;
          throw err;
        } else {
          throw new Error('Some other error');
        }
      }
      res.json({ success: true, message: 'Simulated write successful' });
    } catch (e: any) {
      await handleGoogleCalendarWriteError(e, res);
    }
  });

  // Protected diagnostic endpoint to inspect calendar names and IDs
  app.get('/api/calendar/list', authMiddleware, async (req, res) => {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'Google Calendar is not connected or unauthorized' });
    }

    try {
      const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!response.ok) {
        const clientStatus = response.status === 401 ? 400 : response.status;
        return res.status(clientStatus).json({
          success: false,
          error: `Google Calendar list API returned status: ${response.status}`
        });
      }

      const data = await response.json();
      const calendars = (data.items || []).map((c: any) => ({
        id: c.id,
        summary: c.summary,
        primary: !!c.primary,
        selected: !!c.selected,
        accessRole: c.accessRole || 'reader',
        writable: c.accessRole === 'owner' || c.accessRole === 'writer',
        description: c.description || '',
        backgroundColor: c.backgroundColor || '',
        foregroundColor: c.foregroundColor || ''
      }));

      res.json({ success: true, data: calendars });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'Unknown error fetching calendar list' });
    }
  });

  app.get('/api/calendar/events', authMiddleware, async (req, res) => {
    const { from, to } = req.query;
    
    // Default range is today
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const rangeFrom = (from as string) || startOfDay;
    const rangeTo = (to as string) || endOfDay;

    try {
      const events = await fetchGoogleCalendarEvents(rangeFrom, rangeTo);
      res.json({ success: true, data: events });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  async function executeGoogleCalendarRequest(url: string, options: any, res: any) {
    try {
      const response = await fetch(url, options);
      const status = response.status;
      const bodyText = await response.text();

      if (!response.ok) {
        let bodyJson: any = {};
        try {
          bodyJson = JSON.parse(bodyText);
        } catch (_) {}

        // Redact any possible secrets in errors
        let errorMsg = bodyJson.error?.message || bodyText || `Google API error with status ${status}`;
        errorMsg = redactSecrets(errorMsg);

        console.error(`Google API error status: ${status}, message: ${errorMsg}`);

        if (status === 401) {
          return res.status(401).json({ success: false, error: 'Google Calendar API unauthorized. Please reconnect.', code: 'UNAUTHORIZED' });
        }
        if (status === 404) {
          return res.status(404).json({ success: false, error: 'Google Calendar resource not found.', code: 'NOT_FOUND' });
        }
        if (status === 403 || errorMsg.toLowerCase().includes('insufficientpermission') || errorMsg.toLowerCase().includes('scope')) {
          const secrets = loadSecrets();
          secrets.googleWriteAuthorized = false;
          await saveSecrets(secrets);
          return res.status(403).json({
            success: false,
            error: 'CALENDAR_RECONNECT_REQUIRED',
            code: 'CALENDAR_RECONNECT_REQUIRED'
          });
        }

        return res.status(status).json({ success: false, error: errorMsg });
      }

      if (status === 204 || bodyText.trim() === '') {
        return res.json({ success: true, message: 'Action completed successfully' });
      }

      const data = JSON.parse(bodyText);
      return res.json({ success: true, data });
    } catch (e: any) {
      console.error('Google Calendar network/request error:', redactSecrets(e.message || String(e)));
      const msg = redactSecrets(e.message || String(e));
      return res.status(500).json({ success: false, error: msg });
    }
  }

  app.post('/api/calendar/events', authMiddleware, async (req: any, res: any) => {
    const secrets = loadSecrets();
    if (!secrets.googleRefreshToken || !secrets.googleWriteAuthorized) {
      return res.status(403).json({ success: false, error: 'CALENDAR_RECONNECT_REQUIRED', code: 'CALENDAR_RECONNECT_REQUIRED' });
    }

    const { title, calendarId, start, end, description, location, allDay } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }
    if (!calendarId || !calendarId.trim()) {
      return res.status(400).json({ success: false, error: 'Calendar ID is required' });
    }
    if (!start) {
      return res.status(400).json({ success: false, error: 'Start time is required' });
    }
    if (!end) {
      return res.status(400).json({ success: false, error: 'End time is required' });
    }

    if (new Date(end) <= new Date(start)) {
      return res.status(400).json({ success: false, error: 'End time must be after start time' });
    }

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'Google Calendar is not connected or unauthorized' });
    }

    // Verify calendar is writable
    try {
      const listResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!listResponse.ok) {
        if (listResponse.status === 401) {
          return res.status(401).json({ success: false, error: 'Google Calendar API unauthorized', code: 'UNAUTHORIZED' });
        }
        return res.status(listResponse.status).json({ success: false, error: 'Failed to retrieve calendar list to verify write access' });
      }
      const listData = await listResponse.json();
      const calendars = listData.items || [];
      const matched = calendars.find((c: any) => c.id === calendarId);
      if (!matched) {
        return res.status(404).json({ success: false, error: 'Selected calendar not found' });
      }
      const isWritable = matched.accessRole === 'owner' || matched.accessRole === 'writer';
      if (!isWritable) {
        return res.status(400).json({ success: false, error: 'The selected calendar is read-only and cannot be written to' });
      }
    } catch (err: any) {
      console.error('Error verifying calendar write access:', redactSecrets(err.message || String(err)));
      return res.status(500).json({ success: false, error: 'Failed to verify calendar write permission' });
    }

    const eventBody: any = {
      summary: title,
      description: description || '',
      location: location || '',
    };

    if (allDay) {
      eventBody.start = { date: start.includes('T') ? start.split('T')[0] : start };
      eventBody.end = { date: end.includes('T') ? end.split('T')[0] : end };
    } else {
      eventBody.start = { dateTime: new Date(start).toISOString() };
      eventBody.end = { dateTime: new Date(end).toISOString() };
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    await executeGoogleCalendarRequest(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventBody)
    }, res);
  });

  app.patch('/api/calendar/events/:eventId', authMiddleware, async (req: any, res: any) => {
    const secrets = loadSecrets();
    if (!secrets.googleRefreshToken || !secrets.googleWriteAuthorized) {
      return res.status(403).json({ success: false, error: 'CALENDAR_RECONNECT_REQUIRED', code: 'CALENDAR_RECONNECT_REQUIRED' });
    }

    const { eventId } = req.params;
    if (!eventId || !eventId.trim()) {
      return res.status(400).json({ success: false, error: 'Event ID is required' });
    }

    const calendarId = (req.query.calendarId as string) || (req.body.calendarId as string);
    if (!calendarId || !calendarId.trim()) {
      return res.status(400).json({ success: false, error: 'Calendar ID is required' });
    }

    const { title, description, location, start, end, allDay } = req.body;
    if (start && end && new Date(end) <= new Date(start)) {
      return res.status(400).json({ success: false, error: 'End time must be after start time' });
    }

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'Google Calendar is not connected or unauthorized' });
    }

    // Verify calendar is writable
    try {
      const listResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!listResponse.ok) {
        if (listResponse.status === 401) {
          return res.status(401).json({ success: false, error: 'Google Calendar API unauthorized', code: 'UNAUTHORIZED' });
        }
        return res.status(listResponse.status).json({ success: false, error: 'Failed to retrieve calendar list to verify write access' });
      }
      const listData = await listResponse.json();
      const calendars = listData.items || [];
      const matched = calendars.find((c: any) => c.id === calendarId);
      if (!matched) {
        return res.status(404).json({ success: false, error: 'Selected calendar not found' });
      }
      const isWritable = matched.accessRole === 'owner' || matched.accessRole === 'writer';
      if (!isWritable) {
        return res.status(400).json({ success: false, error: 'The selected calendar is read-only and cannot be written to' });
      }
    } catch (err: any) {
      console.error('Error verifying calendar write access:', redactSecrets(err.message || String(err)));
      return res.status(500).json({ success: false, error: 'Failed to verify calendar write permission' });
    }

    const eventBody: any = {};
    if (title !== undefined) eventBody.summary = title;
    if (description !== undefined) eventBody.description = description;
    if (location !== undefined) eventBody.location = location;

    if (start !== undefined) {
      if (allDay) {
        eventBody.start = { date: start.includes('T') ? start.split('T')[0] : start };
      } else {
        eventBody.start = { dateTime: new Date(start).toISOString() };
      }
    }
    if (end !== undefined) {
      if (allDay) {
        eventBody.end = { date: end.includes('T') ? end.split('T')[0] : end };
      } else {
        eventBody.end = { dateTime: new Date(end).toISOString() };
      }
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    await executeGoogleCalendarRequest(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventBody)
    }, res);
  });

  app.delete('/api/calendar/events/:eventId', authMiddleware, async (req: any, res: any) => {
    const secrets = loadSecrets();
    if (!secrets.googleRefreshToken || !secrets.googleWriteAuthorized) {
      return res.status(403).json({ success: false, error: 'CALENDAR_RECONNECT_REQUIRED', code: 'CALENDAR_RECONNECT_REQUIRED' });
    }

    const { eventId } = req.params;
    if (!eventId || !eventId.trim()) {
      return res.status(400).json({ success: false, error: 'Event ID is required' });
    }

    const calendarId = (req.query.calendarId as string) || (req.body.calendarId as string);
    if (!calendarId || !calendarId.trim()) {
      return res.status(400).json({ success: false, error: 'Calendar ID is required' });
    }

    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'Google Calendar is not connected or unauthorized' });
    }

    // Verify calendar is writable
    try {
      const listResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!listResponse.ok) {
        if (listResponse.status === 401) {
          return res.status(401).json({ success: false, error: 'Google Calendar API unauthorized', code: 'UNAUTHORIZED' });
        }
        return res.status(listResponse.status).json({ success: false, error: 'Failed to retrieve calendar list to verify write access' });
      }
      const listData = await listResponse.json();
      const calendars = listData.items || [];
      const matched = calendars.find((c: any) => c.id === calendarId);
      if (!matched) {
        return res.status(404).json({ success: false, error: 'Selected calendar not found' });
      }
      const isWritable = matched.accessRole === 'owner' || matched.accessRole === 'writer';
      if (!isWritable) {
        return res.status(400).json({ success: false, error: 'The selected calendar is read-only and cannot be written to' });
      }
    } catch (err: any) {
      console.error('Error verifying calendar write access:', redactSecrets(err.message || String(err)));
      return res.status(500).json({ success: false, error: 'Failed to verify calendar write permission' });
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    await executeGoogleCalendarRequest(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }, res);
  });

  app.get('/api/calendar/status', authMiddleware, async (req, res) => {
    const secrets = loadSecrets();
    const connected = !!secrets.googleRefreshToken;
    const syncTracking = loadSyncTracking();
    res.json({
      success: true,
      data: {
        provider: 'google_calendar',
        status: connected ? 'connected' : 'disconnected',
        lastSuccessfulSync: syncTracking.google_calendar || null,
        writeAuthorized: !!secrets.googleWriteAuthorized
      }
    });
  });

  // -------------------------------------------------------------
  // Obsidian Storage Adapter (Local-cloud files directory adapter)
  // -------------------------------------------------------------

  function listVaultFiles(folderPath: string, vaultName: string): ObsidianNote[] {
    const targetDir = path.join(VAULT_DIR, folderPath);
    if (!fs.existsSync(targetDir)) {
      return [];
    }

    // Secure directory traversal preventer
    const resolvedPath = fs.realpathSync(targetDir);
    if (!resolvedPath.startsWith(fs.realpathSync(VAULT_DIR))) {
      throw new Error('Directory traversal block triggered');
    }

    try {
      const files = fs.readdirSync(targetDir);
      return files
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const filePath = path.join(targetDir, f);
          const stat = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Generate a beautifully trimmed note preview
          const title = f.replace('.md', '');
          const cleanPreview = content
            .replace(/#+ [^\n]+/g, '') // remove headings
            .trim()
            .substring(0, 160) + (content.length > 160 ? '...' : '');

          const relativePath = path.join(folderPath, f).replace(/\\/g, '/');

          return {
            id: relativePath,
            title,
            path: relativePath,
            folder: folderPath,
            modifiedAt: stat.mtime.toISOString(),
            preview: cleanPreview,
            obsidianUri: `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(relativePath)}`
          };
        });
    } catch (e) {
      console.error('List files error:', e);
      return [];
    }
  }

  app.get('/api/notes/favorites', authMiddleware, async (req, res) => {
    try {
      const settings = await loadSettings();
      const favorites = listVaultFiles(settings.obsidian.favoritesFolder, settings.obsidian.vaultName);
      // Sort favorites by modified date descending
      favorites.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
      res.json({ success: true, data: favorites });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/notes', authMiddleware, async (req, res) => {
    const { content, mode, context } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Content cannot be empty' });
    }

    try {
      const settings = await loadSettings();
      const isPersonal = context === 'personal';
      const folder = isPersonal ? settings.obsidian.personalFolder : settings.obsidian.professionalFolder;

      if (mode === 'append') {
        const relativeInboxFile = isPersonal ? settings.obsidian.personalInboxFile : settings.obsidian.professionalInboxFile;
        const fullFilePath = path.join(VAULT_DIR, relativeInboxFile);

        // Ensure parent folders exist
        fs.mkdirSync(path.dirname(fullFilePath), { recursive: true });

        const nowStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const textToAppend = `\n\n- [${nowStr}] ${content.trim()}`;

        if (fs.existsSync(fullFilePath)) {
          fs.appendFileSync(fullFilePath, textToAppend);
        } else {
          fs.writeFileSync(fullFilePath, `# ${isPersonal ? 'Personal' : 'Professional'} Inbox\n\n- ${content.trim()}`);
        }

        res.json({ success: true, message: 'Note appended to inbox file successfully.' });
      } else {
        // Mode: 'new_note' -> Creates a timestamped markdown file
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const snippet = content.trim().substring(0, 15).replace(/[^a-zA-Z0-9 ]/g, '').trim();
        const filename = `${timestamp}${snippet ? ' ' + snippet : ''}.md`;
        const fullFilePath = path.join(VAULT_DIR, folder, filename);

        // Ensure parent folders exist
        fs.mkdirSync(path.dirname(fullFilePath), { recursive: true });

        // Content
        const fileContent = `# Quick Capture Note\n\nCaptured on: ${new Date().toLocaleString('en-GB')}\n\n${content.trim()}`;
        fs.writeFileSync(fullFilePath, fileContent);

        res.json({ success: true, message: 'New note markdown file created successfully.', filename });
      }
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/notes/status', authMiddleware, (req, res) => {
    res.json({
      success: true,
      data: {
        provider: 'obsidian',
        status: 'connected',
        lastSuccessfulSync: new Date().toISOString()
      }
    });
  });

  // -------------------------------------------------------------
  // Central Unified Dashboard Loader Endpoints (Phase 6)
  // -------------------------------------------------------------

  app.get('/api/dashboard', authMiddleware, async (req, res) => {
    const settings = await loadSettings();
    const cache = loadDashboardCache();
    const syncTracking = loadSyncTracking();

    // 1. Service Status List
    const serviceStatus: ServiceStatus[] = [];

    // Weather Fetching
    let weather: WeatherSnapshot | undefined = undefined;
    try {
      weather = await fetchCurrentWeather(settings.weather.location, settings.weather.units);
      saveDashboardCache({ weather });
      serviceStatus.push({ provider: 'weather', status: 'connected', lastSuccessfulSync: weather?.fetchedAt });
    } catch (e: any) {
      weather = cache.weather;
      serviceStatus.push({
        provider: 'weather',
        status: 'warning',
        lastError: e.message,
        lastSuccessfulSync: weather?.fetchedAt
      });
    }

    // Google Calendar Fetching
    let calendarEvents: CalendarEvent[] = [];
    try {
      const now = new Date();
      // Fetch 30 days before and 30 days after for complete coverage of views
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString();
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30).toISOString();
      calendarEvents = await fetchGoogleCalendarEvents(from, to);
      const syncTime = new Date().toISOString();
      updateSyncTracking('google_calendar', syncTime);
      saveDashboardCache({ calendarEvents });
      serviceStatus.push({ provider: 'google_calendar', status: 'connected', lastSuccessfulSync: syncTime });
    } catch (e: any) {
      calendarEvents = cache.calendarEvents || [];
      serviceStatus.push({
        provider: 'google_calendar',
        status: loadSecrets().googleRefreshToken ? 'warning' : 'disconnected',
        lastError: `Google Calendar Sync Failed: ${e.message}`,
        lastSuccessfulSync: syncTracking.google_calendar || null
      });
    }

    // Todoist Tasks Fetching
    let tasks: TodoistTask[] = [];
    try {
      tasks = await fetchTodoistTasks();
      const syncTime = new Date().toISOString();
      updateSyncTracking('todoist', syncTime);
      saveDashboardCache({ tasks });
      serviceStatus.push({ provider: 'todoist', status: 'connected', lastSuccessfulSync: syncTime });
    } catch (e: any) {
      tasks = cache.tasks || [];
      serviceStatus.push({
        provider: 'todoist',
        status: getTodoistToken() ? 'warning' : 'disconnected',
        lastError: `Todoist Sync Failed: ${e.message}`,
        lastSuccessfulSync: syncTracking.todoist || null
      });
    }

    // Todoist Projects Fetching
    let todoistProjects: TodoistProjectSummary[] = [];
    let todoistInboxProjectId: string | null = cache.todoistInboxProjectId || null;
    try {
      const token = getTodoistToken();
      if (token) {
        const contextParam = (req.query.context as string) || 'combined';
        todoistProjects = await getTodoistProjectSummaries(token, contextParam);
        
        // Identify the genuine Inbox project ID
        const rawProjects = await fetchTodoistWithPagination(
          'https://api.todoist.com/api/v1/projects',
          token,
          'results'
        );
        const inboxProj = rawProjects.find(p => p.inbox_project === true || p.is_inbox_project === true);
        if (inboxProj) {
          todoistInboxProjectId = String(inboxProj.id);
        } else {
          // Fallback based on name "Inbox"
          const inboxByName = rawProjects.find(p => p.name?.toLowerCase() === 'inbox');
          if (inboxByName) {
            todoistInboxProjectId = String(inboxByName.id);
          }
        }
        
        saveDashboardCache({ todoistProjects, todoistInboxProjectId });
      }
    } catch (e: any) {
      todoistProjects = cache.todoistProjects || [];
      todoistInboxProjectId = cache.todoistInboxProjectId || null;
      console.error('Failed to fetch Todoist projects or inbox ID for dashboard, using cache:', e.message);
    }

    // Todoist Sections Fetching
    let todoistSections: TodoistSection[] = [];
    try {
      const token = getTodoistToken();
      if (token) {
        todoistSections = await fetchTodoistSections();
        saveDashboardCache({ todoistSections });
      }
    } catch (e: any) {
      todoistSections = cache.todoistSections || [];
      console.error('Failed to fetch Todoist sections for dashboard, using cache:', e.message);
    }

    // Build complete Obsidian list for full dashboard reference
    let personalNotes: ObsidianNote[] = [];
    let professionalNotes: ObsidianNote[] = [];
    try {
      personalNotes = listVaultFiles(settings.obsidian.personalFolder, settings.obsidian.vaultName);
      professionalNotes = listVaultFiles(settings.obsidian.professionalFolder, settings.obsidian.vaultName);
    } catch (e) {
      // Ignored
    }

    const snapshot: DashboardSnapshot = {
      calendarEvents,
      tasks,
      notes: [...personalNotes, ...professionalNotes],
      todoistProjects,
      weather,
      settings,
      serviceStatus,
      fetchedAt: new Date().toISOString(),
      todoistSections,
      todoistInboxProjectId
    };

    res.json(snapshot);
  });

  // Global search endpoint (Phase 14)
  app.get('/api/search', authMiddleware, async (req, res) => {
    const q = (req.query.q as string || '').trim().toLowerCase();
    const context = req.query.context as string || 'combined';

    if (!q) {
      return res.json({ calendar: [], tasks: [], notes: [] });
    }

    try {
      const settings = await loadSettings();
      
      // 1. Search Notes (Personal, Professional, Favorites folders only)
      const pNotes = listVaultFiles(settings.obsidian.personalFolder, settings.obsidian.vaultName).map(n => ({ ...n, context: 'personal' }));
      const prNotes = listVaultFiles(settings.obsidian.professionalFolder, settings.obsidian.vaultName).map(n => ({ ...n, context: 'professional' }));
      const favNotes = listVaultFiles(settings.obsidian.favoritesFolder, settings.obsidian.vaultName).map(n => ({ ...n, context: 'favorite' }));
      
      let allNotes = [...pNotes, ...prNotes, ...favNotes];
      if (context === 'personal') {
        allNotes = allNotes.filter(n => n.context === 'personal' || n.folder === settings.obsidian.personalFolder);
      } else if (context === 'professional') {
        allNotes = allNotes.filter(n => n.context === 'professional' || n.folder === settings.obsidian.professionalFolder);
      }

      const matchingNotes = allNotes.filter(n => 
        n.title.toLowerCase().includes(q) || 
        n.preview.toLowerCase().includes(q)
      );

      res.json({
        notes: matchingNotes
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // -------------------------------------------------------------
  // Frontend Serving (Production Mode)
  // -------------------------------------------------------------

  if (process.env.DISABLE_HMR === 'true') {
    // HMR disabled, can serve static build folder in production or development without hot module replacement
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Life Site server running on port ${PORT}`);
  });
}

startServer();
}
