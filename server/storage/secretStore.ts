import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import fs from 'fs';
import path from 'path';

export interface SecretStore {
  getSecret(secretId: string): Promise<string | null>;
  setSecretVersion(secretId: string, payload: string): Promise<void>;
  hasSecret(secretId: string): Promise<boolean>;
}

export type SecretProviderType = 'existing' | 'secretmanager';

const DATA_DIR = path.join(process.cwd(), 'data');
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');

// Map logical secret IDs to the keys used inside secrets.json
export const SECRET_MAPPING: Record<string, string> = {
  LIFE_SITE_USERNAME: 'lifeSiteUsername',
  LIFE_SITE_PASSWORD_HASH: 'lifeSitePasswordHash',
  SESSION_SECRET: 'sessionSecret',
  TODOIST_API_TOKEN: 'todoistToken',
  GOOGLE_CLIENT_ID: 'googleClientId',
  GOOGLE_CLIENT_SECRET: 'googleClientSecret',
  GOOGLE_REFRESH_TOKEN: 'googleRefreshToken',
  GOOGLE_WRITE_AUTHORIZED: 'googleWriteAuthorized'
};

export class ExistingSecretStore implements SecretStore {
  private loadLocalFile(): Record<string, any> {
    if (fs.existsSync(SECRETS_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
      } catch (e) {
        return {};
      }
    }
    return {};
  }

  private saveLocalFile(data: Record<string, any>): void {
    try {
      fs.writeFileSync(SECRETS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('Failed to save local secrets file:', e);
    }
  }

  async getSecret(secretId: string): Promise<string | null> {
    // Standardize to logical name if camelCase is queried, or vice versa
    let logicalId = secretId;
    const reverseMapping: Record<string, string> = {
      lifeSiteUsername: 'LIFE_SITE_USERNAME',
      lifeSitePasswordHash: 'LIFE_SITE_PASSWORD_HASH',
      sessionSecret: 'SESSION_SECRET',
      todoistToken: 'TODOIST_API_TOKEN',
      googleClientId: 'GOOGLE_CLIENT_ID',
      googleClientSecret: 'GOOGLE_CLIENT_SECRET',
      googleRefreshToken: 'GOOGLE_REFRESH_TOKEN',
      googleWriteAuthorized: 'GOOGLE_WRITE_AUTHORIZED'
    };

    if (reverseMapping[secretId]) {
      logicalId = reverseMapping[secretId];
    }

    // 1. Check process.env first with logical UPPER_SNAKE_CASE name
    if (process.env[logicalId] !== undefined && process.env[logicalId] !== '') {
      return process.env[logicalId];
    }
    // Fallback to check process.env with the original queried name
    if (process.env[secretId] !== undefined && process.env[secretId] !== '') {
      return process.env[secretId];
    }

    // 2. Fallback to secrets.json legacy file
    const fileData = this.loadLocalFile();
    const localKey = SECRET_MAPPING[logicalId] || logicalId;

    if (fileData[localKey] !== undefined && fileData[localKey] !== null) {
      return String(fileData[localKey]);
    }
    if (fileData[logicalId] !== undefined && fileData[logicalId] !== null) {
      return String(fileData[logicalId]);
    }
    if (fileData[secretId] !== undefined && fileData[secretId] !== null) {
      return String(fileData[secretId]);
    }

    return null;
  }

  async setSecretVersion(secretId: string, payload: string): Promise<void> {
    let logicalId = secretId;
    const reverseMapping: Record<string, string> = {
      lifeSiteUsername: 'LIFE_SITE_USERNAME',
      lifeSitePasswordHash: 'LIFE_SITE_PASSWORD_HASH',
      sessionSecret: 'SESSION_SECRET',
      todoistToken: 'TODOIST_API_TOKEN',
      googleClientId: 'GOOGLE_CLIENT_ID',
      googleClientSecret: 'GOOGLE_CLIENT_SECRET',
      googleRefreshToken: 'GOOGLE_REFRESH_TOKEN',
      googleWriteAuthorized: 'GOOGLE_WRITE_AUTHORIZED'
    };

    if (reverseMapping[secretId]) {
      logicalId = reverseMapping[secretId];
    }

    // Update process.env with precedence
    process.env[logicalId] = payload;
    if (logicalId !== secretId) {
      process.env[secretId] = payload;
    }

    const fileData = this.loadLocalFile();
    const localKey = SECRET_MAPPING[logicalId] || logicalId;

    // Save under legacy camelCase key for backward compatibility
    fileData[localKey] = payload;
    // Also store logical ID
    if (localKey !== logicalId) {
      fileData[logicalId] = payload;
    }
    this.saveLocalFile(fileData);
  }

  async hasSecret(secretId: string): Promise<boolean> {
    const val = await this.getSecret(secretId);
    return val !== null && val !== '';
  }
}

export class GoogleSecretManagerStore implements SecretStore {
  private client: SecretManagerServiceClient;
  private projectIdPromise: Promise<string>;

