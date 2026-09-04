import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { GenericDelivery, ReadingCapture, ReadingQueueEntry } from '../../src/types';
import { formatReadingCaptureMarkdown } from '../../server/reading/readingFormatter';
import { ReadingService } from '../../server/reading/readingService';
import {
  createReadingDeliveryMarker,
  deleteReadingDeliveryMarker,
  hasReadingDeliveryMarker,
  listReadingDeliveryMarkerIds,
} from '../../server/storage/readingDeliveryMarkers';

const CAPTURE_ID_PATTERN = /^reading_[0-9a-f]{32}$/;
const MAX_NOTE_BYTES = 10 * 1024 * 1024;
const MAX_MARKDOWN_BYTES = 128 * 1024;
const MAX_DEDUPLICATION_ENTRIES = 100;

export type BridgeFailureCode =
  | 'APPEND_FAILED'
  | 'DESTINATION_NOT_FOUND'
  | 'DESTINATION_LOCKED'
  | 'DESTINATION_CONFLICTED'
  | 'DESTINATION_TOO_LARGE'
  | 'PARTIAL_CAPTURE_BLOCK'
  | 'UNSAFE_DESTINATION'
  | 'UNRECOGNISED_DELIVERY_KIND';

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

export type BridgeDrainResult =
  | {
      outcome: 'idle' | 'delivered';
      deliveredCaptureIds: string[];
    }
  | {
      outcome: 'needs_attention';
      deliveredCaptureIds: string[];
      captureId: string;
      errorCode: BridgeFailureCode;
    };

