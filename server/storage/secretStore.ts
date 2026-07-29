import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import fs from 'fs';
import path from 'path';

export interface SecretStore {
  getSecret(secretId: string): Promise<string | null>;
  setSecretVersion(secretId: string, payload: string): Promise<void>;
  hasSecret(secretId: string): Promise<boolean>;
}

export type SecretProviderType = 'existing' | 'secretmanager';
export type SafeSecretProviderName = SecretProviderType | 'missing' | 'invalid';

export const LOGICAL_SECRET_SUFFIXES = {
  LIFE_SITE_USERNAME: 'username',
  LIFE_SITE_PASSWORD_HASH: 'password-hash',
  SESSION_SECRET: 'session-secret',
  TODOIST_API_TOKEN: 'todoist-token',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  GOOGLE_REFRESH_TOKEN: 'google-refresh-token',
  GOOGLE_WRITE_AUTHORIZED: 'google-write-authorized',
  READING_CAPTURE_API_TOKEN_HASH: 'reading-capture-api-token-hash',
  READING_BRIDGE_API_TOKEN_HASH: 'reading-bridge-api-token-hash',
} as const;

export type LogicalSecretKey = keyof typeof LOGICAL_SECRET_SUFFIXES;

const LEGACY_SECRET_MAPPING: Record<LogicalSecretKey, string> = {
  LIFE_SITE_USERNAME: 'lifeSiteUsername',
  LIFE_SITE_PASSWORD_HASH: 'lifeSitePasswordHash',
  SESSION_SECRET: 'sessionSecret',
  TODOIST_API_TOKEN: 'todoistToken',
  GOOGLE_CLIENT_ID: 'googleClientId',
  GOOGLE_CLIENT_SECRET: 'googleClientSecret',
  GOOGLE_REFRESH_TOKEN: 'googleRefreshToken',
  GOOGLE_WRITE_AUTHORIZED: 'googleWriteAuthorized',
  READING_CAPTURE_API_TOKEN_HASH: 'readingCaptureApiTokenHash',
  READING_BRIDGE_API_TOKEN_HASH: 'readingBridgeApiTokenHash',
};

const REVERSE_LEGACY_SECRET_MAPPING = Object.fromEntries(
  Object.entries(LEGACY_SECRET_MAPPING).map(([logicalKey, legacyKey]) => [legacyKey, logicalKey]),
) as Record<string, LogicalSecretKey>;

const DATA_DIR = path.join(process.cwd(), 'data');
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const SECRET_PREFIX_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export type SecretConfigurationReason =
  | 'ready'
  | 'missing_secret_provider'
  | 'invalid_secret_provider'
  | 'deployed_secretmanager_required'
  | 'missing_secret_manager_project'
  | 'invalid_secret_manager_project'
  | 'missing_secret_name_prefix'
  | 'invalid_secret_name_prefix';

export interface SecretStoreConfiguration {
  provider: SecretProviderType | null;
  deployedRuntime: boolean;
  secretManagerProjectConfigured: boolean;
  secretNamePrefixConfigured: boolean;
  valid: boolean;
  reason: SecretConfigurationReason;
  projectId?: string;
  prefix?: string;
}

export interface SafeSecretConfigurationStatus {
  secretProvider: SafeSecretProviderName;
  deployedRuntime: boolean;
  secretManagerProjectConfigured: boolean;
  secretNamePrefixConfigured: boolean;
  secretConfigurationValid: boolean;
  secretConfigurationReason: SecretConfigurationReason;
}

export interface SafeSecretAvailabilityStatus {
  usernameSecretAvailable: boolean;
  passwordHashSecretAvailable: boolean;
  sessionSecretAvailable: boolean;
  requiredLoginSecretsAvailable: boolean;
  todoistSecretAvailable: boolean;
  googleClientIdSecretAvailable: boolean;
  googleClientSecretAvailable: boolean;
  googleRefreshTokenAvailable: boolean;
  googleWriteAuthorizedStateAvailable: boolean;
  writableOAuthSecretConfigurationReady: boolean;
  readingCaptureApiTokenHashAvailable: boolean;
  readingCaptureApiCredentialReady: boolean;
  readingBridgeApiTokenHashAvailable: boolean;
  readingBridgeApiCredentialReady: boolean;
}

