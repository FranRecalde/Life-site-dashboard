import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { AddressInfo } from 'net';
import { LocalReadingStore } from '../storage/localReadingStore';
import { createReadingBrowserRouter } from './readingBrowserRoutes';
import { ReadingService } from './readingService';

async function createRouteFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-reading-routes-'));
  const store = new LocalReadingStore(path.join(directory, 'reading.json'));
  const service = new ReadingService(
    store,
    () => '2026-07-28T12:00:00.000Z',
    () => 'book_1',
  );
  const app = express();
  app.use(express.json());
  app.use('/api/reading', (request, response, next) => {
    if (request.headers.authorization !== 'Bearer valid-session') {
      response.status(401).json({ success: false, error: 'Unauthenticated' });
      return;
    }
    next();
  }, createReadingBrowserRouter(service));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return {
    store,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

test('all browser Reading Capture routes are behind the existing auth boundary', async () => {
  const fixture = await createRouteFixture();
  try {
    const response = await fetch(`${fixture.baseUrl}/api/reading/books`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Book',
        author: 'Author',
        destinationNotePath: 'Literature notes/Book — Author.md',
      }),
    });
    assert.strictEqual(response.status, 401);
    assert.strictEqual((await fixture.store.listBooks()).length, 0);
  } finally {
    await fixture.close();
  }
});

test('browser routes create books and provide create, replay, and conflict semantics', async () => {
  const fixture = await createRouteFixture();
  try {
    const authHeaders = {
      Authorization: 'Bearer valid-session',
      'Content-Type': 'application/json',
    };
    const bookResponse = await fetch(`${fixture.baseUrl}/api/reading/books`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Book',
        author: 'Author',
        destinationNotePath: 'Literature notes/Book — Author.md',
        tags: ['reading'],
        defaultSource: 'physical',
      }),
    });
    assert.strictEqual(bookResponse.status, 201);
    const bookPayload = await bookResponse.json() as any;

    const idempotencyKey = '9adc629e-c4b8-4b5b-aead-d88eb777f953';
    const captureBody = {
      bookId: bookPayload.data.id,
      originalText: 'Exact original words',
      captureType: 'thought',
    };
    const firstResponse = await fetch(`${fixture.baseUrl}/api/reading/captures`, {
      method: 'POST',
      headers: { ...authHeaders, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(captureBody),
    });
    assert.strictEqual(firstResponse.status, 201);
    const firstPayload = await firstResponse.json() as any;
    assert.strictEqual(firstPayload.data.replayed, false);
    assert.strictEqual(firstPayload.data.capture.status, 'pending');
    assert.strictEqual(firstPayload.data.capture.source, 'physical');
    assert.deepStrictEqual(firstPayload.data.capture.bookTags, ['reading']);

    const replayResponse = await fetch(`${fixture.baseUrl}/api/reading/captures`, {
      method: 'POST',
      headers: { ...authHeaders, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(captureBody),
    });
    assert.strictEqual(replayResponse.status, 200);
    const replayPayload = await replayResponse.json() as any;
    assert.strictEqual(replayPayload.data.replayed, true);
    assert.strictEqual(
      replayPayload.data.capture.id,
      firstPayload.data.capture.id,
    );

    const conflictResponse = await fetch(`${fixture.baseUrl}/api/reading/captures`, {
      method: 'POST',
      headers: { ...authHeaders, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ ...captureBody, originalText: 'Changed words' }),
    });
    assert.strictEqual(conflictResponse.status, 409);
    const conflictPayload = await conflictResponse.json() as any;
    assert.strictEqual(conflictPayload.code, 'idempotency_conflict');
  } finally {
    await fixture.close();
  }
});

test('browser routes reject delivery fields and expose no delivered-status mutation route', async () => {
  const fixture = await createRouteFixture();
  try {
    const headers = {
      Authorization: 'Bearer valid-session',
      'Content-Type': 'application/json',
      'Idempotency-Key': '9f6bcf31-f188-4c0d-88d3-9075313b3ed7',
    };
    const protectedResponse = await fetch(`${fixture.baseUrl}/api/reading/captures`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        bookId: 'book_1',
        originalText: 'Words',
        captureType: 'thought',
        status: 'delivered',
      }),
    });
    assert.strictEqual(protectedResponse.status, 400);
    const protectedPayload = await protectedResponse.json() as any;
    assert.strictEqual(protectedPayload.code, 'unexpected_field');

    const mutationResponse = await fetch(
      `${fixture.baseUrl}/api/reading/captures/reading_capture/status`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'delivered' }),
      },
    );
    assert.strictEqual(mutationResponse.status, 404);
  } finally {
    await fixture.close();
  }
});
