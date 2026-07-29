import fs from 'node:fs/promises';
import path from 'node:path';
import {
  BridgeCycleResult,
  BridgeProtocolError,
  HttpReadingBridgeClient,
  ReadingBridgeClient,
  ReadingObsidianBridge,
  withSingleInstanceLock,
} from './readingObsidianBridge';
import {
  readWindowsGenericCredential,
  WindowsCredentialError,
} from './windowsCredential';

const CAPTURE_ID_PATTERN = /^reading_[0-9a-f]{32}$/;
const OWNER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const CREDENTIAL_TARGET_PATTERN = /^[\x20-\x7e]{1,256}$/;
const MAX_CONFIG_BYTES = 16 * 1024;

export interface ReadingBridgeLauncherConfig {
  baseUrl: string;
  vaultRoot: string;
  ownerId: string;
  credentialTarget: string;
}

export class BridgeLauncherError extends Error {
  constructor(
    readonly code:
      | 'INVALID_ARGUMENTS'
      | 'INVALID_CONFIGURATION'
      | 'LAUNCHER_FAILED',
  ) {
    super(code);
    this.name = 'BridgeLauncherError';
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireExactKeys(
  value: JsonRecord,
  expected: readonly string[],
): void {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    keys.length !== sortedExpected.length ||
    keys.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new BridgeLauncherError('INVALID_CONFIGURATION');
  }
}

function requireTrimmedString(
  value: unknown,
  pattern?: RegExp,
): string {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    value.length === 0 ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    (pattern && !pattern.test(value))
  ) {
    throw new BridgeLauncherError('INVALID_CONFIGURATION');
  }
  return value;
}

function validateBaseUrl(value: unknown): string {
  const raw = requireTrimmedString(value);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BridgeLauncherError('INVALID_CONFIGURATION');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new BridgeLauncherError('INVALID_CONFIGURATION');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '');
}

function validateConfig(value: unknown): ReadingBridgeLauncherConfig {
  if (!isRecord(value)) {
    throw new BridgeLauncherError('INVALID_CONFIGURATION');
  }
  requireExactKeys(value, [
    'baseUrl',
    'credentialTarget',
    'ownerId',
    'vaultRoot',
  ]);
  const vaultRoot = requireTrimmedString(value.vaultRoot);
  if (!path.isAbsolute(vaultRoot)) {
    throw new BridgeLauncherError('INVALID_CONFIGURATION');
  }
  return {
    baseUrl: validateBaseUrl(value.baseUrl),
    vaultRoot: path.resolve(vaultRoot),
    ownerId: requireTrimmedString(value.ownerId, OWNER_ID_PATTERN),
    credentialTarget: requireTrimmedString(
      value.credentialTarget,
      CREDENTIAL_TARGET_PATTERN,
    ),
  };
}

export async function loadReadingBridgeLauncherConfig(
  configPath: string,
): Promise<ReadingBridgeLauncherConfig> {
  if (!path.isAbsolute(configPath)) {
    throw new BridgeLauncherError('INVALID_CONFIGURATION');
  }
  try {
    const stat = await fs.stat(configPath);
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) {
      throw new BridgeLauncherError('INVALID_CONFIGURATION');
    }
    const raw = await fs.readFile(configPath, 'utf8');
    return validateConfig(JSON.parse(raw));
  } catch (error) {
    if (error instanceof BridgeLauncherError) throw error;
    throw new BridgeLauncherError('INVALID_CONFIGURATION');
  }
}

interface BridgeRunner {
  recoverExpired(): Promise<number>;
  runOnce(options?: { expectedCaptureId?: string }): Promise<BridgeCycleResult>;
}

export interface BridgeLauncherDependencies {
  readCredential?: (target: string) => Promise<string>;
  createClient?: (baseUrl: string, token: string) => ReadingBridgeClient;
  createBridge?: (
    client: ReadingBridgeClient,
    vaultRoot: string,
    ownerId: string,
  ) => BridgeRunner;
}

export async function runReadingBridgeRehearsal(
  configPath: string,
  expectedCaptureId: string,
  dependencies: BridgeLauncherDependencies = {},
): Promise<BridgeCycleResult> {
  if (!CAPTURE_ID_PATTERN.test(expectedCaptureId)) {
    throw new BridgeLauncherError('INVALID_ARGUMENTS');
  }
  const config = await loadReadingBridgeLauncherConfig(configPath);
  const readCredential =
    dependencies.readCredential ?? readWindowsGenericCredential;
  const createClient = dependencies.createClient ??
    ((baseUrl, token) => new HttpReadingBridgeClient(baseUrl, token));
  const createBridge = dependencies.createBridge ??
    ((client, vaultRoot, ownerId) => (
      new ReadingObsidianBridge(client, vaultRoot, ownerId)
    ));
  const lockIdentity = `${path.resolve(configPath)}.lock`;

  return withSingleInstanceLock(lockIdentity, async () => {
    let token = await readCredential(config.credentialTarget);
    try {
      const client = createClient(config.baseUrl, token);
      const bridge = createBridge(
        client,
        config.vaultRoot,
        config.ownerId,
      );
      await bridge.recoverExpired();
      return await bridge.runOnce({ expectedCaptureId });
    } finally {
      token = '';
    }
  });
}

function parseArguments(args: string[]): {
  configPath: string;
  expectedCaptureId: string;
} {
  if (
    args.length !== 4 ||
    args[0] !== '--config' ||
    args[2] !== '--expected-capture-id' ||
    !args[1] ||
    !args[3]
  ) {
    throw new BridgeLauncherError('INVALID_ARGUMENTS');
  }
  return {
    configPath: args[1],
    expectedCaptureId: args[3],
  };
}

function safeErrorCode(error: unknown): string {
  if (
    error instanceof BridgeLauncherError ||
    error instanceof BridgeProtocolError ||
    error instanceof WindowsCredentialError
  ) {
    return error.code;
  }
  return 'LAUNCHER_FAILED';
}

export async function main(
  args: string[] = process.argv.slice(2),
  dependencies: BridgeLauncherDependencies & {
    run?: typeof runReadingBridgeRehearsal;
    stdout?: (line: string) => void;
    stderr?: (line: string) => void;
  } = {},
): Promise<number> {
  const stdout =
    dependencies.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr =
    dependencies.stderr ?? ((line) => process.stderr.write(`${line}\n`));
  try {
    const parsed = parseArguments(args);
    const run = dependencies.run ?? runReadingBridgeRehearsal;
    const result = await run(
      parsed.configPath,
      parsed.expectedCaptureId,
      dependencies,
    );
    stdout(JSON.stringify(result));
    return result.outcome === 'needs_attention' ? 2 : 0;
  } catch (error) {
    stderr(JSON.stringify({
      outcome: 'failed',
      errorCode: safeErrorCode(error),
    }));
    return 1;
  }
}

declare const require: NodeRequire | undefined;
declare const module: NodeModule | undefined;

if (
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  require.main === module
) {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