export type LogicalSecretValues = Partial<Record<LogicalSecretKey, string | null | undefined>>;

export class SecretStoreConfigurationError extends Error {
  readonly reason: SecretConfigurationReason;

  constructor(reason: SecretConfigurationReason) {
    super(reason);
    this.name = 'SecretStoreConfigurationError';
    this.reason = reason;
  }
}

export class SecretStoreOperationError extends Error {
  readonly reason: 'secret_write_failed';

  constructor() {
    super('secret_write_failed');
    this.name = 'SecretStoreOperationError';
    this.reason = 'secret_write_failed';
  }
}

export class UnknownLogicalSecretKeyError extends Error {
  readonly reason = 'unknown_logical_secret_key' as const;

  constructor() {
    super('unknown_logical_secret_key');
    this.name = 'UnknownLogicalSecretKeyError';
  }
}

function configuredValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function isDeployedSecretRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV?.trim().toLowerCase() === 'production' || !!configuredValue(env.K_SERVICE);
}

export function resolveSecretStoreConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): SecretStoreConfiguration {
  const deployedRuntime = isDeployedSecretRuntime(env);
  const rawProvider = configuredValue(env.SECRET_PROVIDER)?.toLowerCase();

  if (!rawProvider) {
    if (!deployedRuntime) {
      return {
        provider: 'existing',
        deployedRuntime,
        secretManagerProjectConfigured: false,
        secretNamePrefixConfigured: false,
        valid: true,
        reason: 'ready',
      };
    }
    return {
      provider: null,
      deployedRuntime,
      secretManagerProjectConfigured: false,
      secretNamePrefixConfigured: false,
      valid: false,
      reason: 'missing_secret_provider',
    };
  }

  if (rawProvider !== 'existing' && rawProvider !== 'secretmanager') {
    return {
      provider: null,
      deployedRuntime,
      secretManagerProjectConfigured: false,
      secretNamePrefixConfigured: false,
      valid: false,
      reason: 'invalid_secret_provider',
    };
  }

  if (rawProvider === 'existing') {
    return {
      provider: 'existing',
      deployedRuntime,
      secretManagerProjectConfigured: false,
      secretNamePrefixConfigured: false,
      valid: !deployedRuntime,
      reason: deployedRuntime ? 'deployed_secretmanager_required' : 'ready',
    };
  }

  const projectId = configuredValue(env.SECRET_MANAGER_PROJECT_ID);
  const prefix = configuredValue(env.SECRET_NAME_PREFIX);
  const base = {
    provider: 'secretmanager' as const,
    deployedRuntime,
    secretManagerProjectConfigured: !!projectId,
    secretNamePrefixConfigured: !!prefix,
  };

  if (!projectId) {
    return { ...base, valid: false, reason: 'missing_secret_manager_project' };
  }
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    return { ...base, valid: false, reason: 'invalid_secret_manager_project' };
  }
  if (!prefix) {
    return { ...base, projectId, valid: false, reason: 'missing_secret_name_prefix' };
  }
  if (!SECRET_PREFIX_PATTERN.test(prefix)) {
    return { ...base, projectId, valid: false, reason: 'invalid_secret_name_prefix' };
  }

  return {
    ...base,
    projectId,
    prefix,
    valid: true,
    reason: 'ready',
  };
}

export function getSafeSecretConfigurationStatus(
  configuration: SecretStoreConfiguration = resolveSecretStoreConfiguration(),
): SafeSecretConfigurationStatus {
  return {
    secretProvider:
      configuration.provider ??
      (configuration.reason === 'missing_secret_provider' ? 'missing' : 'invalid'),
    deployedRuntime: configuration.deployedRuntime,
    secretManagerProjectConfigured: configuration.secretManagerProjectConfigured,
    secretNamePrefixConfigured: configuration.secretNamePrefixConfigured,
    secretConfigurationValid: configuration.valid,
    secretConfigurationReason: configuration.reason,
  };
}

