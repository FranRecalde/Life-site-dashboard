import test from 'node:test';
import assert from 'node:assert/strict';
import { createStores } from './createStores';
import { FirestoreHabitStore } from './firestoreHabitStore';
import {
  evaluatePersistentStorageStatus,
  resolvePersistentStorageConfiguration,
  storageConfigurationErrorMessage,
  storageReadinessHttpStatus,
} from './storageConfig';

const firestoreAddress = {
  GOOGLE_CLOUD_PROJECT: 'configured-project-marker',
  FIRESTORE_DATABASE_ID: 'configured-database-marker',
};

test('1. Missing STORAGE_PROVIDER is rejected', () => {
  const configuration = resolvePersistentStorageConfiguration({});
  assert.equal(configuration.valid, false);
  assert.equal(configuration.reason, 'missing_storage_provider');
  assert.match(storageConfigurationErrorMessage(configuration.reason), /STORAGE_PROVIDER/);
  assert.throws(() => createStores(configuration), /STORAGE_PROVIDER is required/);
});

test('2. Invalid STORAGE_PROVIDER is rejected without echoing its value', () => {
  const invalidValue = 'unsafe-provider-marker';
  const configuration = resolvePersistentStorageConfiguration({ STORAGE_PROVIDER: invalidValue });
  const message = storageConfigurationErrorMessage(configuration.reason);

  assert.equal(configuration.valid, false);
  assert.equal(configuration.reason, 'invalid_storage_provider');
  assert.match(message, /STORAGE_PROVIDER/);
  assert.equal(message.includes(invalidValue), false);
});

test('3. Explicit local provider works in local development', () => {
  const configuration = resolvePersistentStorageConfiguration({
    NODE_ENV: 'development',
    STORAGE_PROVIDER: 'local',
  });

  assert.equal(configuration.valid, true);
  assert.equal(configuration.runtime, 'local');
  assert.equal(createStores(configuration).provider, 'local');
});

test('4. Local provider is rejected in Cloud Run', () => {
  const configuration = resolvePersistentStorageConfiguration({
    K_SERVICE: 'deployed-service',
    STORAGE_PROVIDER: 'local',
  });

  assert.equal(configuration.valid, false);
  assert.equal(configuration.deployedRuntime, true);
  assert.equal(configuration.reason, 'deployed_runtime_requires_firestore');
});

test('5. Local provider is rejected in production', () => {
  const configuration = resolvePersistentStorageConfiguration({
    NODE_ENV: 'production',
    STORAGE_PROVIDER: 'local',
  });

  assert.equal(configuration.valid, false);
  assert.equal(configuration.reason, 'deployed_runtime_requires_firestore');
});

test('6. Dual provider is rejected in Cloud Run', () => {
  const configuration = resolvePersistentStorageConfiguration({
    K_SERVICE: 'deployed-service',
    STORAGE_PROVIDER: 'dual',
    ...firestoreAddress,
  });

  assert.equal(configuration.valid, false);
  assert.equal(configuration.reason, 'deployed_runtime_requires_firestore');
});

test('7. Dual provider is rejected in production', () => {
  const configuration = resolvePersistentStorageConfiguration({
    NODE_ENV: 'production',
    STORAGE_PROVIDER: 'dual',
    ...firestoreAddress,
  });

  assert.equal(configuration.valid, false);
  assert.equal(configuration.reason, 'deployed_runtime_requires_firestore');
});

test('8. Firestore provider without GOOGLE_CLOUD_PROJECT is rejected', () => {
  const configuration = resolvePersistentStorageConfiguration({
    STORAGE_PROVIDER: 'firestore',
    FIRESTORE_DATABASE_ID: 'configured-database',
  });

  assert.equal(configuration.valid, false);
  assert.equal(configuration.reason, 'missing_firestore_project');
});

test('9. Firestore provider without FIRESTORE_DATABASE_ID is rejected', () => {
  const configuration = resolvePersistentStorageConfiguration({
    STORAGE_PROVIDER: 'firestore',
    GOOGLE_CLOUD_PROJECT: 'configured-project',
  });

  assert.equal(configuration.valid, false);
  assert.equal(configuration.reason, 'missing_firestore_database');
});

test('10. Explicit Firestore project and database configuration is accepted', () => {
  const configuration = resolvePersistentStorageConfiguration({
    NODE_ENV: 'production',
    STORAGE_PROVIDER: 'firestore',
    ...firestoreAddress,
  });

  assert.equal(configuration.valid, true);
  assert.equal(configuration.provider, 'firestore');
  assert.equal(configuration.projectId, firestoreAddress.GOOGLE_CLOUD_PROJECT);
  assert.equal(configuration.databaseId, firestoreAddress.FIRESTORE_DATABASE_ID);
});

