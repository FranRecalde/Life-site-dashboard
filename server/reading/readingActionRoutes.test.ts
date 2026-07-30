import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { AddressInfo } from 'net';
import { LocalReadingStore } from '../storage/localReadingStore';
import { createReadingActionRouter } from './readingActionRoutes';
import { ReadingService } from './readingService';

interface RouteFixture {
  baseUrl: string;
  credential: string;
  service: ReadingService;
  store: LocalReadingStore;
  close: () => Promise<void>;
}

async function createRouteFixture(configuredHash?: string): Promise<RouteFixture> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-reading-actions-'));
  const store = new LocalReadingStore(path.join(directory, 'reading.json'));
  let nextBookId = 0;
  let nextCaptureId = 0;
  const service = new ReadingService(
    store,
    () => '2026-07-28T12:00:00.000Z',
    () => `book_${++nextBookId}`,
    () => `reading_${String(++nextCaptureId).padStart(32, '0')}`,
  );
  const credential = crypto.randomBytes(32).toString('base64url');
  const credentialHash = crypto
    .createHash('sha256')
    .update(credential, 'utf8')
    .digest('hex');
  const app = express();
  app.use(
    '/api/actions/reading-captures',
    createReadingActionRouter(service, () => configuredHash ?? credentialHash),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    credential,
    service,
    store,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function actionHeaders(fixture: RouteFixture): Record<string, string> {
  return {
    Authorization: `Bearer ${fixture.credential}`,
    'Content-Type': 'application/json',
  };
}

async function createBook(
  fixture: RouteFixture,
  title = 'The Great Divorce',
  author = 'C. S. Lewis',
) {
  return fixture.service.createBook({
    title,
    author,
    destinationNotePath: `Literature notes/${title} — ${author}.md`,
    tags: ['literature'],
    defaultSource: 'audiobook',
  });
}

function captureBody(overrides: Record<string, unknown> = {}) {
  return {
    bookTitle: 'The Great Divorce',
    bookAuthor: 'C. S. Lewis',
    originalText: '  Exact spoken words.\nKeep the spacing.  ',
    captureType: 'thought',
    locator: { kind: 'chapter', value: 'Four' },
    ...overrides,
  };
}

test('action authentication uses one route-scoped bearer hash and fails closed', async () => {
  const fixture = await createRouteFixture();
  const unavailable = await createRouteFixture('');
  try {
    await createBook(fixture);
    for (const authorization of [undefined, 'Bearer wrong-token']) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authorization) headers.Authorization = authorization;
      const response = await fetch(
        `${fixture.baseUrl}/api/actions/reading-captures`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(captureBody()),
        },
      );
      assert.strictEqual(response.status, 401);
      assert.strictEqual(response.headers.get('www-authenticate'), 'Bearer');
    }

    const unavailableResponse = await fetch(
      `${unavailable.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: actionHeaders(unavailable),
        body: JSON.stringify(captureBody()),
      },
    );
    assert.strictEqual(unavailableResponse.status, 503);
    assert.strictEqual((await unavailableResponse.json() as any).code, 'api_unavailable');
    assert.strictEqual((await fixture.store.listCaptures()).length, 0);
  } finally {
    await Promise.all([fixture.close(), unavailable.close()]);
  }
});

test('action endpoint queues every accepted request and returns minimal metadata', async () => {
  const fixture = await createRouteFixture();
  try {
    await createBook(fixture, 'The   Great Divorce', 'C. S. Lewis');
    const body = captureBody({
      bookTitle: 'Ｔｈｅ Great Divorce',
      bookAuthor: 'c. s. lewis',
    });

    const responses = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(
        `${fixture.baseUrl}/api/actions/reading-captures`,
        {
          method: 'POST',
          headers: {
            ...actionHeaders(fixture),
            'Idempotency-Key': 'accepted-but-no-longer-used',
          },
          body: JSON.stringify(body),
        },
      );
      assert.strictEqual(response.status, 201);
      responses.push(await response.json() as any);
    }

    assert.notStrictEqual(
      responses[0].data.captureId,
      responses[1].data.captureId,
    );
    assert.deepStrictEqual(Object.keys(responses[0].data).sort(), [
      'bookAuthor',
      'bookTitle',
      'captureId',
      'receivedAt',
      'status',
    ]);
    assert.strictEqual(responses[0].data.status, 'pending');
    assert.strictEqual(JSON.stringify(responses[0]).includes(body.originalText as string), false);
    assert.strictEqual(JSON.stringify(responses[0]).includes('Literature notes'), false);
    assert.strictEqual((await fixture.store.listCaptures()).length, 2);
  } finally {
    await fixture.close();
  }
});

test('action endpoint preserves exact contract and book-resolution errors', async () => {
  const fixture = await createRouteFixture();
  try {
    await createBook(fixture);
    const unexpected = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures?read=true`,
      {
        method: 'POST',
        headers: actionHeaders(fixture),
        body: JSON.stringify(captureBody()),
      },
    );
    assert.strictEqual(unexpected.status, 400);
    assert.strictEqual((await unexpected.json() as any).code, 'unexpected_query_parameter');

    const protectedField = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: actionHeaders(fixture),
        body: JSON.stringify(captureBody({ status: 'done' })),
      },
    );
    assert.strictEqual(protectedField.status, 400);
    assert.strictEqual((await protectedField.json() as any).code, 'unexpected_field');

    const missing = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: actionHeaders(fixture),
        body: JSON.stringify(captureBody({ bookTitle: 'Missing' })),
      },
    );
    assert.strictEqual(missing.status, 404);
    assert.strictEqual((await missing.json() as any).code, 'book_not_found');

    const read = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      { headers: { Authorization: `Bearer ${fixture.credential}` } },
    );
    assert.strictEqual(read.status, 405);
  } finally {
    await fixture.close();
  }
});

test('action endpoint fails closed on queue storage errors', async () => {
  const fixture = await createRouteFixture();
  const originalError = console.error;
  try {
    await createBook(fixture);
    fixture.store.createCapture = async () => {
      throw new Error('simulated storage outage');
    };
    console.error = () => undefined;
    const response = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: actionHeaders(fixture),
        body: JSON.stringify(captureBody()),
      },
    );
    assert.strictEqual(response.status, 503);
    assert.strictEqual((await response.json() as any).code, 'api_unavailable');
  } finally {
    console.error = originalError;
    await fixture.close();
  }
});
