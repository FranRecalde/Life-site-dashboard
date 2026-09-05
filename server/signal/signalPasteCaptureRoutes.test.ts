import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { AddressInfo } from 'node:net';
import { LocalSignalStore } from '../storage/signalStore';
import { createSignalBrowserRouter } from './signalRoutes';
import { SignalService } from './signalService';

async function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-signal-paste-'));
  const store = new LocalSignalStore(path.join(directory, 'signal.json'));
  const service = new SignalService(store, async () => ({ items: [] }), async () => ({}));
  const app = express();
  app.use('/api/signal', (request, response, next) => {
    if (request.headers.authorization !== 'Bearer valid-session') return response.status(401).json({ success: false, error: 'Unauthenticated' });
    next();
  }, createSignalBrowserRouter(service));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return {
    store,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

test('Signal paste capture requires the existing session authentication', async () => {
  const fixture = await createFixture();
  try {
    const response = await fetch(`${fixture.baseUrl}/api/signal/captures`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawText: 'Private note' }) });
    assert.equal(response.status, 401);
    assert.equal((await fixture.store.listReviewCaptures(100)).length, 0);
  } finally { await fixture.close(); }
});

test('Signal paste capture rejects blank rawText', async () => {
  const fixture = await createFixture();
  try {
    const response = await fetch(`${fixture.baseUrl}/api/signal/captures`, { method: 'POST', headers: { Authorization: 'Bearer valid-session', 'Content-Type': 'application/json' }, body: JSON.stringify({ rawText: ' \n\t ' }) });
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code: string }).code, 'invalid_raw_text');
  } finally { await fixture.close(); }
});

test('Signal paste capture stores paste provenance through the shared capture path', async () => {
  const fixture = await createFixture();
  try {
    const response = await fetch(`${fixture.baseUrl}/api/signal/captures`, { method: 'POST', headers: { Authorization: 'Bearer valid-session', 'Content-Type': 'application/json' }, body: JSON.stringify({ rawText: 'Call the parent on Monday.', sourceUrl: 'https://example.test/message', sourceTitle: 'Message', sourceType: 'selection', capturedAt: '2026-09-05T10:00:00.000Z' }) });
    assert.equal(response.status, 201);
    const body = await response.json() as { data: { captureId: string } };
    const capture = await fixture.store.getCapture(body.data.captureId);
    assert.deepEqual(capture && { rawText: capture.rawText, sourceUrl: capture.sourceUrl, sourceTitle: capture.sourceTitle, sourceType: capture.sourceType, capturedAt: capture.capturedAt }, { rawText: 'Call the parent on Monday.', sourceUrl: 'https://example.test/message', sourceTitle: 'Message', sourceType: 'paste', capturedAt: '2026-09-05T10:00:00.000Z' });
  } finally { await fixture.close(); }
});
