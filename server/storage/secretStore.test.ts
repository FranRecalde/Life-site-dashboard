import test from 'node:test';
import assert from 'node:assert';
import {
  ExistingSecretStore,
  evaluateSafeSecretAvailability,
  getSafeSecretConfigurationStatus,
  GoogleSecretManagerStore,
  LOGICAL_SECRET_SUFFIXES,
  mapLogicalSecretToSecretId,
  resolveSecretStoreConfiguration,
  SecretStoreConfigurationError,
  type SecretManagerClientLike,
  SecretStoreOperationError,
  UnknownLogicalSecretKeyError,
} from './secretStore';

class MockSecretManagerClient implements SecretManagerClientLike {
  readonly accessedNames: string[] = [];
  readonly writes: Array<{ parent: string; payload: string }> = [];
  readonly values = new Map<string, string>();
  readError: Error | null = null;
  writeError: Error | null = null;

  async accessSecretVersion(request: { name: string }): Promise<[{ payload?: { data?: unknown } }]> {
    this.accessedNames.push(request.name);
    if (this.readError) throw this.readError;
    const value = this.values.get(request.name);
    if (value === undefined) throw new Error('not found');
    return [{ payload: { data: Buffer.from(value, 'utf8') } }];
  }

  async addSecretVersion(request: {
    parent: string;
    payload: { data: Buffer };
  }): Promise<unknown> {
    if (this.writeError) throw this.writeError;
    this.writes.push({
      parent: request.parent,
      payload: request.payload.data.toString('utf8'),
    });
    return [{}];
  }
}

const deployedSecretManagerEnvironment = (
  prefix: string,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  SECRET_PROVIDER: 'secretmanager',
  SECRET_MANAGER_PROJECT_ID: 'gen-lang-client-0802447346',
  SECRET_NAME_PREFIX: prefix,
  GOOGLE_CLOUD_PROJECT: 'life-dashboard-502020',
  ...overrides,
});

test('logical secret keys map to exact, environment-specific secret IDs', () => {
  const expectedSuffixes = {
    LIFE_SITE_USERNAME: 'username',
    LIFE_SITE_PASSWORD_HASH: 'password-hash',
    SESSION_SECRET: 'session-secret',
    TODOIST_API_TOKEN: 'todoist-token',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GOOGLE_REFRESH_TOKEN: 'google-refresh-token',
    GOOGLE_WRITE_AUTHORIZED: 'google-write-authorized',
  };

  assert.deepStrictEqual(LOGICAL_SECRET_SUFFIXES, expectedSuffixes);
  for (const [logicalKey, suffix] of Object.entries(expectedSuffixes)) {
    assert.strictEqual(
      mapLogicalSecretToSecretId(logicalKey, 'life-site-prod'),
      `life-site-prod-${suffix}`,
    );
    assert.strictEqual(
      mapLogicalSecretToSecretId(logicalKey, 'life-site-staging'),
      `life-site-staging-${suffix}`,
    );
  }
});

test('Secret Manager uses its explicit project and ignores the Firestore project', async () => {
  const configuration = resolveSecretStoreConfiguration(
    deployedSecretManagerEnvironment('life-site-prod'),
  );
  const client = new MockSecretManagerClient();
  const expectedName =
    'projects/gen-lang-client-0802447346/secrets/life-site-prod-username/versions/latest';
  client.values.set(expectedName, 'test-login-value');
  const store = new GoogleSecretManagerStore(configuration, client);

  assert.strictEqual(await store.getSecret('LIFE_SITE_USERNAME'), 'test-login-value');
  assert.deepStrictEqual(client.accessedNames, [expectedName]);
  assert.strictEqual(client.accessedNames[0].includes('life-dashboard-502020'), false);
});