  constructor() {
    this.client = new SecretManagerServiceClient();
    this.projectIdPromise = (async () => {
      try {
        const projectId = process.env.GOOGLE_CLOUD_PROJECT || await this.client.getProjectId();
        return projectId || '';
      } catch (e: any) {
        console.error('Failed to auto-detect Google Cloud Project ID from ADC:', e.message || e);
        return '';
      }
    })();
  }

  async getSecret(secretId: string): Promise<string | null> {
    try {
      const projId = await this.projectIdPromise;
      if (!projId) {
        throw new Error('Google Cloud Project ID is not available.');
      }

      const name = `projects/${projId}/secrets/${secretId}/versions/latest`;
      const [version] = await this.client.accessSecretVersion({ name });
      const payload = version.payload?.data?.toString();
      return payload || null;
    } catch (e: any) {
      const errMsg = e.message || String(e);
      console.error(`GoogleSecretManagerStore: Failed to access secret ${secretId}:`, redactSecrets(errMsg));
      return null;
    }
  }

  async setSecretVersion(secretId: string, payload: string): Promise<void> {
    try {
      const projId = await this.projectIdPromise;
      if (!projId) {
        throw new Error('Google Cloud Project ID is not available.');
      }

      const parent = `projects/${projId}/secrets/${secretId}`;
      await this.client.addSecretVersion({
        parent,
        payload: {
          data: Buffer.from(payload, 'utf8'),
        },
      });
      
      // Update process.env so the running service sees the new value immediately
      process.env[secretId] = payload;
    } catch (e: any) {
      console.error(`GoogleSecretManagerStore: Failed to set version for secret ${secretId}:`, e.message || e);
      throw e;
    }
  }

  async hasSecret(secretId: string): Promise<boolean> {
    try {
      const val = await this.getSecret(secretId);
      return val !== null && val !== '';
    } catch (e) {
      return false;
    }
  }
}

let activeSecretStore: SecretStore | null = null;

export function getSecretStore(): SecretStore {
  if (!activeSecretStore) {
    const provider = (process.env.SECRET_PROVIDER || 'existing').toLowerCase();
    if (provider === 'secretmanager') {
      activeSecretStore = new GoogleSecretManagerStore();
    } else {
      activeSecretStore = new ExistingSecretStore();
    }
  }
  return activeSecretStore;
}

export function getSecretProvider(): SecretProviderType {
  const provider = (process.env.SECRET_PROVIDER || 'existing').toLowerCase();
  return provider === 'secretmanager' ? 'secretmanager' : 'existing';
}

export function redactSecrets(text: string, knownSecrets: string[] = []): string {
  if (!text) return text;
  let redacted = text;
  
  // 1. Redact known active secrets
  for (const secret of knownSecrets) {
    if (secret && secret.length > 5) {
      // Escape regex special chars
      const escaped = secret.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escaped, 'g');
      redacted = redacted.replace(regex, '[REDACTED]');
    }
  }

  // 2. Redact common OAuth / token / client-secret patterns
  redacted = redacted.replace(/(?:client_secret|token|access_token|refresh_token|code|password|password_hash|Authorization|Bearer)[=:\s"']+(\w+[-_~]*)/gi, (match, p1) => {
    if (p1 === 'REDACTED') return match;
    return match.replace(p1, '[REDACTED]');
  });

  return redacted;
}

