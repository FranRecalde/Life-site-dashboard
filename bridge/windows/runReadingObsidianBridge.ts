import crypto from 'node:crypto';
import path from 'node:path';
import { ReadingService } from '../../server/reading/readingService';
import { getFirestoreClient } from '../../server/storage/firestoreClient';
import { FirestoreReadingStore } from '../../server/storage/firestoreReadingStore';
import {
  BridgeCycleResult,
  BridgeProtocolError,
  ReadingObsidianBridge,
  withSingleInstanceLock,
} from './readingObsidianBridge';

const CAPTURE_ID_PATTERN = /^reading_[0-9a-f]{32}$/;

export class BridgeLauncherError extends Error {
  constructor(readonly code: 'INVALID_ARGUMENTS' | 'INVALID_CONFIGURATION' | 'LAUNCHER_FAILED') {
    super(code);
    this.name = 'BridgeLauncherError';
  }
}

interface BridgeRunner {
  runOnce(options?: { expectedCaptureId?: string }): Promise<BridgeCycleResult>;
}

export interface BridgeLauncherDependencies {
  createService?: (projectId: string, databaseId: string) => ReadingService;
  createBridge?: (service: ReadingService, vaultRoot: string, markerFile: string) => BridgeRunner;
  getMarkerFile?: (projectId: string, databaseId: string) => string;
}

function requireAbsolutePath(value: string): string {
  if (!value || !path.isAbsolute(value)) {
    throw new BridgeLauncherError('INVALID_CONFIGURATION');
  }
  return path.resolve(value);
}

function requireIdentifier(value: string): string {
  if (!value || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new BridgeLauncherError('INVALID_CONFIGURATION');
  }
  return value;
}

function getDefaultMarkerFile(projectId: string, databaseId: string): string {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (!localAppData || !path.isAbsolute(localAppData)) {
    throw new BridgeLauncherError('INVALID_CONFIGURATION');
  }
  const identity = crypto
    .createHash('sha256')
    .update(`${projectId}\u0000${databaseId}`, 'utf8')
    .digest('hex');
  return path.join(localAppData, 'LifeSiteDashboard', 'reading-bridge', identity);
}

export async function runReadingBridgeRehearsal(
  projectId: string,
  databaseId: string,
  vaultRoot: string,
  expectedCaptureId: string,
  dependencies: BridgeLauncherDependencies = {},
): Promise<BridgeCycleResult> {
  if (!CAPTURE_ID_PATTERN.test(expectedCaptureId)) {
    throw new BridgeLauncherError('INVALID_ARGUMENTS');
  }
  const resolvedProjectId = requireIdentifier(projectId);
  const resolvedDatabaseId = requireIdentifier(databaseId);
  const resolvedVaultRoot = requireAbsolutePath(vaultRoot);
  const markerFile = requireAbsolutePath((dependencies.getMarkerFile ?? getDefaultMarkerFile)(
    resolvedProjectId,
    resolvedDatabaseId,
  ));
  const service = (dependencies.createService ?? ((configuredProjectId, configuredDatabaseId) => new ReadingService(
    new FirestoreReadingStore(getFirestoreClient(configuredProjectId, configuredDatabaseId)),
  )))(resolvedProjectId, resolvedDatabaseId);
  const bridge = (dependencies.createBridge ?? ((candidate, root, file) => (
    new ReadingObsidianBridge(candidate, root, file)
  )))(service, resolvedVaultRoot, markerFile);
  return withSingleInstanceLock(`${markerFile}.lock`, () => (
    bridge.runOnce({ expectedCaptureId })
  ));
}

function parseArguments(args: string[]): {
  projectId: string;
  databaseId: string;
  vaultRoot: string;
  expectedCaptureId: string;
} {
  if (
    args.length !== 8 ||
    args[0] !== '--firestore-project-id' ||
    args[2] !== '--firestore-database-id' ||
    args[4] !== '--vault-root' ||
    args[6] !== '--expected-capture-id'
  ) {
    throw new BridgeLauncherError('INVALID_ARGUMENTS');
  }
  return {
    projectId: args[1],
    databaseId: args[3],
    vaultRoot: args[5],
    expectedCaptureId: args[7],
  };
}

function safeErrorCode(error: unknown): string {
  if (error instanceof BridgeLauncherError || error instanceof BridgeProtocolError) return error.code;
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
  const stdout = dependencies.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr = dependencies.stderr ?? ((line) => process.stderr.write(`${line}\n`));
  try {
    const parsed = parseArguments(args);
    const run = dependencies.run ?? runReadingBridgeRehearsal;
    const result = await run(
      parsed.projectId,
      parsed.databaseId,
      parsed.vaultRoot,
      parsed.expectedCaptureId,
      dependencies,
    );
    stdout(JSON.stringify(result));
    return result.outcome === 'needs_attention' ? 2 : 0;
  } catch (error) {
    stderr(JSON.stringify({ outcome: 'failed', errorCode: safeErrorCode(error) }));
    return 1;
  }
}

declare const require: NodeRequire | undefined;
declare const module: NodeModule | undefined;

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  void main().then((exitCode) => { process.exitCode = exitCode; });
}
