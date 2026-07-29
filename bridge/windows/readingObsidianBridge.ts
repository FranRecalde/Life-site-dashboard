import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

const CAPTURE_ID_PATTERN = /^reading_[0-9a-f]{32}$/;
const OWNER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const LEASE_ID_PATTERN = /^[\x20-\x7e]{1,200}$/;
const MAX_NOTE_BYTES = 10 * 1024 * 1024;
const MAX_MARKDOWN_BYTES = 128 * 1024;
const MAX_RESPONSE_BYTES = 512 * 1024;

export interface BridgeClaim {
  captureId: string;
  destinationNotePath: string;
  markdown: string;
  leaseId: string;
  leaseExpiresAt: string;
}

export interface ReadingBridgeClient {
  claim(ownerId: string): Promise<BridgeClaim | null>;
  recoverExpired(ownerId: string): Promise<number>;
  confirm(captureId: string, leaseId: string): Promise<void>;
  reportFailure(
    captureId: string,
    leaseId: string,
    errorCode: BridgeFailureCode,
  ): Promise<void>;
}

export type BridgeFailureCode =
  | 'APPEND_FAILED'
  | 'DESTINATION_NOT_FOUND'
  | 'DESTINATION_TOO_LARGE'
  | 'PARTIAL_CAPTURE_BLOCK'
  | 'UNSAFE_DESTINATION';

export type BridgeCycleResult =
  | { outcome: 'idle' }
  | {
      outcome: 'delivered';
      captureId: string;
      appendOutcome: 'appended' | 'already_present';
    }
  | {
      outcome: 'needs_attention';
      captureId: string;
      errorCode: BridgeFailureCode;
    };

export class BridgeProtocolError extends Error {
  constructor(
    readonly code:
      | 'INVALID_CONFIGURATION'
      | 'INVALID_RESPONSE'
      | 'REQUEST_FAILED'
      | 'UNEXPECTED_CAPTURE',
  ) {
    super(code);
    this.name = 'BridgeProtocolError';
  }
}

export class BridgeLocalError extends Error {
  constructor(readonly code: BridgeFailureCode) {
    super(code);
    this.name = 'BridgeLocalError';
  }
}

type FetchLike = typeof fetch;

function validateBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BridgeProtocolError('INVALID_CONFIGURATION');
  }
  const loopback =
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === 'localhost' ||
    parsed.hostname === '::1';
  if (
    (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new BridgeProtocolError('INVALID_CONFIGURATION');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '');
}

function requireString(
  value: unknown,
  pattern: RegExp,
): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new BridgeProtocolError('INVALID_RESPONSE');
  }
  return value;
}

function requireClaim(value: unknown): BridgeClaim | null {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BridgeProtocolError('INVALID_RESPONSE');
  }
  const record = value as Record<string, unknown>;
  const captureId = requireString(record.captureId, CAPTURE_ID_PATTERN);
  const marker = `<!-- life-site-reading-capture:${captureId} -->`;
  if (
    typeof record.destinationNotePath !== 'string' ||
    typeof record.markdown !== 'string' ||
    !record.markdown.startsWith(marker) ||
    typeof record.leaseExpiresAt !== 'string' ||
    !Number.isFinite(Date.parse(record.leaseExpiresAt))
  ) {
    throw new BridgeProtocolError('INVALID_RESPONSE');
  }
  return {
    captureId,
    destinationNotePath: record.destinationNotePath,
    markdown: record.markdown,
    leaseId: requireString(record.leaseId, LEASE_ID_PATTERN),
    leaseExpiresAt: record.leaseExpiresAt,
  };
}

async function readBoundedResponse(response: Response): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    (
      !/^\d+$/.test(contentLength) ||
      Number(contentLength) > MAX_RESPONSE_BYTES
    )
  ) {
    throw new BridgeProtocolError('INVALID_RESPONSE');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = Buffer.from(result.value);
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new BridgeProtocolError('INVALID_RESPONSE');
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof BridgeProtocolError) throw error;
    throw new BridgeProtocolError('REQUEST_FAILED');
  }
  return Buffer.concat(chunks, totalBytes).toString('utf8');
}