export function evaluateSafeSecretAvailability(
  configuration: SecretStoreConfiguration,
  values: LogicalSecretValues,
): SafeSecretAvailabilityStatus {
  const available = (logicalKey: LogicalSecretKey): boolean => {
    const value = values[logicalKey];
    return typeof value === 'string' && value.trim() !== '';
  };
  const usernameSecretAvailable = available('LIFE_SITE_USERNAME');
  const passwordHashSecretAvailable = available('LIFE_SITE_PASSWORD_HASH');
  const sessionSecretAvailable = available('SESSION_SECRET');
  const writeAuthorizedValue = values.GOOGLE_WRITE_AUTHORIZED?.trim();
  const readingCaptureApiTokenHash =
    values.READING_CAPTURE_API_TOKEN_HASH?.trim() ?? '';
  const readingBridgeApiTokenHash =
    values.READING_BRIDGE_API_TOKEN_HASH?.trim() ?? '';

  return {
    usernameSecretAvailable,
    passwordHashSecretAvailable,
    sessionSecretAvailable,
    requiredLoginSecretsAvailable:
      usernameSecretAvailable && passwordHashSecretAvailable && sessionSecretAvailable,
    todoistSecretAvailable: available('TODOIST_API_TOKEN'),
    googleClientIdSecretAvailable: available('GOOGLE_CLIENT_ID'),
    googleClientSecretAvailable: available('GOOGLE_CLIENT_SECRET'),
    googleRefreshTokenAvailable: available('GOOGLE_REFRESH_TOKEN'),
    googleWriteAuthorizedStateAvailable:
      writeAuthorizedValue === 'true' || writeAuthorizedValue === 'false',
    writableOAuthSecretConfigurationReady:
      configuration.provider === 'secretmanager' && configuration.valid,
    readingCaptureApiTokenHashAvailable: readingCaptureApiTokenHash !== '',
    readingCaptureApiCredentialReady:
      /^[0-9a-f]{64}$/i.test(readingCaptureApiTokenHash),
    readingBridgeApiTokenHashAvailable: readingBridgeApiTokenHash !== '',
    readingBridgeApiCredentialReady:
      /^[0-9a-f]{64}$/i.test(readingBridgeApiTokenHash),
  };
}

function assertSafePrefix(prefix: string): void {
  if (!SECRET_PREFIX_PATTERN.test(prefix)) {
    throw new SecretStoreConfigurationError('invalid_secret_name_prefix');
  }
}

export function mapLogicalSecretToSecretId(logicalKey: string, prefix: string): string {
  assertSafePrefix(prefix);
  if (!Object.prototype.hasOwnProperty.call(LOGICAL_SECRET_SUFFIXES, logicalKey)) {
    throw new UnknownLogicalSecretKeyError();
  }
  return `${prefix}-${LOGICAL_SECRET_SUFFIXES[logicalKey as LogicalSecretKey]}`;
}

function normalizeLogicalKey(secretId: string): LogicalSecretKey | null {
  if (Object.prototype.hasOwnProperty.call(LOGICAL_SECRET_SUFFIXES, secretId)) {
    return secretId as LogicalSecretKey;
  }
  return REVERSE_LEGACY_SECRET_MAPPING[secretId] ?? null;
}

export class ExistingSecretStore implements SecretStore {
  private loadLocalFile(): Record<string, unknown> {
    if (!fs.existsSync(SECRETS_FILE)) {
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }

  private saveLocalFile(data: Record<string, unknown>): void {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(SECRETS_FILE, JSON.stringify(data, null, 2));
    } catch {
      console.error('[Secrets] Local secret persistence failed.');
      throw new SecretStoreOperationError();
    }
  }

  async getSecret(secretId: string): Promise<string | null> {
    const logicalKey = normalizeLogicalKey(secretId);
    if (!logicalKey) {
      return null;
    }

    const envValue = process.env[logicalKey];
    if (envValue !== undefined && envValue !== '') {
      return envValue;
    }

    const fileData = this.loadLocalFile();
    const legacyKey = LEGACY_SECRET_MAPPING[logicalKey];
    const value = fileData[legacyKey] ?? fileData[logicalKey];
    return value === undefined || value === null ? null : String(value);
  }

  async setSecretVersion(secretId: string, payload: string): Promise<void> {
    const logicalKey = normalizeLogicalKey(secretId);
    if (!logicalKey) {
      throw new SecretStoreOperationError();
    }

    process.env[logicalKey] = payload;
    const fileData = this.loadLocalFile();
    fileData[LEGACY_SECRET_MAPPING[logicalKey]] = payload;
    fileData[logicalKey] = payload;
    this.saveLocalFile(fileData);
  }