test('deployed secret configuration fails closed when provider, project, or prefix is unsafe', () => {
  assert.deepStrictEqual(
    resolveSecretStoreConfiguration({ NODE_ENV: 'production' }).reason,
    'missing_secret_provider',
  );
  assert.deepStrictEqual(
    resolveSecretStoreConfiguration({
      NODE_ENV: 'production',
      SECRET_PROVIDER: 'existing',
    }).reason,
    'deployed_secretmanager_required',
  );
  assert.deepStrictEqual(
    resolveSecretStoreConfiguration({
      NODE_ENV: 'production',
      SECRET_PROVIDER: 'secretmanager',
      SECRET_NAME_PREFIX: 'life-site-prod',
    }).reason,
    'missing_secret_manager_project',
  );
  assert.deepStrictEqual(
    resolveSecretStoreConfiguration({
      NODE_ENV: 'production',
      SECRET_PROVIDER: 'secretmanager',
      SECRET_MANAGER_PROJECT_ID: 'INVALID_PROJECT',
      SECRET_NAME_PREFIX: 'life-site-prod',
    }).reason,
    'invalid_secret_manager_project',
  );
  assert.deepStrictEqual(
    resolveSecretStoreConfiguration({
      NODE_ENV: 'production',
      SECRET_PROVIDER: 'secretmanager',
      SECRET_MANAGER_PROJECT_ID: 'gen-lang-client-0802447346',
    }).reason,
    'missing_secret_name_prefix',
  );

  for (const prefix of ['Life-Site-Prod', 'life_site_prod', '-life-site', 'life-site-', 'ab']) {
    assert.strictEqual(
      resolveSecretStoreConfiguration(
        deployedSecretManagerEnvironment(prefix),
      ).reason,
      'invalid_secret_name_prefix',
    );
  }
});

test('Cloud Run is treated as deployed even when NODE_ENV is not production', () => {
  const configuration = resolveSecretStoreConfiguration({
    NODE_ENV: 'development',
    K_SERVICE: 'life-site-dashboard-staging',
    SECRET_PROVIDER: 'existing',
  });
  assert.strictEqual(configuration.deployedRuntime, true);
  assert.strictEqual(configuration.valid, false);
  assert.strictEqual(configuration.reason, 'deployed_secretmanager_required');
});

test('unknown logical keys and access-token persistence are rejected', async () => {
  const configuration = resolveSecretStoreConfiguration(
    deployedSecretManagerEnvironment('life-site-prod'),
  );
  const store = new GoogleSecretManagerStore(configuration, new MockSecretManagerClient());

  await assert.rejects(() => store.getSecret('UNEXPECTED_SECRET'), UnknownLogicalSecretKeyError);
  await assert.rejects(
    () => store.setSecretVersion('GOOGLE_ACCESS_TOKEN', 'memory-only-test-value'),
    UnknownLogicalSecretKeyError,
  );
});

test('Secret Manager never falls back to environment values', async () => {
  const original = process.env.LIFE_SITE_USERNAME;
  process.env.LIFE_SITE_USERNAME = 'environment-fallback-must-not-be-used';
  const client = new MockSecretManagerClient();
  client.readError = new Error('not found');
  const store = new GoogleSecretManagerStore(
    resolveSecretStoreConfiguration(deployedSecretManagerEnvironment('life-site-prod')),
    client,
  );

  try {
    assert.strictEqual(await store.getSecret('LIFE_SITE_USERNAME'), null);
  } finally {
    if (original === undefined) delete process.env.LIFE_SITE_USERNAME;
    else process.env.LIFE_SITE_USERNAME = original;
  }
});

test('existing mode remains available for deliberate local development', async () => {
  const original = process.env.LIFE_SITE_USERNAME;
  process.env.LIFE_SITE_USERNAME = 'local-development-user';
  try {
    const configuration = resolveSecretStoreConfiguration({ SECRET_PROVIDER: 'existing' });
    assert.strictEqual(configuration.valid, true);
    assert.strictEqual(configuration.provider, 'existing');
    assert.strictEqual(await new ExistingSecretStore().getSecret('LIFE_SITE_USERNAME'), 'local-development-user');
  } finally {
    if (original === undefined) delete process.env.LIFE_SITE_USERNAME;
    else process.env.LIFE_SITE_USERNAME = original;
  }
});

