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
  stateFile: string;
  store: LocalReadingStore;
  close: () => Promise<void>;
}

async function createRouteFixture(
  configuredHash?: string,
): Promise<RouteFixture> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-reading-actions-'));
  const stateFile = path.join(directory, 'reading.json');
  const store = new LocalReadingStore(stateFile);
  let nextBookId = 0;
  const service = new ReadingService(
    store,
    () => '2026-07-28T12:00:00.000Z',
    () => `book_${++nextBookId}`,
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
    stateFile,
    store,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function actionHeaders(
  fixture: RouteFixture,
  idempotencyKey: string = crypto.randomUUID(),
): Record<string, string> {
  return {
    Authorization: `Bearer ${fixture.credential}`,
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
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
    destinationNotePath: `Literature notes/${title} â€” ${author}.md`,
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

test('action authentication uses only a valid configured token hash and fails closed', async () => {
  const fixture = await createRouteFixture();
  const missingHashFixture = await createRouteFixture('');
  const malformedHashFixture = await createRouteFixture('not-a-sha256-hash');
  try {
    await createBook(fixture);

    const missingAuthorization = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(captureBody()),
      },
    );
    assert.strictEqual(missingAuthorization.status, 401);
    assert.strictEqual((await missingAuthorization.json() as any).code, 'unauthorized');

    const browserCookie = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: {
          Cookie: `session_token=${fixture.credential}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(captureBody()),
      },
    );
    assert.strictEqual(browserCookie.status, 401);

    const browserBearer = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${crypto.randomBytes(32).toString('base64url')}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(captureBody()),
      },
    );
    assert.strictEqual(browserBearer.status, 401);

    for (const unavailable of [missingHashFixture, malformedHashFixture]) {
      const response = await fetch(
        `${unavailable.baseUrl}/api/actions/reading-captures`,
        {
          method: 'POST',
          headers: actionHeaders(unavailable),
          body: JSON.stringify(captureBody()),
        },
      );
      const payload = await response.json() as any;
      assert.strictEqual(response.status, 503);
      assert.strictEqual(payload.code, 'api_unavailable');
      assert.strictEqual(JSON.stringify(payload).includes(unavailable.credential), false);
    }

    assert.strictEqual((await fixture.store.listCaptures()).length, 0);
  } finally {
    await fixture.close();
    await missingHashFixture.close();
    await malformedHashFixture.close();
  }
});

test('action endpoint requires JSON and rejects invalid, unknown, and protected fields', async () => {
  const fixture = await createRouteFixture();
  try {
    await createBook(fixture);

    const wrongType = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${fixture.credential}`,
          'Content-Type': 'text/plain',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(captureBody()),
      },
    );
    assert.strictEqual(wrongType.status, 415);
    assert.strictEqual((await wrongType.json() as any).code, 'unsupported_media_type');

    const malformedJson = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: actionHeaders(fixture),
        body: '{',
      },
    );
    assert.strictEqual(malformedJson.status, 400);
    assert.strictEqual((await malformedJson.json() as any).code, 'invalid_json');

    for (const invalid of [
      {
        headers: actionHeaders(fixture, 'too-short'),
        body: captureBody(),
        code: 'invalid_idempotency_key',
      },
      {
        headers: actionHeaders(fixture),
        body: captureBody({ bookId: 'book_1' }),
        code: 'unexpected_field',
      },
      {
        headers: actionHeaders(fixture),
        body: captureBody({ status: 'delivered' }),
        code: 'unexpected_field',
      },
      {
        headers: actionHeaders(fixture),
        body: captureBody({ captureType: 'reflection' }),
        code: 'invalid_capture_type',
      },
      {
        headers: actionHeaders(fixture),
        body: captureBody({ source: 'web' }),
        code: 'invalid_source',
      },
      {
        headers: actionHeaders(fixture),
        body: captureBody({ locator: { kind: 'percentage', value: '50' } }),
        code: 'invalid_locator',
      },
      {
        headers: actionHeaders(fixture),
        body: captureBody({ originalText: 'x'.repeat(50_001) }),
        code: 'invalid_original_text',
      },
    ]) {
      const response = await fetch(
        `${fixture.baseUrl}/api/actions/reading-captures`,
        {
          method: 'POST',
          headers: invalid.headers,
          body: JSON.stringify(invalid.body),
        },
      );
      const payload = await response.json() as any;
      assert.strictEqual(response.status, 400);
      assert.strictEqual(payload.code, invalid.code);
      assert.strictEqual(JSON.stringify(payload).includes(fixture.credential), false);
    }

    const queryResponse = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures?bookId=book_1`,
      {
        method: 'POST',
        headers: actionHeaders(fixture),
        body: JSON.stringify(captureBody()),
      },
    );
    assert.strictEqual(queryResponse.status, 400);
    assert.strictEqual(
      (await queryResponse.json() as any).code,
      'unexpected_query_parameter',
    );
    assert.strictEqual((await fixture.store.listCaptures()).length, 0);
  } finally {
    await fixture.close();
  }
});

test('action endpoint resolves exact normalized books and reports stable match errors', async () => {
  const fixture = await createRouteFixture();
  try {
    await createBook(fixture, 'The   Great Divorce', 'C. S. Lewis');
    await createBook(fixture, 'The Great Divorce', 'Another Author');
    const archived = await createBook(fixture, 'Archived Book', 'Writer');
    await fixture.service.updateBook(archived.id, {
      expectedRevision: 1,
      status: 'archived',
    });

    const ambiguous = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: actionHeaders(fixture),
        body: JSON.stringify(captureBody({ bookAuthor: undefined })),
      },
    );
    assert.strictEqual(ambiguous.status, 409);
    assert.strictEqual((await ambiguous.json() as any).code, 'book_ambiguous');

    const inactive = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: actionHeaders(fixture),
        body: JSON.stringify(captureBody({
          bookTitle: 'archived book',
          bookAuthor: 'writer',
        })),
      },
    );
    assert.strictEqual(inactive.status, 409);
    assert.strictEqual((await inactive.json() as any).code, 'book_inactive');

    for (const title of ['Great Divorce', 'The Great Divorc']) {
      const notFound = await fetch(
        `${fixture.baseUrl}/api/actions/reading-captures`,
        {
          method: 'POST',
          headers: actionHeaders(fixture),
          body: JSON.stringify(captureBody({ bookTitle: title })),
        },
      );
      assert.strictEqual(notFound.status, 404);
      assert.strictEqual((await notFound.json() as any).code, 'book_not_found');
    }
  } finally {
    await fixture.close();
  }
});

test('action endpoint creates, safely replays, and conflicts with a minimal response', async () => {
  const fixture = await createRouteFixture();
  try {
    await createBook(fixture, 'The   Great Divorce', 'C. S. Lewis');
    const idempotencyKey = crypto.randomUUID();
    const body = captureBody({
      bookTitle: 'Ｔｈｅ Great Divorce',
      bookAuthor: 'c. s. lewis',
    });

    const createdResponse = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: actionHeaders(fixture, idempotencyKey),
        body: JSON.stringify(body),
      },
    );
    const created = await createdResponse.json() as any;
    assert.strictEqual(createdResponse.status, 201);
    assert.deepStrictEqual(Object.keys(created.data).sort(), [
      'bookAuthor',
      'bookTitle',
      'captureId',
      'receivedAt',
      'replayed',
      'status',
    ]);
    assert.strictEqual(created.data.bookTitle, 'The   Great Divorce');
    assert.strictEqual(created.data.bookAuthor, 'C. S. Lewis');
    assert.strictEqual(created.data.status, 'pending');
    assert.strictEqual(created.data.replayed, false);
    assert.strictEqual(JSON.stringify(created).includes(body.originalText as string), false);
    assert.strictEqual(JSON.stringify(created).includes('Literature notes'), false);
    assert.strictEqual(JSON.stringify(created).includes('literature'), false);

    const replayResponse = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: actionHeaders(fixture, idempotencyKey),
        body: JSON.stringify(body),
      },
    );
    const replay = await replayResponse.json() as any;
    assert.strictEqual(replayResponse.status, 200);
    assert.strictEqual(replay.data.replayed, true);
    assert.strictEqual(replay.data.captureId, created.data.captureId);

    const conflictResponse = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: actionHeaders(fixture, idempotencyKey),
        body: JSON.stringify(captureBody({
          bookTitle: 'Ｔｈｅ Great Divorce',
          bookAuthor: 'c. s. lewis',
          originalText: 'Different words',
        })),
      },
    );
    assert.strictEqual(conflictResponse.status, 409);
    assert.strictEqual((await conflictResponse.json() as any).code, 'idempotency_conflict');

    const captures = await fixture.store.listCaptures();
    assert.strictEqual(captures.length, 1);
    assert.strictEqual(captures[0].creatorType, 'custom_gpt');
    assert.strictEqual(captures[0].originalText, body.originalText);
    const persisted = fs.readFileSync(fixture.stateFile, 'utf8');
    assert.strictEqual(persisted.includes(idempotencyKey), false);
    assert.strictEqual(persisted.includes(fixture.credential), false);
  } finally {
    await fixture.close();
  }
});

test('action endpoint fails closed on storage errors and exposes no read route', async () => {
  const fixture = await createRouteFixture();
  const logged: string[] = [];
  const originalError = console.error;
  try {
    await createBook(fixture);
    fixture.store.createCaptureIdempotently = async () => {
      throw new Error('simulated storage outage');
    };
    console.error = (...values: unknown[]) => logged.push(values.join(' '));

    const response = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
      {
        method: 'POST',
        headers: actionHeaders(fixture),
        body: JSON.stringify(captureBody()),
      },
    );
    const payload = await response.json() as any;
    assert.strictEqual(response.status, 503);
    assert.strictEqual(payload.code, 'api_unavailable');
    assert.strictEqual(JSON.stringify(payload).includes(fixture.credential), false);
    assert.strictEqual(logged.join(' ').includes(fixture.credential), false);
    assert.strictEqual((await fixture.store.listCaptures()).length, 0);

    const getResponse = await fetch(
      `${fixture.baseUrl}/api/actions/reading-captures`,
    );
    assert.strictEqual(getResponse.status, 405);
    assert.strictEqual((await getResponse.json() as any).code, 'method_not_allowed');
  } finally {
    console.error = originalError;
    await fixture.close();
  }
});