  async hasSecret(secretId: string): Promise<boolean> {
    const value = await this.getSecret(secretId);
    return value !== null && value !== '';
  }
}

export interface SecretManagerClientLike {
  accessSecretVersion(request: { name: string }): Promise<[{ payload?: { data?: unknown } }]>;
  addSecretVersion(request: {
    parent: string;
    payload: { data: Buffer };
  }): Promise<unknown>;
}

export class GoogleSecretManagerStore implements SecretStore {
  private readonly client: SecretManagerClientLike;
  private readonly projectId: string;
  private readonly prefix: string;

  constructor(
    configuration: SecretStoreConfiguration = resolveSecretStoreConfiguration(),
    client: SecretManagerClientLike = new SecretManagerServiceClient() as unknown as SecretManagerClientLike,
  ) {
    if (
      configuration.provider !== 'secretmanager' ||
      !configuration.valid ||
      !configuration.projectId ||
      !configuration.prefix
    ) {
      throw new SecretStoreConfigurationError(configuration.reason);
    }
    this.client = client;
    this.projectId = configuration.projectId;
    this.prefix = configuration.prefix;
  }

  private resolveSecretId(logicalKey: string): string {
    return mapLogicalSecretToSecretId(logicalKey, this.prefix);
  }

  async getSecret(logicalKey: string): Promise<string | null> {
    const secretId = this.resolveSecretId(logicalKey);
    const name = `projects/${this.projectId}/secrets/${secretId}/versions/latest`;
    try {
      const [version] = await this.client.accessSecretVersion({ name });
      const data = version.payload?.data;
      if (data === undefined || data === null) {
        return null;
      }
      const payload = Buffer.isBuffer(data)
        ? data.toString('utf8')
        : Buffer.from(data as Uint8Array).toString('utf8');
      return payload || null;
    } catch {
      console.error('[Secrets] Secret Manager read failed. Reason: secret_read_failed.');
      return null;
    }
  }

  async setSecretVersion(logicalKey: string, payload: string): Promise<void> {
    const secretId = this.resolveSecretId(logicalKey);
    const parent = `projects/${this.projectId}/secrets/${secretId}`;
    try {
      await this.client.addSecretVersion({
        parent,
        payload: { data: Buffer.from(payload, 'utf8') },
      });
    } catch {
      console.error('[Secrets] Secret Manager write failed. Reason: secret_write_failed.');
      throw new SecretStoreOperationError();
    }
  }

  async hasSecret(logicalKey: string): Promise<boolean> {
    const value = await this.getSecret(logicalKey);
    return value !== null && value !== '';
  }
}

let activeSecretStore: SecretStore | null = null;

export function getSecretStore(
  configuration: SecretStoreConfiguration = resolveSecretStoreConfiguration(),
): SecretStore {
  if (!configuration.valid) {
    throw new SecretStoreConfigurationError(configuration.reason);
  }
  if (!activeSecretStore) {
    activeSecretStore = configuration.provider === 'secretmanager'
      ? new GoogleSecretManagerStore(configuration)
      : new ExistingSecretStore();
  }
  return activeSecretStore;
}

export function resetSecretStoreForTests(): void {
  activeSecretStore = null;
}

export function getSecretProvider(
  configuration: SecretStoreConfiguration = resolveSecretStoreConfiguration(),
): SafeSecretProviderName {
  return getSafeSecretConfigurationStatus(configuration).secretProvider;
}

export function redactSecrets(text: string, knownSecrets: string[] = []): string {
  if (!text) return text;
  let redacted = text;

  for (const secret of knownSecrets) {
    if (secret && secret.length > 5) {
      const escaped = secret.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      redacted = redacted.replace(new RegExp(escaped, 'g'), '[REDACTED]');
    }
  }

  redacted = redacted.replace(
    /(?:client_secret|token|access_token|refresh_token|code|password|password_hash|Authorization|Bearer)[=:\s"']+(\w+[-_~]*)/gi,
    (match, value) => value === 'REDACTED' ? match : match.replace(value, '[REDACTED]'),
  );

  return redacted;
}
