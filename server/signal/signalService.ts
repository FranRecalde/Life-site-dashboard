import crypto from 'crypto';
import {
  CreateSignalCaptureInput, SIGNAL_KINDS, SIGNAL_ROLES, SignalCapture, SignalCaptureSummary, SignalItem, SignalReviewQueueEntry,
  SignalItemType, SignalRole, SignalKind, UpdateSignalItemInput,
} from '../../src/types';
import { SignalStore } from '../storage/signalStore';

const roles = new Set<string>(SIGNAL_ROLES);
const kinds = new Set<string>(SIGNAL_KINDS);
const types = new Set<SignalItemType>(['task', 'event', 'information', 'link']);
const destinationFor = (type: SignalItemType): SignalItem['destination'] => type === 'task' ? 'todoist' : type === 'event' ? 'google_calendar' : 'obsidian';
const optionalText = (value: unknown, max = 2000): string | undefined => typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : undefined;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const captureSummary = ({ rawText: _rawText, modelResponse: _modelResponse, ...capture }: SignalCapture): SignalCaptureSummary => capture;

export class SignalError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

export interface SignalCandidate {
  type: SignalItemType; title: string; summary?: string; role?: SignalRole; project?: string; kind?: SignalKind;
  relevance?: string; dueDate?: string; eventStart?: string; eventEnd?: string; allDay?: boolean; url?: string;
  destinationFile?: string; suggestedLabel?: string; suggestedTag?: string; confidence?: number; sourceExcerpt: string;
}

export interface SignalInterpretation { items: unknown[]; modelResponse?: string; }
export type SignalInterpreter = (capture: SignalCapture) => Promise<SignalInterpretation>;
export type SignalDispatcher = (item: SignalItem, capture: SignalCapture) => Promise<{ destinationId?: string }>;

class SignalModelOutputError extends SignalError {
  constructor(code: string, message: string, readonly modelResponse: string) { super(code, message, 502); }
}