test('11. Explicit (default) Firestore database ID is accepted', () => {
  const configuration = resolvePersistentStorageConfiguration({
    STORAGE_PROVIDER: 'firestore',
    GOOGLE_CLOUD_PROJECT: 'configured-project',
    FIRESTORE_DATABASE_ID: '(default)',
  });

  assert.equal(configuration.valid, true);
  assert.equal(configuration.databaseId, '(default)');
});

test('12. Deployed Firestore failure cannot silently become local success', async () => {
  const configuration = resolvePersistentStorageConfiguration({
    K_SERVICE: 'deployed-service',
    STORAGE_PROVIDER: 'firestore',
    ...firestoreAddress,
  });
  const stores = createStores(configuration);
  const status = await evaluatePersistentStorageStatus(configuration, async () => false);

  assert.equal(stores.provider, 'firestore');
  assert.ok(stores.habits instanceof FirestoreHabitStore);
  assert.equal(status.firestoreReachable, false);
  assert.equal(status.persistentStorageReady, false);
});

test('13. Readiness reports Firestore failure as unavailable', async () => {
  const configuration = resolvePersistentStorageConfiguration({
    NODE_ENV: 'production',
    STORAGE_PROVIDER: 'firestore',
    ...firestoreAddress,
  });
  const status = await evaluatePersistentStorageStatus(configuration, async () => false);

  assert.equal(status.persistentStorageRequired, true);
  assert.equal(status.persistentStorageConfigurationValid, true);
  assert.equal(status.persistentStorageReady, false);
  assert.equal(storageReadinessHttpStatus(status), 503);
});

test('Invalid deployed storage configuration has an unavailable readiness status', async () => {
  const configuration = resolvePersistentStorageConfiguration({
    K_SERVICE: 'deployed-service',
    STORAGE_PROVIDER: 'local',
  });
  const status = await evaluatePersistentStorageStatus(configuration, async () => true);

  assert.equal(status.persistentStorageConfigurationValid, false);
  assert.equal(status.persistentStorageReady, false);
  assert.equal(storageReadinessHttpStatus(status), 503);
});

test('14. Local readiness does not call or classify Firestore as reachable', async () => {
  const configuration = resolvePersistentStorageConfiguration({
    STORAGE_PROVIDER: 'local',
  });
  let probeCalled = false;
  const status = await evaluatePersistentStorageStatus(configuration, async () => {
    probeCalled = true;
    return true;
  });

  assert.equal(probeCalled, false);
  assert.equal(status.firestoreReachable, false);
  assert.equal(status.persistentStorageRequired, false);
  assert.equal(status.persistentStorageReady, true);
});

test('15. Safe readiness output omits configured project and database values', async () => {
  const configuration = resolvePersistentStorageConfiguration({
    STORAGE_PROVIDER: 'firestore',
    ...firestoreAddress,
  });
  const status = await evaluatePersistentStorageStatus(configuration, async () => true);
  const serialized = JSON.stringify(status);

  assert.equal(status.firestoreProjectConfigured, true);
  assert.equal(status.firestoreDatabaseConfigured, true);
  assert.equal(serialized.includes(firestoreAddress.GOOGLE_CLOUD_PROJECT), false);
  assert.equal(serialized.includes(firestoreAddress.FIRESTORE_DATABASE_ID), false);
  assert.equal('projectId' in status, false);
  assert.equal('databaseId' in status, false);
});

test('FIRESTORE_PROJECT_ID is not accepted as an alternative project address', () => {
  const configuration = resolvePersistentStorageConfiguration({
    STORAGE_PROVIDER: 'firestore',
    FIRESTORE_PROJECT_ID: 'legacy-project',
    FIRESTORE_DATABASE_ID: 'configured-database',
  });

  assert.equal(configuration.valid, false);
  assert.equal(configuration.reason, 'missing_firestore_project');
});

test('Explicit dual mode remains available only in a local runtime', () => {
  const configuration = resolvePersistentStorageConfiguration({
    NODE_ENV: 'development',
    STORAGE_PROVIDER: 'dual',
    ...firestoreAddress,
  });

  assert.equal(configuration.valid, true);
  assert.equal(configuration.deployedRuntime, false);
  assert.equal(configuration.provider, 'dual');
});