export class BridgeProtocolError extends Error {
  constructor(readonly code: 'INVALID_CONFIGURATION' | 'UNEXPECTED_CAPTURE') {
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

const GENERIC_DESTINATION_ROOTS = [
  ['Academic Year 2026', 'School Notes'],
  ['Fleeting Notes'],
] as const;

function validateGenericDestinationPath(value: string): string[] {
  if (
    typeof value !== 'string' || !value || value !== value.trim() ||
    value.includes('\\') || value.startsWith('/') || value.startsWith('//') ||
    /^[A-Za-z]:/.test(value) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ||
    value.includes('..') || /[\u0000-\u001f\u007f]/.test(value)
  ) throw new BridgeLocalError('UNSAFE_DESTINATION');
  const segments = value.split('/');
  if (
    !segments.at(-1)?.endsWith('.md') ||
    segments.some((segment) => !segment || /[<>:"|?*]/.test(segment) || /[. ]$/.test(segment)) ||
    !GENERIC_DESTINATION_ROOTS.some((root) => root.every((segment, index) => segments[index] === segment) && segments.length > root.length)
  ) throw new BridgeLocalError('UNSAFE_DESTINATION');
  return segments;
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isWithinOrEqualRoot(root: string, candidate: string): boolean {
  return root === candidate || isWithinRoot(root, candidate);
}

async function readOpenFile(handle: fs.FileHandle, size: number): Promise<string> {
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const result = await handle.read(buffer, offset, size - offset, offset);
    if (result.bytesRead === 0) break;
    offset += result.bytesRead;
  }
  return buffer.subarray(0, offset).toString('utf8');
}

function normalizeForHash(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

function hashEntry(value: string): string {
  return crypto.createHash('sha256').update(normalizeForHash(value), 'utf8').digest('hex');
}

function formatNewBookNote(bookTitle: string): string {
  const headingTitle = bookTitle.replace(/^#+\s*/, '').replace(/[\[\]]/g, '');
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('');
  return `\n${timestamp}\n# ${headingTitle}\n##### Type: Book\n##### Status: In progress\n`;
}

async function resolveOrCreateDestinationNote(
  canonicalRoot: string,
  requestedPath: string,
  bookTitle: string,
): Promise<string> {
  try {
    return await fs.realpath(requestedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const canonicalParent = await fs.realpath(path.dirname(requestedPath));
  if (!isWithinRoot(canonicalRoot, canonicalParent)) {
    throw new BridgeLocalError('UNSAFE_DESTINATION');
  }
  const newNotePath = path.join(canonicalParent, path.basename(requestedPath));
  const handle = await fs.open(newNotePath, 'wx');
  try {
    await handle.writeFile(formatNewBookNote(bookTitle), 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  return fs.realpath(newNotePath);
}

function captureMarkers(captureId: string): { open: string; close: string } {
  return {
    open: `<!-- life-site-reading-capture:${captureId} -->`,
    close: `<!-- /life-site-reading-capture:${captureId} -->`,
  };
}

function getLastEntryHashes(note: string): string[] {
  const opener = /<!-- life-site-reading-capture:(reading_[0-9a-f]{32}) -->\r?\n## Reading capture — [^\r\n]+/g;
  const entries: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = opener.exec(note)) !== null) {
    const close = captureMarkers(match[1]).close;
    const closeIndex = note.indexOf(close, opener.lastIndex);
    if (closeIndex === -1) continue;
    const end = closeIndex + close.length;
    entries.push(note.slice(match.index, end));
    opener.lastIndex = end;
  }
  return entries.slice(-MAX_DEDUPLICATION_ENTRIES).map(hashEntry);
}

function normalizeLocalError(error: unknown): BridgeLocalError {
  if (error instanceof BridgeLocalError) return error;
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return new BridgeLocalError('DESTINATION_NOT_FOUND');
  }
  if (code === 'EACCES' || code === 'EBUSY' || code === 'EPERM') {
    return new BridgeLocalError('DESTINATION_LOCKED');
  }
  return new BridgeLocalError('APPEND_FAILED');
}

export async function appendCaptureToExistingNote(
  vaultRoot: string,
  capture: ReadingCapture,
): Promise<'appended' | 'already_present'> {
  try {
    if (!CAPTURE_ID_PATTERN.test(capture.id)) {
      throw new BridgeLocalError('UNSAFE_DESTINATION');
    }
    const markdown = formatReadingCaptureMarkdown(capture);
    const markers = captureMarkers(capture.id);
    if (
      !markdown.startsWith(`${markers.open}\n## Reading capture — ${capture.capturedAt}\n`) ||
      !markdown.endsWith(markers.close) ||
      Buffer.byteLength(markdown, 'utf8') > MAX_MARKDOWN_BYTES
    ) {
      throw new BridgeLocalError('PARTIAL_CAPTURE_BLOCK');
    }
    const segments = validateDestinationPath(capture.destinationNotePath);
    const canonicalRoot = await fs.realpath(vaultRoot);
    const requestedPath = path.resolve(canonicalRoot, ...segments);
    if (!isWithinRoot(canonicalRoot, requestedPath)) {
      throw new BridgeLocalError('UNSAFE_DESTINATION');
    }
    const canonicalTarget = await resolveOrCreateDestinationNote(
      canonicalRoot,
      requestedPath,
      capture.bookTitle,
    );
    if (!isWithinRoot(canonicalRoot, canonicalTarget)) {
      throw new BridgeLocalError('UNSAFE_DESTINATION');
    }

    const handle = await fs.open(canonicalTarget, 'a+');
    try {
      const initialStat = await handle.stat();
      if (!initialStat.isFile()) throw new BridgeLocalError('UNSAFE_DESTINATION');
      if (initialStat.size > MAX_NOTE_BYTES) {
        throw new BridgeLocalError('DESTINATION_TOO_LARGE');
      }
      const existing = await readOpenFile(handle, initialStat.size);
      if (/^(<{7}|={7}|>{7})/m.test(existing)) {
        throw new BridgeLocalError('DESTINATION_CONFLICTED');
      }
      const candidateHash = hashEntry(markdown);
      if (getLastEntryHashes(existing).includes(candidateHash)) {
        return 'already_present';
      }
      if (existing.includes(markers.open) !== existing.includes(markers.close)) {
        throw new BridgeLocalError('PARTIAL_CAPTURE_BLOCK');
      }

      const separator = existing.length === 0
        ? ''
        : existing.endsWith('\n\n')
          ? ''
          : existing.endsWith('\n')
            ? '\n'
            : '\n\n';
      const captureSeparator = getLastEntryHashes(existing).length === 0
        ? ''
        : '---\n\n';
      const appended = `${separator}${captureSeparator}${markdown}`;
      await handle.appendFile(appended, 'utf8');
      await handle.sync();

      const finalStat = await handle.stat();
      if (finalStat.size > MAX_NOTE_BYTES + Buffer.byteLength(appended, 'utf8') + 2) {
        throw new BridgeLocalError('APPEND_FAILED');
      }
      const verified = await readOpenFile(handle, finalStat.size);
      if (!getLastEntryHashes(verified).includes(candidateHash)) {
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

export async function appendGenericDeliveryToNote(
  vaultRoot: string,
  entry: GenericDelivery,
): Promise<'appended'> {
  try {
    if (!CAPTURE_ID_PATTERN.test(entry.id)) throw new BridgeLocalError('UNSAFE_DESTINATION');
    const segments = validateGenericDestinationPath(entry.destinationNotePath);
    const canonicalVault = await fs.realpath(vaultRoot);
    const allowedSegments = GENERIC_DESTINATION_ROOTS.find((root) => root.every((segment, index) => segments[index] === segment));
    if (!allowedSegments) throw new BridgeLocalError('UNSAFE_DESTINATION');
    const allowedRoot = path.resolve(canonicalVault, ...allowedSegments);
    await fs.mkdir(allowedRoot, { recursive: true });
    const canonicalAllowedRoot = await fs.realpath(allowedRoot);
    if (!isWithinRoot(canonicalVault, canonicalAllowedRoot)) throw new BridgeLocalError('UNSAFE_DESTINATION');
    const requestedPath = path.resolve(canonicalVault, ...segments);
    if (!isWithinRoot(canonicalAllowedRoot, requestedPath)) throw new BridgeLocalError('UNSAFE_DESTINATION');
    await fs.mkdir(path.dirname(requestedPath), { recursive: true });
    const canonicalParent = await fs.realpath(path.dirname(requestedPath));
    if (!isWithinOrEqualRoot(canonicalAllowedRoot, canonicalParent)) throw new BridgeLocalError('UNSAFE_DESTINATION');
    const target = path.join(canonicalParent, path.basename(requestedPath));
    try {
      const canonicalTarget = await fs.realpath(target);
      if (!isWithinRoot(canonicalAllowedRoot, canonicalTarget)) throw new BridgeLocalError('UNSAFE_DESTINATION');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const handle = await fs.open(target, 'a');
    try {
      await handle.appendFile(entry.renderedMarkdown, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    return 'appended';
  } catch (error) {
    throw normalizeLocalError(error);
  }
}

export class ReadingObsidianBridge {
  constructor(
    private readonly service: ReadingService,
    private readonly vaultRoot: string,
    private readonly markerBasePath: string,
    private readonly appendCapture: typeof appendCaptureToExistingNote = appendCaptureToExistingNote,
  ) {}

  async runOnce(options: { expectedCaptureId?: string } = {}): Promise<BridgeCycleResult> {
    if (options.expectedCaptureId !== undefined && !CAPTURE_ID_PATTERN.test(options.expectedCaptureId)) {
      throw new BridgeProtocolError('INVALID_CONFIGURATION');
    }
    const reconciliationResult = await this.reconcileDeliveryMarkers();
    if (reconciliationResult) return reconciliationResult;
    const captures = await this.service.listPendingDeliveriesForBridge();
    const capture = await this.findFirstUndeliveredCapture(captures);
    if (!capture) return { outcome: 'idle' };
    if (options.expectedCaptureId !== undefined && capture.id !== options.expectedCaptureId) {
      throw new BridgeProtocolError('UNEXPECTED_CAPTURE');
    }

    return this.deliverCapture(capture);
  }

  async drainPendingCaptures(): Promise<BridgeDrainResult> {
    const reconciliationResult = await this.reconcileDeliveryMarkers();
    if (reconciliationResult) {
      return { ...reconciliationResult, deliveredCaptureIds: [] };
    }
    const captures = await this.service.listPendingDeliveriesForBridge();
    const deliveredCaptureIds: string[] = [];
    for (const capture of captures) {
      if (await hasReadingDeliveryMarker(this.markerBasePath, capture.id)) continue;
      const result = await this.deliverCapture(capture);
      if (result.outcome === 'needs_attention') {
        return { ...result, deliveredCaptureIds };
      }
      deliveredCaptureIds.push(capture.id);
    }
    return {
      outcome: deliveredCaptureIds.length === 0 ? 'idle' : 'delivered',
      deliveredCaptureIds,
    };
  }

  private async deliverCapture(capture: ReadingQueueEntry): Promise<BridgeCycleResult> {
    let appendOutcome: 'appended' | 'already_present';
    try {
      appendOutcome = capture.deliveryKind === 'generic'
        ? await appendGenericDeliveryToNote(this.vaultRoot, capture)
        : capture.deliveryKind === 'reading'
          ? await this.appendCapture(this.vaultRoot, capture)
          : (() => { throw new BridgeLocalError('UNRECOGNISED_DELIVERY_KIND'); })();
    } catch (error) {
      const localError = normalizeLocalError(error);
      return { outcome: 'needs_attention', captureId: capture.id, errorCode: localError.code };
    }

    try {
      await createReadingDeliveryMarker(this.markerBasePath, capture.id);
    } catch {
      return { outcome: 'needs_attention', captureId: capture.id, errorCode: 'APPEND_FAILED' };
    }
    try {
      await this.confirmMarkedCapture(capture.id);
      deleteReadingDeliveryMarker(this.markerBasePath, capture.id);
    } catch {
      return { outcome: 'needs_attention', captureId: capture.id, errorCode: 'APPEND_FAILED' };
    }
    return { outcome: 'delivered', captureId: capture.id, appendOutcome };
  }

  private async reconcileDeliveryMarkers(): Promise<BridgeCycleResult | null> {
    for (const captureId of listReadingDeliveryMarkerIds(this.markerBasePath)) {
      try {
        await this.confirmMarkedCapture(captureId);
        deleteReadingDeliveryMarker(this.markerBasePath, captureId);
      } catch {
        return { outcome: 'needs_attention', captureId, errorCode: 'APPEND_FAILED' };
      }
    }
    return null;
  }

  private async confirmMarkedCapture(captureId: string): Promise<void> {
    const generic = await this.service.getDeliveryEntry(captureId);
    if (generic?.deliveryKind === 'generic') {
      if (generic.status === 'done') {
        await this.service.confirmDeliveryEntry(captureId);
        return;
      }
      if (generic.status === 'pending') await this.service.claimDelivery(captureId);
      await this.service.confirmDeliveryEntry(captureId);
      return;
    }
    const capture = await this.service.getCapture(captureId);
    if (!capture) throw new Error('Reading delivery marker references an unknown capture.');
    if (capture.status === 'done') {
      await this.service.confirmDelivery(captureId);
      return;
    }
    if (capture.status === 'pending') {
      await this.service.claimCapture(captureId);
    }
    await this.service.confirmDelivery(captureId);
  }

  private async findFirstUndeliveredCapture(
    captures: ReadingQueueEntry[],
  ): Promise<ReadingQueueEntry | null> {
    for (const capture of captures) {
      if (!await hasReadingDeliveryMarker(this.markerBasePath, capture.id)) return capture;
    }
    return null;
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
    if (!Number.isSafeInteger(idleDelayMs) || idleDelayMs < 1_000 || !Number.isSafeInteger(errorDelayMs) || errorDelayMs < 1_000) {
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
      const jitteredDelayMs = Math.max(1_000, Math.round(delayMs * (0.8 + Math.min(1, Math.max(0, random())) * 0.4)));
      await waitForDelay(jitteredDelayMs, options.signal);
    }
  }
}

async function waitForDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const finish = () => { signal.removeEventListener('abort', onAbort); resolve(); };
    const timer = setTimeout(finish, delayMs);
    const onAbort = () => { clearTimeout(timer); finish(); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withSingleInstanceLock<T>(lockIdentity: string, operation: () => Promise<T>): Promise<T> {
  const resolvedIdentity = path.resolve(lockIdentity);
  const identityHash = crypto.createHash('sha256').update(process.platform === 'win32' ? resolvedIdentity.toLowerCase() : resolvedIdentity, 'utf8').digest('hex');
  const endpoint = process.platform === 'win32'
    ? `\\\\.\\pipe\\life-site-reading-bridge-${identityHash}`
    : { host: '127.0.0.1', port: 49_152 + Number.parseInt(identityHash.slice(0, 4), 16) % 16_384, exclusive: true };
  const lockServer = net.createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    const onError = () => reject(new BridgeProtocolError('INVALID_CONFIGURATION'));
    lockServer.once('error', onError);
    lockServer.listen(endpoint, () => { lockServer.off('error', onError); lockServer.on('error', () => undefined); resolve(); });
  });
  try { return await operation(); } finally { await new Promise<void>((resolve) => lockServer.close(() => resolve())); }
}