export class HttpReadingBridgeClient implements ReadingBridgeClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.baseUrl = validateBaseUrl(baseUrl);
    if (!token || /\s/.test(token)) {
      throw new BridgeProtocolError('INVALID_CONFIGURATION');
    }
  }

  private async post(pathname: string, body: Record<string, string>): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.baseUrl}/api/bridge/reading-captures${pathname}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          cache: 'no-store',
        },
      );
    } catch {
      throw new BridgeProtocolError('REQUEST_FAILED');
    }

    const raw = await readBoundedResponse(response);

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new BridgeProtocolError('INVALID_RESPONSE');
    }
    if (!response.ok) {
      throw new BridgeProtocolError('REQUEST_FAILED');
    }
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      (payload as Record<string, unknown>).success !== true
    ) {
      throw new BridgeProtocolError('INVALID_RESPONSE');
    }
    return (payload as Record<string, unknown>).data;
  }

  async claim(ownerId: string): Promise<BridgeClaim | null> {
    return requireClaim(await this.post('/claim', { ownerId }));
  }

  async recoverExpired(ownerId: string): Promise<number> {
    const value = await this.post('/recover-expired', { ownerId });
    if (
      typeof value !== 'object' ||
      value === null ||
      !Number.isSafeInteger((value as Record<string, unknown>).recoveredCount) ||
      Number((value as Record<string, unknown>).recoveredCount) < 0
    ) {
      throw new BridgeProtocolError('INVALID_RESPONSE');
    }
    return Number((value as Record<string, unknown>).recoveredCount);
  }

  async confirm(captureId: string, leaseId: string): Promise<void> {
    await this.post(`/${encodeURIComponent(captureId)}/confirm`, { leaseId });
  }

  async reportFailure(
    captureId: string,
    leaseId: string,
    errorCode: BridgeFailureCode,
  ): Promise<void> {
    await this.post(`/${encodeURIComponent(captureId)}/failure`, {
      leaseId,
      errorCode,
    });
  }
}

function validateOwnerId(ownerId: string): string {
  const normalized = ownerId.trim();
  if (!OWNER_ID_PATTERN.test(normalized)) {
    throw new BridgeProtocolError('INVALID_CONFIGURATION');
  }
  return normalized;
}

function validateDestinationPath(value: string): string[] {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value.startsWith('//') ||
    /^[A-Za-z]:/.test(value) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new BridgeLocalError('UNSAFE_DESTINATION');
  }
  const segments = value.split('/');
  if (
    segments[0] !== 'Literature notes' ||
    segments.length < 2 ||
    !segments[segments.length - 1].endsWith('.md') ||
    segments.some((segment) => (
      !segment ||
      segment === '.' ||
      segment === '..' ||
      /[<>:"|?*]/.test(segment) ||
      /[. ]$/.test(segment)
    ))
  ) {
    throw new BridgeLocalError('UNSAFE_DESTINATION');
  }
  return segments;
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function readOpenFile(
  handle: fs.FileHandle,
  size: number,
): Promise<string> {
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const result = await handle.read(buffer, offset, size - offset, offset);
    if (result.bytesRead === 0) break;
    offset += result.bytesRead;
  }
  return buffer.subarray(0, offset).toString('utf8');
}

function normalizeLocalError(error: unknown): BridgeLocalError {
  if (error instanceof BridgeLocalError) return error;
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return new BridgeLocalError('DESTINATION_NOT_FOUND');
  }
  return new BridgeLocalError('APPEND_FAILED');
}

export async function appendCaptureToExistingNote(
  vaultRoot: string,
  claim: BridgeClaim,
): Promise<'appended' | 'already_present'> {
  try {
    if (!CAPTURE_ID_PATTERN.test(claim.captureId)) {
      throw new BridgeLocalError('UNSAFE_DESTINATION');
    }
    const marker = `<!-- life-site-reading-capture:${claim.captureId} -->`;
    if (!claim.markdown.startsWith(marker)) {
      throw new BridgeLocalError('PARTIAL_CAPTURE_BLOCK');
    }
    if (Buffer.byteLength(claim.markdown, 'utf8') > MAX_MARKDOWN_BYTES) {
      throw new BridgeLocalError('APPEND_FAILED');
    }
    const segments = validateDestinationPath(claim.destinationNotePath);
    const canonicalRoot = await fs.realpath(vaultRoot);
    const requestedPath = path.resolve(canonicalRoot, ...segments);
    if (!isWithinRoot(canonicalRoot, requestedPath)) {
      throw new BridgeLocalError('UNSAFE_DESTINATION');
    }
    const canonicalTarget = await fs.realpath(requestedPath);
    if (!isWithinRoot(canonicalRoot, canonicalTarget)) {
      throw new BridgeLocalError('UNSAFE_DESTINATION');
    }

    const handle = await fs.open(canonicalTarget, 'a+');
    try {
      const initialStat = await handle.stat();
      if (!initialStat.isFile()) {
        throw new BridgeLocalError('UNSAFE_DESTINATION');
      }
      if (initialStat.size > MAX_NOTE_BYTES) {
        throw new BridgeLocalError('DESTINATION_TOO_LARGE');
      }
      const existing = await readOpenFile(handle, initialStat.size);
      if (existing.includes(claim.markdown)) return 'already_present';
      if (existing.includes(marker)) {
        throw new BridgeLocalError('PARTIAL_CAPTURE_BLOCK');
      }

      const separator = existing.length === 0
        ? ''
        : existing.endsWith('\n\n')
          ? ''
          : existing.endsWith('\n')
            ? '\n'
            : '\n\n';
      await handle.appendFile(`${separator}${claim.markdown}\n`, 'utf8');
      await handle.sync();

      const finalStat = await handle.stat();
      if (finalStat.size > MAX_NOTE_BYTES + Buffer.byteLength(claim.markdown, 'utf8') + 2) {
        throw new BridgeLocalError('APPEND_FAILED');
      }
      const verified = await readOpenFile(handle, finalStat.size);
      if (!verified.includes(claim.markdown)) {
        throw new BridgeLocalError('APPEND_FAILED');
      }
      return 'appended';
    } finally {
      await handle.close();
    }
  } catch (error) {
    throw normalizeLocalError(error);
  }
}

