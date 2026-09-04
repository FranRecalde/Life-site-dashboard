import crypto from 'node:crypto';
import path from 'node:path';
import { ReadingService } from '../../server/reading/readingService';
import { getFirestoreClient } from '../../server/storage/firestoreClient';
import { FirestoreReadingStore } from '../../server/storage/firestoreReadingStore';
import { LocalReadingStore } from '../../server/storage/localReadingStore';
import {
  BridgeCycleResult,
  BridgeDrainResult,
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
  drainPendingCaptures(): Promise<BridgeDrainResult>;
}

export interface BridgeLauncherDependencies {
  createService?: (projectId: string, databaseId: string) => ReadingService;
  createLocalService?: (stateFile: string) => ReadingService;
  createBridge?: (service: ReadingService, vaultRoot: string, markerBasePath: string) => BridgeRunner;
  getMarkerBasePath?: (projectId: string, databaseId: string) => string;
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

function getDefaultMarkerBasePath(projectId: string, databaseId: string): string {
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
  projectId: string | undefined,
  databaseId: string | undefined,
  vaultRoot: string,
  expectedCaptureId: string | undefined,
  dependencies: BridgeLauncherDependencies = {},
  localStorePath?: string,
): Promise<BridgeCycleResult | BridgeDrainResult> {
  if (expectedCaptureId !== undefined && !CAPTURE_ID_PATTERN.test(expectedCaptureId)) {
    throw new BridgeLauncherError('INVALID_ARGUMENTS');
  }
  const resolvedVaultRoot = requireAbsolutePath(vaultRoot);
  const resolvedLocalStorePath = localStorePath === undefined ? undefined : requireAbsolutePath(localStorePath);
  const resolvedProjectId = resolvedLocalStorePath ? undefined : requireIdentifier(projectId ?? '');
  const resolvedDatabaseId = resolvedLocalStorePath ? undefined : requireIdentifier(databaseId ?? '');
  const markerBasePath = resolvedLocalStorePath ?? requireAbsolutePath((dependencies.getMarkerBasePath ?? getDefaultMarkerBasePath)(
    resolvedProjectId!,
    resolvedDatabaseId!,
  ));
  const service = resolvedLocalStorePath
    ? (dependencies.createLocalService ?? ((stateFile) => new ReadingService(new LocalReadingStore(stateFile))))(resolvedLocalStorePath)
    : (dependencies.createService ?? ((configuredProjectId, configuredDatabaseId) => new ReadingService(
      new FirestoreReadingStore(getFirestoreClient(configuredProjectId, configuredDatabaseId)),
    )))(resolvedProjectId!, resolvedDatabaseId!);
  const bridge = (dependencies.createBridge ?? ((candidate, root, file) => (
    new ReadingObsidianBridge(candidate, root, file)
  )))(service, resolvedVaultRoot, markerBasePath);
  return withSingleInstanceLock<BridgeCycleResult | BridgeDrainResult>(`${markerBasePath}.lock`, () => (
    expectedCaptureId === undefined
      ? bridge.drainPendingCaptures()
      : bridge.runOnce({ expectedCaptureId })
  ));
}

function parseArguments(args: string[]): {
  projectId?: string;
  databaseId?: string;
  vaultRoot: string;
  expectedCaptureId?: string;
  localStorePath?: string;
} {
  const allowed = new Set(['--firestore-project-id', '--firestore-database-id', '--vault-root', '--expected-capture-id', '--local-store']);
  const values = new Map<string, string>();
  if (args.length % 2 !== 0) throw new BridgeLauncherError('INVALID_ARGUMENTS');
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]; const value = args[index + 1];
    if (!allowed.has(flag) || !value || values.has(flag)) throw new BridgeLauncherError('INVALID_ARGUMENTS');
    values.set(flag, value);
  }
  const localStorePath = values.get('--local-store');
  if (!values.get('--vault-root') || (!localStorePath && (!values.get('--firestore-project-id') || !values.get('--firestore-database-id')))) throw new BridgeLauncherError('INVALID_ARGUMENTS');
  return {
    projectId: values.get('--firestore-project-id'),
    databaseId: values.get('--firestore-database-id'),
    vaultRoot: values.get('--vault-root')!,
    expectedCaptureId: values.get('--expected-capture-id'),
    localStorePath,
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
      parsed.localStorePath,
    );
    const deliveredCaptureIds = 'deliveredCaptureIds' in result
      ? result.deliveredCaptureIds
      : result.outcome === 'delivered' ? [result.captureId] : [];
    stdout(JSON.stringify({
      ...result,
      deliveredCount: deliveredCaptureIds.length,
      deliveredCaptureIds,
    }));
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
