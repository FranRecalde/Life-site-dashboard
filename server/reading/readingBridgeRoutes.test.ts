import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { AddressInfo } from 'node:net';
import { LocalReadingStore } from '../storage/localReadingStore';
import { createReadingActionRouter } from './readingActionRoutes';
import { createReadingBridgeRouter } from './readingBridgeRoutes';
import { ReadingService } from './readingService';

async function createFixture(configuredBridgeHash?: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-reading-bridge-routes-'));
  const store = new LocalReadingStore(path.join(directory, 'reading.json'));
  let currentTime = '2026-07-28T12:00:00.000Z';
  let nextBookId = 0;
  let nextLeaseId = 0;
  const service = new ReadingService(
    store,
    () => currentTime,
    () => `book_${++nextBookId}`,
    () => `lease_${++nextLeaseId}`,
  );
  const bridgeCredential = crypto.randomBytes(32).toString('base64url');
  const actionCredential = crypto.randomBytes(32).toString('base64url');
  const bridgeHash = crypto
    .createHash('sha256')
    .update(bridgeCredential, 'utf8')
    .digest('hex');
  const actionHash = crypto
    .createHash('sha256')
    .update(actionCredential, 'utf8')
    .digest('hex');

  const app = express();
  app.use(
    '/api/actions/reading-captures',
    createReadingActionRouter(service, () => actionHash),
  );
  app.use(
    '/api/bridge/reading-captures',
    createReadingBridgeRouter(
      service,
      () => configuredBridgeHash ?? bridgeHash,
    ),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    bridgeCredential,
    actionCredential,
    service,
    store,
    setNow: (value: string) => {
      currentTime = value;
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function bridgeHeaders(
  credential: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${credential}`,
    'Content-Type': 'application/json',
  };
}

async function createPendingCapture(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  text = 'STAGING-ONLY harmless bridge verification',
) {
  const books = await fixture.service.listBooks();
  const book = books[0] ?? await fixture.service.createBook({
    title: 'Phase 3 Bridge Verification',
    author: 'Life Site staging',
    destinationNotePath:
      'Literature notes/_Staging/Phase 3 Bridge Verification.md',
    tags: ['staging-only'],
  });
  return fixture.service.createCapture(
    {
      bookId: book.id,
      originalText: text,
      captureType: 'thought',
    },
    crypto.randomUUID(),
  );
}

test('bridge authentication is separate, fail-closed, and checked before parsing', async () => {
  const fixture = await createFixture();
  const unavailable = await createFixture('');
  try {
    await createPendingCapture(fixture);

    for (const headers of [
      { 'Content-Type': 'application/json' },
      {
        ...bridgeHeaders(fixture.actionCredential),
        Cookie: `session_token=${fixture.bridgeCredential}`,
      },
    ]) {
      const response = await fetch(
        `${fixture.baseUrl}/api/bridge/reading-captures/claim`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ ownerId: 'windows-bridge' }),
        },
      );
      assert.strictEqual(response.status, 401);
      assert.strictEqual((await response.json() as any).code, 'unauthorized');
    }

    const unavailableResponse = await fetch(
      `${unavailable.baseUrl}/api/bridge/reading-captures/claim`,
      {
        method: 'POST',
        headers: bridgeHeaders(unavailable.bridgeCredential),
        body: '{',
      },
    );
    const unavailablePayload = await unavailableResponse.json() as any;
    assert.strictEqual(unavailableResponse.status, 503);
    assert.strictEqual(unavailablePayload.code, 'bridge_unavailable');
    assert.strictEqual(
      JSON.stringify(unavailablePayload).includes(unavailable.bridgeCredential),
      false,
    );
    assert.strictEqual((await fixture.store.listCaptures())[0].status, 'pending');
  } finally {
    await fixture.close();
    await unavailable.close();
  }
});

test('bridge claims a minimal payload and confirms delivery idempotently', async () => {
  const fixture = await createFixture();
  try {
    const created = await createPendingCapture(fixture);
    const claimResponse = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures/claim`,
      {
        method: 'POST',
        headers: bridgeHeaders(fixture.bridgeCredential),
        body: JSON.stringify({ ownerId: 'windows-bridge' }),
      },
    );
    const claimPayload = await claimResponse.json() as any;
    assert.strictEqual(claimResponse.status, 200);
    assert.strictEqual(claimResponse.headers.get('cache-control'), 'no-store');
    assert.deepStrictEqual(Object.keys(claimPayload.data).sort(), [
      'captureId',
      'destinationNotePath',
      'leaseExpiresAt',
      'leaseId',
      'markdown',
    ]);
    assert.strictEqual(claimPayload.data.captureId, created.capture.id);
    assert.strictEqual(
      claimPayload.data.destinationNotePath,
      created.capture.destinationNotePath,
    );
    assert.match(
      claimPayload.data.markdown,
      new RegExp(`life-site-reading-capture:${created.capture.id}`),
    );
    assert.strictEqual(
      JSON.stringify(claimPayload).includes(fixture.bridgeCredential),
      false,
    );

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const confirmResponse = await fetch(
        `${fixture.baseUrl}/api/bridge/reading-captures/${created.capture.id}/confirm`,
        {
          method: 'POST',
          headers: bridgeHeaders(fixture.bridgeCredential),
          body: JSON.stringify({ leaseId: claimPayload.data.leaseId }),
        },
      );
      const confirmPayload = await confirmResponse.json() as any;
      assert.strictEqual(confirmResponse.status, 200);
      assert.strictEqual(confirmPayload.data.status, 'delivered');
    }

    const idleResponse = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures/claim`,
      {
        method: 'POST',
        headers: bridgeHeaders(fixture.bridgeCredential),
        body: JSON.stringify({ ownerId: 'windows-bridge' }),
      },
    );
    assert.strictEqual((await idleResponse.json() as any).data, null);
  } finally {
    await fixture.close();
  }
});

test('bridge validates strict bodies and exposes no GET or generic read route', async () => {
  const fixture = await createFixture();
  try {
    await createPendingCapture(fixture);
    const cases = [
      {
        path: '/claim',
        body: { ownerId: 'windows bridge' },
        code: 'invalid_owner_id',
      },
      {
        path: '/claim',
        body: { ownerId: 'windows-bridge', leaseDurationMs: 900_000 },
        code: 'unexpected_field',
      },
      {
        path: '/reading_not-an-id/confirm',
        body: { leaseId: 'lease_1' },
        code: 'invalid_capture_id',
      },
      {
        path: `/reading_${'a'.repeat(32)}/failure`,
        body: { leaseId: 'lease_1', errorCode: 'private path text' },
        code: 'invalid_error_code',
      },
      {
        path: '/claim?limit=200',
        body: { ownerId: 'windows-bridge' },
        code: 'unexpected_query_parameter',
      },
    ];
    for (const item of cases) {
      const response = await fetch(
        `${fixture.baseUrl}/api/bridge/reading-captures${item.path}`,
        {
          method: 'POST',
          headers: bridgeHeaders(fixture.bridgeCredential),
          body: JSON.stringify(item.body),
        },
      );
      assert.strictEqual(response.status, 400);
      assert.strictEqual((await response.json() as any).code, item.code);
    }

    const getResponse = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures/claim`,
      { headers: { Authorization: `Bearer ${fixture.bridgeCredential}` } },
    );
    assert.strictEqual(getResponse.status, 405);

    const genericRead = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures`,
      {
        headers: {
          Authorization: `Bearer ${fixture.bridgeCredential}`,
          'Content-Type': 'application/json',
        },
      },
    );
    assert.strictEqual(genericRead.status, 405);
  } finally {
    await fixture.close();
  }
});

test('bridge reports failures and recovers only expired leases for the same owner', async () => {
  const fixture = await createFixture();
  try {
    const first = await createPendingCapture(fixture, 'First');
    const firstClaim = await fixture.service.claimCapture(
      first.capture.id,
      'windows-bridge',
      300_000,
    );
    const second = await createPendingCapture(fixture, 'Second');
    await fixture.service.claimCapture(
      second.capture.id,
      'other-bridge',
      300_000,
    );
    fixture.setNow('2026-07-28T12:05:00.000Z');

    const recoverResponse = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures/recover-expired`,
      {
        method: 'POST',
        headers: bridgeHeaders(fixture.bridgeCredential),
        body: JSON.stringify({ ownerId: 'windows-bridge' }),
      },
    );
    assert.strictEqual(
      (await recoverResponse.json() as any).data.recoveredCount,
      1,
    );
    assert.strictEqual(
      (await fixture.store.getCapture(second.capture.id))?.status,
      'in_progress',
    );

    const reclaimed = await fixture.service.claimCapture(
      first.capture.id,
      'windows-bridge',
      300_000,
    );
    const failureResponse = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures/${first.capture.id}/failure`,
      {
        method: 'POST',
        headers: bridgeHeaders(fixture.bridgeCredential),
        body: JSON.stringify({
          leaseId: reclaimed.deliveryLease!.leaseId,
          errorCode: 'DESTINATION_NOT_FOUND',
        }),
      },
    );
    const failurePayload = await failureResponse.json() as any;
    assert.strictEqual(failureResponse.status, 200);
    assert.strictEqual(failurePayload.data.status, 'needs_attention');
    assert.strictEqual(
      failurePayload.data.errorCode,
      'DESTINATION_NOT_FOUND',
    );

    const repeatFailure = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures/${first.capture.id}/failure`,
      {
        method: 'POST',
        headers: bridgeHeaders(fixture.bridgeCredential),
        body: JSON.stringify({
          leaseId: firstClaim.deliveryLease!.leaseId,
          errorCode: 'DESTINATION_NOT_FOUND',
        }),
      },
    );
    assert.strictEqual(repeatFailure.status, 200);
  } finally {
    await fixture.close();
  }
});
