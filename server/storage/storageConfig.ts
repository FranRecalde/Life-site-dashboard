import { StorageProviderType } from './types';

export type StorageRuntime = 'deployed' | 'local';

export type StorageValidationReason =
  | 'ready'
  | 'missing_storage_provider'
  | 'invalid_storage_provider'
  | 'deployed_runtime_requires_firestore'
  | 'missing_firestore_project'
  | 'missing_firestore_database';

export interface PersistentStorageConfiguration {
  runtime: StorageRuntime;
  deployedRuntime: boolean;
  provider: StorageProviderType | null;
  projectId?: string;
  databaseId?: string;
  firestoreProjectConfigured: boolean;
  firestoreDatabaseConfigured: boolean;
  valid: boolean;
  reason: StorageValidationReason;
}

export interface SafePersistentStorageStatus {
  storageProvider: StorageProviderType | 'missing' | 'invalid';
  deployedRuntime: boolean;
  persistentStorageRequired: boolean;
  persistentStorageConfigurationValid: boolean;
  persistentStorageConfigurationReason: StorageValidationReason;
  firestoreProjectConfigured: boolean;
  firestoreDatabaseConfigured: boolean;
  firestoreReachable: boolean;
  persistentStorageReady: boolean;
}

export type FirestoreConnectivityProbe = () => Promise<boolean>;

const SUPPORTED_PROVIDERS: readonly StorageProviderType[] = ['local', 'dual', 'firestore'];

function configuredValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Resolves storage configuration without reading credentials or contacting GCP.
 * K_SERVICE is set by Cloud Run and prevents a missing NODE_ENV from weakening
 * deployed storage requirements.
 */
export function resolvePersistentStorageConfiguration(
  env: Readonly<Record<string, string | undefined>> = process.env
): PersistentStorageConfiguration {
  const deployedRuntime = env.NODE_ENV === 'production' || !!configuredValue(env.K_SERVICE);
  const runtime: StorageRuntime = deployedRuntime ? 'deployed' : 'local';
  const rawProvider = configuredValue(env.STORAGE_PROVIDER)?.toLowerCase();
  const projectId = configuredValue(env.GOOGLE_CLOUD_PROJECT);
  const databaseId = configuredValue(env.FIRESTORE_DATABASE_ID);
  const firestoreProjectConfigured = !!projectId;
  const firestoreDatabaseConfigured = !!databaseId;

  const result = (
    provider: StorageProviderType | null,
    valid: boolean,
    reason: StorageValidationReason
  ): PersistentStorageConfiguration => ({
    runtime,
    deployedRuntime,
    provider,
    projectId,
    databaseId,
    firestoreProjectConfigured,
    firestoreDatabaseConfigured,
    valid,
    reason,
  });

  if (!rawProvider) {
    return result(null, false, 'missing_storage_provider');
  }

  if (!SUPPORTED_PROVIDERS.includes(rawProvider as StorageProviderType)) {
    return result(null, false, 'invalid_storage_provider');
  }

  const provider = rawProvider as StorageProviderType;

  if (deployedRuntime && provider !== 'firestore') {
    return result(provider, false, 'deployed_runtime_requires_firestore');
  }

  if (provider === 'firestore' || provider === 'dual') {
    if (!projectId) {
      return result(provider, false, 'missing_firestore_project');
    }
    if (!databaseId) {
      return result(provider, false, 'missing_firestore_database');
    }
  }

  return result(provider, true, 'ready');
}

export function storageConfigurationErrorMessage(reason: StorageValidationReason): string {
  switch (reason) {
    case 'missing_storage_provider':
      return 'STORAGE_PROVIDER is required.';
    case 'invalid_storage_provider':
      return 'STORAGE_PROVIDER is invalid; expected local, dual, or firestore.';
    case 'deployed_runtime_requires_firestore':
      return 'STORAGE_PROVIDER must be firestore in production and Cloud Run.';
    case 'missing_firestore_project':
      return 'GOOGLE_CLOUD_PROJECT is required when STORAGE_PROVIDER uses Firestore.';
    case 'missing_firestore_database':
      return 'FIRESTORE_DATABASE_ID is required when STORAGE_PROVIDER uses Firestore.';
    case 'ready':
      return 'Persistent storage configuration is ready.';
  }
}

export class PersistentStorageConfigurationError extends Error {
  readonly reason: StorageValidationReason;

  constructor(reason: StorageValidationReason) {
    super(storageConfigurationErrorMessage(reason));
    this.name = 'PersistentStorageConfigurationError';
    this.reason = reason;
  }
}

export function requireValidPersistentStorageConfiguration(
  configuration: PersistentStorageConfiguration
): asserts configuration is PersistentStorageConfiguration & { provider: StorageProviderType } {
  if (!configuration.valid || !configuration.provider) {
    throw new PersistentStorageConfigurationError(configuration.reason);
  }
}

/**
 * Produces the safe operational view used by readiness and diagnostics. Project
 * and database identifiers deliberately never enter this result.
 */
export async function evaluatePersistentStorageStatus(
  configuration: PersistentStorageConfiguration,
  probeFirestore: FirestoreConnectivityProbe
): Promise<SafePersistentStorageStatus> {
  const persistentStorageRequired =
    configuration.deployedRuntime ||
    configuration.provider === 'firestore' ||
    configuration.provider === 'dual';

  let firestoreReachable = false;
  if (
    configuration.valid &&
    (configuration.provider === 'firestore' || configuration.provider === 'dual')
  ) {
    try {
      firestoreReachable = await probeFirestore();
    } catch {
      firestoreReachable = false;
    }
  }

  const persistentStorageReady =
    configuration.valid && (!persistentStorageRequired || firestoreReachable);

  return {
    storageProvider:
      configuration.provider ??
      (configuration.reason === 'missing_storage_provider' ? 'missing' : 'invalid'),
    deployedRuntime: configuration.deployedRuntime,
    persistentStorageRequired,
    persistentStorageConfigurationValid: configuration.valid,
    persistentStorageConfigurationReason: configuration.reason,
    firestoreProjectConfigured: configuration.firestoreProjectConfigured,
    firestoreDatabaseConfigured: configuration.firestoreDatabaseConfigured,
    firestoreReachable,
    persistentStorageReady,
  };
}

export function storageReadinessHttpStatus(
  status: SafePersistentStorageStatus
): 200 | 503 {
  return status.persistentStorageReady ? 200 : 503;
}
