import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  CredentialCommand,
  readWindowsGenericCredential,
  runCredentialCommand,
  WindowsCredentialError,
} from './windowsCredential';

const credentialTarget = 'LifeSiteDashboard/ReadingBridge/Staging';
const token = 'A'.repeat(43);

test('credential reader uses a hidden bounded PowerShell process without token arguments', async () => {
  let observed: CredentialCommand | null = null;
  const result = await readWindowsGenericCredential(credentialTarget, {
    platform: 'win32',
    env: {
      SystemRoot: 'C:\\Windows',
      TEMP: 'C:\\Temp',
      READING_BRIDGE_API_TOKEN: 'must-not-be-inherited',
    },
    runner: async (command) => {
      observed = command;
      return Buffer.from(token, 'utf8');
    },
  });

  assert.strictEqual(result, token);
  assert.ok(observed);
  assert.strictEqual(observed.windowsHide, true);
  assert.strictEqual(observed.maxOutputBytes, 4 * 1024);
  assert.deepStrictEqual(observed.args.slice(0, 3), [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
  ]);
  assert.strictEqual(observed.args.includes('-ExecutionPolicy'), false);
  assert.strictEqual(
    observed.env.LIFE_SITE_BRIDGE_CREDENTIAL_TARGET,
    credentialTarget,
  );
  assert.strictEqual(observed.env.READING_BRIDGE_API_TOKEN, undefined);
  assert.strictEqual(
    JSON.stringify({ executable: observed.executable, args: observed.args })
      .includes(token),
    false,
  );
});

test('embedded credential reader source compiles without accessing Credential Manager', {
  skip: process.platform !== 'win32',
}, async () => {
  let observed: CredentialCommand | null = null;
  await readWindowsGenericCredential(credentialTarget, {
    platform: 'win32',
    env: process.env,
    runner: async (command) => {
      observed = command;
      return Buffer.from(token, 'utf8');
    },
  });

  assert.ok(observed);
  const script = observed.args.at(-1);
  assert.ok(script);
  const sourceMatch = script.match(
    /Add-Type -TypeDefinition @'\r?\n(?<source>[\s\S]*?)\r?\n'@/,
  );
  assert.ok(sourceMatch?.groups?.source);
  const compileScript = `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${sourceMatch.groups.source}
'@`;
  const result = spawnSync(
    observed.executable,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', compileScript],
    {
      env: observed.env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
    },
  );

  assert.strictEqual(result.error, undefined);
  assert.strictEqual(result.status, 0);
});

test('credential reader rejects unsafe targets before starting PowerShell', async () => {
  let invoked = false;
  await assert.rejects(
    () => readWindowsGenericCredential('unsafe\ncredential', {
      platform: 'win32',
      env: { SystemRoot: 'C:\\Windows' },
      runner: async () => {
        invoked = true;
        return Buffer.from(token);
      },
    }),
    (error: unknown) => (
      error instanceof WindowsCredentialError &&
      error.code === 'INVALID_CREDENTIAL_TARGET'
    ),
  );
  assert.strictEqual(invoked, false);
});

test('credential reader fails closed off Windows', async () => {
  await assert.rejects(
    () => readWindowsGenericCredential(credentialTarget, {
      platform: 'linux',
      env: { SystemRoot: 'C:\\Windows' },
      runner: async () => Buffer.from(token),
    }),
    (error: unknown) => (
      error instanceof WindowsCredentialError &&
      error.code === 'UNSUPPORTED_PLATFORM'
    ),
  );
});

test('credential reader exposes only fixed errors for missing or malformed credentials', async () => {
  const privateError = 'private provider detail';
  await assert.rejects(
    () => readWindowsGenericCredential(credentialTarget, {
      platform: 'win32',
      env: { SystemRoot: 'C:\\Windows' },
      runner: async () => {
        throw new Error(privateError);
      },
    }),
    (error: unknown) => (
      error instanceof WindowsCredentialError &&
      error.code === 'CREDENTIAL_UNAVAILABLE' &&
      !error.message.includes(privateError)
    ),
  );
  await assert.rejects(
    () => readWindowsGenericCredential(credentialTarget, {
      platform: 'win32',
      env: { SystemRoot: 'C:\\Windows' },
      runner: async () => Buffer.from('short'),
    }),
    (error: unknown) => (
      error instanceof WindowsCredentialError &&
      error.code === 'CREDENTIAL_INVALID'
    ),
  );
});

test('credential command enforces its output bound', async () => {
  await assert.rejects(
    () => runCredentialCommand({
      executable: process.execPath,
      args: ['--eval', `process.stdout.write('x'.repeat(${4 * 1024 + 1}))`],
      env: {},
      timeoutMs: 10_000,
      windowsHide: true,
      maxOutputBytes: 4 * 1024,
    }),
    (error: unknown) => (
      error instanceof WindowsCredentialError &&
      error.code === 'CREDENTIAL_INVALID'
    ),
  );
});

test('credential command times out with a fixed error', async () => {
  await assert.rejects(
    () => runCredentialCommand({
      executable: process.execPath,
      args: ['--eval', 'setInterval(() => undefined, 1_000)'],
      env: {},
      timeoutMs: 50,
      windowsHide: true,
      maxOutputBytes: 4 * 1024,
    }),
    (error: unknown) => (
      error instanceof WindowsCredentialError &&
      error.code === 'CREDENTIAL_UNAVAILABLE'
    ),
  );
});
