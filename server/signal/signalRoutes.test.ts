import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { AddressInfo } from 'node:net';
import { LocalSignalStore } from '../storage/signalStore';
import { createSignalActionRouter, createSignalBrowserRouter } from './signalRoutes';
import { SignalService } from './signalService';

test('Signal browser capture requires the bearer credential and stores a minimal receipt', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-signal-'));
  const store = new LocalSignalStore(path.join(directory, 'signal.json'));
  const service = new SignalService(store, async () => ({ items: [] }), async () => ({}));
  const token = crypto.randomBytes(24).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const app = express(); app.use('/api/actions/signal-captures', createSignalActionRouter(service, () => hash));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/actions/signal-captures`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawText: 'A valid capture.' }) });
    assert.equal(unauthenticated.status, 401);
    const malformed = await fetch(`${baseUrl}/api/actions/signal-captures`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ rawText: '', unsafe: true }) });
    assert.equal(malformed.status, 400);
    const received = await fetch(`${baseUrl}/api/actions/signal-captures`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ rawText: 'A valid capture.', sourceUrl: 'https://example.test', sourceType: 'selection' }) });
    assert.equal(received.status, 201);
    const body = await received.json() as { data: Record<string, unknown> };
    assert.deepEqual(Object.keys(body.data).sort(), ['captureId', 'processingStatus', 'receivedAt']);
    assert.equal((await store.getCapture(String(body.data.captureId)))?.rawText, 'A valid capture.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Signal browser failures log sanitised error details and preserve the client response', async () => {
  const error = new Error('Firestore query failed: Bearer token-secret rawText: "private captured text"');
  const service = { listReviewQueue: async () => { throw error; } } as unknown as SignalService;
  const app = express(); app.use('/api/signal', createSignalBrowserRouter(service));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const originalError = console.error; const logs: unknown[][] = [];
  console.error = (...values: unknown[]) => { logs.push(values); };
  try {
    const response = await fetch(`${baseUrl}/api/signal/items?limit=5`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { success: false, code: 'signal_unavailable', error: 'Signal is temporarily unavailable.' });
    const output = JSON.stringify(logs);
    assert.match(output, /Firestore query failed/);
    assert.doesNotMatch(output, /token-secret|private captured text/);
    assert.match(output, /\[REDACTED_(?:SECRET|CAPTURE)\]/);
  } finally {
    console.error = originalError;
    await new Promise<void>((resolve, reject) => server.close((closeError) => closeError ? reject(closeError) : resolve()));
  }
});