export function redactSignalModelResponse(value: string): string {
  return value
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_SECRET]')
    .replace(/(["']?[A-Za-z0-9_-]*(?:api[_-]?key|token|secret|password)[A-Za-z0-9_-]*["']?\s*[:=]\s*)["']?[^\s,"'}]+["']?/gi, '$1"[REDACTED_SECRET]"')
    .replace(/\bBearer\s+[^\s,"'}]+/gi, 'Bearer [REDACTED_SECRET]');
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SignalError('invalid_body', 'Request body must be an object.');
  return value as Record<string, unknown>;
}

export function validateSignalCapture(value: unknown): CreateSignalCaptureInput {
  const body = record(value);
  const allowed = new Set(['rawText', 'sourceUrl', 'sourceTitle', 'sourceType', 'capturedAt']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw new SignalError('unexpected_field', 'Capture contains an unsupported field.');
  if (typeof body.rawText !== 'string' || !body.rawText.trim() || body.rawText.length > 50_000) throw new SignalError('invalid_raw_text', 'rawText is required and must be at most 50000 characters.');
  if (body.sourceUrl !== undefined && (typeof body.sourceUrl !== 'string' || body.sourceUrl.length > 4_000)) throw new SignalError('invalid_source_url', 'sourceUrl is invalid.');
  if (body.sourceTitle !== undefined && (typeof body.sourceTitle !== 'string' || body.sourceTitle.length > 500)) throw new SignalError('invalid_source_title', 'sourceTitle is invalid.');
  if (body.sourceType !== undefined && body.sourceType !== 'selection' && body.sourceType !== 'paste') throw new SignalError('invalid_source_type', 'sourceType must be selection or paste.');
  if (body.capturedAt !== undefined && (typeof body.capturedAt !== 'string' || !Number.isFinite(Date.parse(body.capturedAt)))) throw new SignalError('invalid_captured_at', 'capturedAt must be an ISO timestamp.');
  return { rawText: body.rawText, sourceUrl: optionalText(body.sourceUrl, 4000), sourceTitle: optionalText(body.sourceTitle, 500), sourceType: body.sourceType as CreateSignalCaptureInput['sourceType'], capturedAt: body.capturedAt as string | undefined };
}

export function validateSignalItemUpdate(value: unknown): UpdateSignalItemInput {
  const body = record(value);
  const allowed = new Set(['type', 'title', 'summary', 'role', 'project', 'kind', 'relevance', 'dueDate', 'eventStart', 'eventEnd', 'allDay', 'url', 'destinationFile', 'suggestedLabel', 'suggestedTag', 'confidence']);
  if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) throw new SignalError('invalid_update', 'Update contains an unsupported field.');
  if (body.type !== undefined && (typeof body.type !== 'string' || !types.has(body.type as SignalItemType))) throw new SignalError('invalid_type', 'Item type is invalid.');
  if (body.title !== undefined && !optionalText(body.title, 300)) throw new SignalError('invalid_title', 'title must be non-empty and at most 300 characters.');
  if (body.role !== undefined && body.role !== null && (typeof body.role !== 'string' || !roles.has(body.role))) throw new SignalError('invalid_role', 'role is invalid.');
  if (body.kind !== undefined && body.kind !== null && (typeof body.kind !== 'string' || !kinds.has(body.kind))) throw new SignalError('invalid_kind', 'kind is invalid.');
  for (const field of ['dueDate', 'eventStart', 'eventEnd'] as const) if (body[field] !== undefined && body[field] !== null && (typeof body[field] !== 'string' || !datePattern.test(body[field]))) throw new SignalError('invalid_date', `${field} must be YYYY-MM-DD.`);
  if (body.allDay !== undefined && typeof body.allDay !== 'boolean') throw new SignalError('invalid_all_day', 'allDay must be boolean.');
  if (body.confidence !== undefined && (typeof body.confidence !== 'number' || body.confidence < 0 || body.confidence > 1)) throw new SignalError('invalid_confidence', 'confidence must be between 0 and 1.');
  const clean: UpdateSignalItemInput = {};
  for (const field of ['summary', 'project', 'relevance', 'url', 'destinationFile', 'suggestedLabel', 'suggestedTag'] as const) if (body[field] !== undefined) clean[field] = body[field] === null ? undefined : optionalText(body[field]);
  if (body.type !== undefined) clean.type = body.type as SignalItemType;
  if (body.title !== undefined) clean.title = body.title as string;
  if (body.role !== undefined) clean.role = body.role as SignalRole | undefined;
  if (body.kind !== undefined) clean.kind = body.kind as SignalKind | undefined;
  for (const field of ['dueDate', 'eventStart', 'eventEnd'] as const) if (body[field] !== undefined) clean[field] = body[field] as string | undefined;
  if (body.allDay !== undefined) clean.allDay = body.allDay as boolean;
  if (body.confidence !== undefined) clean.confidence = body.confidence as number;
  return clean;
}

function candidateFromModel(value: unknown, source: string): SignalCandidate {
  const item = record(value);
  if (typeof item.type !== 'string' || !types.has(item.type as SignalItemType)) throw new SignalError('invalid_model_output', 'Model returned an invalid type.', 502);
  const title = optionalText(item.title, 300); if (!title) throw new SignalError('invalid_model_output', 'Model returned an empty title.', 502);
  const role = item.role === null || item.role === undefined ? undefined : roles.has(String(item.role)) ? item.role as SignalRole : undefined;
  const kind = item.kind === null || item.kind === undefined ? undefined : kinds.has(String(item.kind)) ? item.kind as SignalKind : undefined;
  const supportedDate = (field: 'dueDate' | 'eventStart' | 'eventEnd'): string | undefined => {
    const value = item[field];
    return typeof value === 'string' && datePattern.test(value) && source.includes(value) ? value : undefined;
  };
  const excerpt = optionalText(item.sourceExcerpt, 500) ?? source.slice(0, 500);
  const dueDate = supportedDate('dueDate');
  return { type: item.type as SignalItemType, title, summary: optionalText(item.summary, 2000), role, kind, project: optionalText(item.project, 300), relevance: optionalText(item.relevance, 500), dueDate: item.type === 'event' ? undefined : dueDate, eventStart: supportedDate('eventStart') ?? (item.type === 'event' ? dueDate : undefined), eventEnd: supportedDate('eventEnd'), allDay: item.type === 'event' ? true : item.allDay === true, url: optionalText(item.url, 4000), destinationFile: optionalText(item.destinationFile, 500), suggestedLabel: optionalText(item.suggestedLabel, 100), suggestedTag: optionalText(item.suggestedTag, 100), confidence: typeof item.confidence === 'number' && item.confidence >= 0 && item.confidence <= 1 ? item.confidence : undefined, sourceExcerpt: excerpt };
}

export function createOpenAIInterpreter(apiKey: () => string): SignalInterpreter {
  return async (capture) => {
    const key = apiKey();
    if (!key) throw new SignalError('model_unavailable', 'Signal interpretation is not configured.', 503);
    const schema = { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['type', 'title', 'summary', 'role', 'project', 'kind', 'relevance', 'dueDate', 'eventStart', 'eventEnd', 'allDay', 'url', 'destinationFile', 'suggestedLabel', 'suggestedTag', 'confidence', 'sourceExcerpt'], properties: { type: { type: 'string', enum: ['task', 'event', 'information', 'link'] }, title: { type: 'string' }, summary: { type: ['string', 'null'] }, role: { type: ['string', 'null'], enum: [...SIGNAL_ROLES, null] }, project: { type: ['string', 'null'] }, kind: { type: ['string', 'null'], enum: [...SIGNAL_KINDS, null] }, relevance: { type: ['string', 'null'] }, dueDate: { type: ['string', 'null'] }, eventStart: { type: ['string', 'null'] }, eventEnd: { type: ['string', 'null'] }, allDay: { type: 'boolean' }, url: { type: ['string', 'null'] }, destinationFile: { type: ['string', 'null'] }, suggestedLabel: { type: ['string', 'null'] }, suggestedTag: { type: ['string', 'null'] }, confidence: { type: ['number', 'null'] }, sourceExcerpt: { type: 'string' } } } } } };
    const prompt = `Extract zero or more useful Signal items from deliberately captured source text. Never invent actions, dates, people, projects, facts, deadlines, or times. Roles must be from the provided list or null. Kinds must be from the provided list or null. A date field may be non-null ONLY when the exact YYYY-MM-DD text appears verbatim in the source; otherwise use null. For events, place an exact source date in eventStart, not dueDate. Preserve ambiguity with null fields. Source:\n${capture.rawText}`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5.4-nano', messages: [{ role: 'system', content: 'Return only the requested JSON schema.' }, { role: 'user', content: prompt }], response_format: { type: 'json_schema', json_schema: { name: 'signal_items', strict: true, schema } } }) });
    if (!response.ok) throw new SignalError('model_failed', 'Signal interpretation failed.', 502);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new SignalError('invalid_model_output', 'Signal interpretation returned no structured output.', 502);
    let parsed: { items?: unknown[] };
    try { parsed = JSON.parse(content) as { items?: unknown[] }; } catch { throw new SignalModelOutputError('invalid_model_output', 'Signal interpretation returned invalid JSON.', content); }
    if (!Array.isArray(parsed.items)) throw new SignalModelOutputError('invalid_model_output', 'Signal interpretation returned an invalid item list.', content);
    return { items: parsed.items, modelResponse: content };
  };
}

export class SignalService {
  constructor(private readonly store: SignalStore, private readonly interpret: SignalInterpreter, private readonly dispatch: SignalDispatcher, private readonly now = () => new Date().toISOString()) {}
  async createCapture(value: unknown): Promise<SignalCapture> {
    const input = validateSignalCapture(value); const now = this.now();
    const capture: SignalCapture = { id: `signal_${crypto.randomBytes(16).toString('hex')}`, rawText: input.rawText, sourceUrl: input.sourceUrl, sourceTitle: input.sourceTitle, sourceType: input.sourceType ?? 'paste', capturedAt: input.capturedAt ?? now, processingStatus: 'received', createdAt: now, updatedAt: now };
    await this.store.createCapture(capture); return capture;
  }
  async processCapture(id: string): Promise<void> {
    const capture = await this.requireCapture(id); if (capture.processingStatus === 'processing') return;
    await this.store.updateCapture({ ...capture, processingStatus: 'processing', processingError: undefined, updatedAt: this.now() });
    try {
      const current = await this.requireCapture(id); const interpretation = await this.interpret(current); const diagnosed = { ...current, modelResponse: interpretation.modelResponse ? redactSignalModelResponse(interpretation.modelResponse) : undefined, updatedAt: this.now() };
      await this.store.updateCapture(diagnosed);
      const candidates = interpretation.items.map((item) => candidateFromModel(item, current.rawText)); const now = this.now();
      const items: SignalItem[] = candidates.map((candidate) => ({ id: `signal_item_${crypto.randomBytes(16).toString('hex')}`, captureId: id, ...candidate, destination: destinationFor(candidate.type), reviewStatus: 'pending', dispatchStatus: 'not_started', createdAt: now, updatedAt: now }));
      if (items.length) await this.store.createItems(items);
      await this.store.updateCapture({ ...diagnosed, processingStatus: items.length ? 'complete' : 'no_items', processingError: undefined, updatedAt: this.now() });
    } catch (error) {
      const current = await this.store.getCapture(id); if (current) await this.store.updateCapture({ ...current, modelResponse: error instanceof SignalModelOutputError ? redactSignalModelResponse(error.modelResponse) : current.modelResponse, processingStatus: 'failed', processingError: error instanceof SignalError ? error.code : 'processing_failed', updatedAt: this.now() });
      console.error('Signal processing failed safely.', error instanceof SignalError ? error.code : 'unknown');
    }
  }
  async listPending(limit = 100): Promise<SignalItem[]> { return this.store.listPendingItems(Math.min(Math.max(limit, 1), 100)); }
  async listReviewQueue(limit = 100): Promise<SignalReviewQueueEntry[]> {
    const bounded = Math.min(Math.max(limit, 1), 100);
    const [items, captures] = await Promise.all([this.store.listPendingItems(bounded), this.store.listReviewCaptures(bounded)]);
    return [
      ...items.map((item) => ({ entryType: 'item' as const, createdAt: item.createdAt, item })),
      ...captures.map((capture) => ({ entryType: 'capture' as const, createdAt: capture.createdAt, capture: captureSummary(capture) })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, bounded);
  }
  async getCapture(id: string): Promise<SignalCapture> { return this.requireCapture(id); }
  async updateItem(id: string, value: unknown): Promise<SignalItem> { const current = await this.requireItem(id); if (current.reviewStatus === 'discarded' || current.dispatchStatus === 'succeeded') throw new SignalError('item_locked', 'This item can no longer be edited.', 409); const changes = validateSignalItemUpdate(value); const type = changes.type ?? current.type; const item = { ...current, ...changes, type, destination: destinationFor(type), updatedAt: this.now() }; await this.store.updateItem(item); return item; }
  async discardItem(id: string): Promise<SignalItem> { const current = await this.requireItem(id); if (current.dispatchStatus === 'succeeded') throw new SignalError('item_dispatched', 'Dispatched items cannot be binned.', 409); const item = { ...current, reviewStatus: 'discarded' as const, updatedAt: this.now() }; await this.store.updateItem(item); return item; }
  async approveItem(id: string): Promise<SignalItem> { const current = await this.requireItem(id); if (current.reviewStatus === 'discarded') throw new SignalError('item_discarded', 'Discarded items cannot be dispatched.', 409); if (current.dispatchStatus === 'succeeded') return current; if (current.dispatchStatus === 'dispatching') throw new SignalError('dispatch_in_progress', 'This item is already dispatching.', 409); const dispatching = { ...current, reviewStatus: 'approved' as const, dispatchStatus: 'dispatching' as const, approvedAt: current.approvedAt ?? this.now(), dispatchError: undefined, updatedAt: this.now() }; await this.store.updateItem(dispatching); try { const result = await this.dispatch(dispatching, await this.requireCapture(dispatching.captureId)); const done = { ...dispatching, dispatchStatus: 'succeeded' as const, destinationId: result.destinationId, updatedAt: this.now() }; await this.store.updateItem(done); return done; } catch (error) { const failed = { ...dispatching, dispatchStatus: 'failed' as const, dispatchError: 'dispatch_failed', updatedAt: this.now() }; await this.store.updateItem(failed); console.error('Signal dispatch failed safely.', dispatching.type); return failed; } }
  private async requireCapture(id: string): Promise<SignalCapture> { const value = await this.store.getCapture(id); if (!value) throw new SignalError('capture_not_found', 'Signal capture not found.', 404); return value; }
  private async requireItem(id: string): Promise<SignalItem> { const value = await this.store.getItem(id); if (!value) throw new SignalError('item_not_found', 'Signal item not found.', 404); return value; }
}
