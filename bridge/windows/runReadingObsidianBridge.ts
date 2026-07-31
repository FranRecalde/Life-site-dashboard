import path from 'node:path';
import { LocalReadingStore } from '../../server/storage/localReadingStore';
import { ReadingService } from '../../server/reading/readingService';
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
  createService?: (queueFile: string) => ReadingService;
  createBridge?: (service: ReadingService, vaultRoot: string, queueFile: string) => BridgeRunner;
}

function requireAbsolutePath(value: string): string {
  if (!value || !path.isAbsolute(value)) {
    throw new BridgeLauncherError('INVALID_CONFIGURATION');
  }
  return path.resolve(value);
}

export async function runReadingBridgeRehearsal(
  queueFile: string,
  vaultRoot: string,
  expectedCaptureId: string,
  dependencies: BridgeLauncherDependencies = {},
): Promise<BridgeCycleResult> {
  if (!CAPTURE_ID_PATTERN.test(expectedCaptureId)) {
    throw new BridgeLauncherError('INVALID_ARGUMENTS');
  }
  const resolvedQueueFile = requireAbsolutePath(queueFile);
  const resolvedVaultRoot = requireAbsolutePath(vaultRoot);
  const service = (dependencies.createService ?? ((file) => new ReadingService(
    new LocalReadingStore(file, { reconcileDeliveryMarkers: false }),
  )))(resolvedQueueFile);
  const bridge = (dependencies.createBridge ?? ((candidate, root, file) => (
    new ReadingObsidianBridge(candidate, root, file)
  )))(service, resolvedVaultRoot, resolvedQueueFile);
  return withSingleInstanceLock(`${resolvedQueueFile}.lock`, () => (
    bridge.runOnce({ expectedCaptureId })
  ));
}

function parseArguments(args: string[]): { queueFile: string; vaultRoot: string; expectedCaptureId: string } {
  if (
    args.length !== 6 ||
    args[0] !== '--queue-file' ||
    args[2] !== '--vault-root' ||
    args[4] !== '--expected-capture-id'
  ) {
    throw new BridgeLauncherError('INVALID_ARGUMENTS');
  }
  return { queueFile: args[1], vaultRoot: args[3], expectedCaptureId: args[5] };
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
    const result = await run(parsed.queueFile, parsed.vaultRoot, parsed.expectedCaptureId, dependencies);
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