export class ReadingObsidianBridge {
  private readonly ownerId: string;

  constructor(
    private readonly client: ReadingBridgeClient,
    private readonly vaultRoot: string,
    ownerId: string,
  ) {
    this.ownerId = validateOwnerId(ownerId);
  }

  async runOnce(options: {
    expectedCaptureId?: string;
  } = {}): Promise<BridgeCycleResult> {
    if (
      options.expectedCaptureId !== undefined &&
      !CAPTURE_ID_PATTERN.test(options.expectedCaptureId)
    ) {
      throw new BridgeProtocolError('INVALID_CONFIGURATION');
    }
    const claim = await this.client.claim(this.ownerId);
    if (!claim) return { outcome: 'idle' };
    if (
      options.expectedCaptureId !== undefined &&
      claim.captureId !== options.expectedCaptureId
    ) {
      throw new BridgeProtocolError('UNEXPECTED_CAPTURE');
    }

    let appendOutcome: 'appended' | 'already_present';
    try {
      appendOutcome = await appendCaptureToExistingNote(this.vaultRoot, claim);
    } catch (error) {
      const localError = normalizeLocalError(error);
      await this.client.reportFailure(
        claim.captureId,
        claim.leaseId,
        localError.code,
      );
      return {
        outcome: 'needs_attention',
        captureId: claim.captureId,
        errorCode: localError.code,
      };
    }

    await this.client.confirm(claim.captureId, claim.leaseId);
    return {
      outcome: 'delivered',
      captureId: claim.captureId,
      appendOutcome,
    };
  }

  async recoverExpired(): Promise<number> {
    return this.client.recoverExpired(this.ownerId);
  }

  async run(options: {
    signal: AbortSignal;
    idleDelayMs?: number;
    errorDelayMs?: number;
    random?: () => number;
  }): Promise<void> {
    const idleDelayMs = options.idleDelayMs ?? 5_000;
    const errorDelayMs = options.errorDelayMs ?? 30_000;
    const random = options.random ?? Math.random;
    if (
      !Number.isSafeInteger(idleDelayMs) ||
      idleDelayMs < 1_000 ||
      !Number.isSafeInteger(errorDelayMs) ||
      errorDelayMs < 1_000
    ) {
      throw new BridgeProtocolError('INVALID_CONFIGURATION');
    }

    while (!options.signal.aborted) {
      let delayMs = idleDelayMs;
      try {
        const result = await this.runOnce();
        delayMs = result.outcome === 'idle' ? idleDelayMs : 1_000;
      } catch {
        delayMs = errorDelayMs;
      }
      const jitteredDelayMs = Math.max(
        1_000,
        Math.round(delayMs * (0.8 + Math.min(1, Math.max(0, random())) * 0.4)),
      );
      await waitForDelay(jitteredDelayMs, options.signal);
    }
  }
}

async function waitForDelay(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      finish();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withSingleInstanceLock<T>(
  lockIdentity: string,
  operation: () => Promise<T>,
): Promise<T> {
  const resolvedIdentity = path.resolve(lockIdentity);
  const identityHash = crypto
    .createHash('sha256')
    .update(
      process.platform === 'win32'
        ? resolvedIdentity.toLowerCase()
        : resolvedIdentity,
      'utf8',
    )
    .digest('hex');
  const endpoint = process.platform === 'win32'
    ? `\\\\.\\pipe\\life-site-reading-bridge-${identityHash}`
    : {
        host: '127.0.0.1',
        port: 49_152 + Number.parseInt(identityHash.slice(0, 4), 16) % 16_384,
        exclusive: true,
      };
  const lockServer = net.createServer((socket) => socket.destroy());

  await new Promise<void>((resolve, reject) => {
    const onError = () => {
      reject(new BridgeProtocolError('INVALID_CONFIGURATION'));
    };
    lockServer.once('error', onError);
    lockServer.listen(endpoint, () => {
      lockServer.off('error', onError);
      lockServer.on('error', () => undefined);
      resolve();
    });
  });

  try {
    return await operation();
  } finally {
    await new Promise<void>((resolve) => {
      lockServer.close(() => resolve());
    });
  }
}
