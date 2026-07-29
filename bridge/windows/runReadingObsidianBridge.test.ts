import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  BridgeLauncherError,
  loadReadingBridgeLauncherConfig,
  main,
  runReadingBridgeRehearsal,
} from './runReadingObsidianBridge';

async function createConfig(
  overrides: Record<string, unknown> = {},
): Promise<{ directory: string; configPath: string }> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'life-site-reading-bridge-launcher-'),
  );
  const configPath = path.join(directory, 'staging.json');
  await fs.writeFile(configPath, JSON.stringify({
    baseUrl: 'https://staging.example.test',
    vaultRoot: path.join(directory, 'rehearsal-vault'),
    ownerId: 'windows-bridge-staging-rehearsal',
    credentialTarget: 'LifeSiteDashboard/ReadingBridge/Staging',
    ...overrides,
  }), 'utf8');
  return { directory, configPath };
}

test('launcher configuration is strict, non-secret, and requires HTTPS', async () => {
  const fixture = await createConfig();
  try {
    assert.deepStrictEqual(
      await loadReadingBridgeLauncherConfig(fixture.configPath),
      {
        baseUrl: 'https://staging.example.test',
        vaultRoot: path.join(fixture.directory, 'rehearsal-vault'),
        ownerId: 'windows-bridge-staging-rehearsal',
        credentialTarget: 'LifeSiteDashboard/ReadingBridge/Staging',
      },
    );

    for (const overrides of [
      { token: 'must-never-be-configured' },
      { baseUrl: 'http://staging.example.test' },
      { vaultRoot: 'relative-vault' },
      { ownerId: 'unsafe owner' },
      { credentialTarget: 'unsafe\ncredential' },
    ]) {
      const invalid = await createConfig(overrides);
      try {
        await assert.rejects(
          () => loadReadingBridgeLauncherConfig(invalid.configPath),
          (error: unknown) => (
            error instanceof BridgeLauncherError &&
            error.code === 'INVALID_CONFIGURATION'
          ),
        );
      } finally {
        await fs.rm(invalid.directory, { recursive: true, force: true });
      }
    }
  } finally {
    await fs.rm(fixture.directory, { recursive: true, force: true });
  }
});

test('one-shot rehearsal reads the credential, recovers, then claims the expected capture', async () => {
  const fixture = await createConfig();
  const events: string[] = [];
  const expectedCaptureId = `reading_${'a'.repeat(32)}`;
  try {
    const result = await runReadingBridgeRehearsal(
      fixture.configPath,
      expectedCaptureId,
      {
        readCredential: async (target) => {
          events.push(`credential:${target}`);
          return 'A'.repeat(43);
        },
        createClient: (baseUrl, token) => {
          events.push(`client:${baseUrl}:${token.length}`);
          return {} as any;
        },
        createBridge: (_client, vaultRoot, ownerId) => {
          events.push(`bridge:${vaultRoot}:${ownerId}`);
          return {
            recoverExpired: async () => {
              events.push('recover');
              return 0;
            },
            runOnce: async (options) => {
              events.push(`run:${options?.expectedCaptureId}`);
              return { outcome: 'idle' };
            },
          };
        },
      },
    );

    assert.deepStrictEqual(result, { outcome: 'idle' });
    assert.deepStrictEqual(events, [
      'credential:LifeSiteDashboard/ReadingBridge/Staging',
      'client:https://staging.example.test:43',
      `bridge:${path.join(fixture.directory, 'rehearsal-vault')}:windows-bridge-staging-rehearsal`,
      'recover',
      `run:${expectedCaptureId}`,
    ]);
  } finally {
    await fs.rm(fixture.directory, { recursive: true, force: true });
  }
});

test('CLI requires an expected capture and emits only sanitized failures', async () => {
  const privateDetail = 'private credential and vault detail';
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await main(
    [
      '--config',
      'C:\\safe\\staging.json',
      '--expected-capture-id',
      `reading_${'b'.repeat(32)}`,
    ],
    {
      run: async () => {
        throw new Error(privateDetail);
      },
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    },
  );

  assert.strictEqual(exitCode, 1);
  assert.deepStrictEqual(stdout, []);
  assert.deepStrictEqual(stderr, [
    '{"outcome":"failed","errorCode":"LAUNCHER_FAILED"}',
  ]);
  assert.strictEqual(stderr.join('').includes(privateDetail), false);

  assert.strictEqual(
    await main([], {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    }),
    1,
  );
  assert.ok(stderr.includes(
    '{"outcome":"failed","errorCode":"INVALID_ARGUMENTS"}',
  ));
});