test('secret writes target the correct environment project and prefix', async () => {
  const productionClient = new MockSecretManagerClient();
  const stagingClient = new MockSecretManagerClient();
  const productionStore = new GoogleSecretManagerStore(
    resolveSecretStoreConfiguration(deployedSecretManagerEnvironment('life-site-prod')),
    productionClient,
  );
  const stagingStore = new GoogleSecretManagerStore(
    resolveSecretStoreConfiguration(deployedSecretManagerEnvironment('life-site-staging')),
    stagingClient,
  );

  await productionStore.setSecretVersion('GOOGLE_REFRESH_TOKEN', 'production-test-refresh');
  await stagingStore.setSecretVersion('GOOGLE_WRITE_AUTHORIZED', 'true');

  assert.strictEqual(
    productionClient.writes[0].parent,
    'projects/gen-lang-client-0802447346/secrets/life-site-prod-google-refresh-token',
  );
  assert.strictEqual(
    stagingClient.writes[0].parent,
    'projects/gen-lang-client-0802447346/secrets/life-site-staging-google-write-authorized',
  );
});

test('provider errors and safe diagnostics never contain secret payloads or configured identifiers', async () => {
  const marker = 'private-test-secret-payload-987';
  const client = new MockSecretManagerClient();
  client.writeError = new Error(`provider rejected ${marker}`);
  const configuration = resolveSecretStoreConfiguration(
    deployedSecretManagerEnvironment('life-site-prod'),
  );
  const store = new GoogleSecretManagerStore(configuration, client);
  const logged: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => logged.push(args.join(' '));

  try {
    await assert.rejects(
      () => store.setSecretVersion('GOOGLE_REFRESH_TOKEN', marker),
      (error: unknown) => {
        assert.ok(error instanceof SecretStoreOperationError);
        assert.strictEqual(error.message, 'secret_write_failed');
        assert.strictEqual(error.message.includes(marker), false);
        return true;
      },
    );
  } finally {
    console.error = originalError;
  }

  const diagnostic = JSON.stringify(getSafeSecretConfigurationStatus(configuration));
  assert.strictEqual(logged.join(' ').includes(marker), false);
  assert.strictEqual(diagnostic.includes(marker), false);
  assert.strictEqual(diagnostic.includes('gen-lang-client-0802447346'), false);
  assert.strictEqual(diagnostic.includes('life-site-prod'), false);
});

test('safe readiness requires login secrets but keeps optional integrations non-blocking', () => {
  const configuration = resolveSecretStoreConfiguration(
    deployedSecretManagerEnvironment('life-site-staging'),
  );
  const ready = evaluateSafeSecretAvailability(configuration, {
    LIFE_SITE_USERNAME: 'readiness-test-user',
    LIFE_SITE_PASSWORD_HASH: 'readiness-test-hash',
    SESSION_SECRET: 'readiness-test-session',
    GOOGLE_WRITE_AUTHORIZED: 'false',
  });

  assert.strictEqual(ready.requiredLoginSecretsAvailable, true);
  assert.strictEqual(ready.todoistSecretAvailable, false);
  assert.strictEqual(ready.googleClientIdSecretAvailable, false);
  assert.strictEqual(ready.googleRefreshTokenAvailable, false);
  assert.strictEqual(ready.googleWriteAuthorizedStateAvailable, true);
  assert.strictEqual(ready.writableOAuthSecretConfigurationReady, true);

  const missingSession = evaluateSafeSecretAvailability(configuration, {
    LIFE_SITE_USERNAME: 'readiness-test-user',
    LIFE_SITE_PASSWORD_HASH: 'readiness-test-hash',
  });
  assert.strictEqual(missingSession.sessionSecretAvailable, false);
  assert.strictEqual(missingSession.requiredLoginSecretsAvailable, false);
  assert.strictEqual(JSON.stringify(missingSession).includes('readiness-test-user'), false);
});

test('invalid Secret Manager configuration cannot construct a provider', () => {
  const configuration = resolveSecretStoreConfiguration({
    NODE_ENV: 'production',
    SECRET_PROVIDER: 'secretmanager',
  });
  assert.throws(
    () => new GoogleSecretManagerStore(configuration, new MockSecretManagerClient()),
    SecretStoreConfigurationError,
  );
});
