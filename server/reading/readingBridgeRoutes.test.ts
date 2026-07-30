import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import { AddressInfo } from 'net';
import { LocalReadingStore } from '../storage/localReadingStore';
import { createReadingBridgeRouter } from './readingBridgeRoutes';
import { READING_CLAIM_STALE_MS, ReadingService } from './readingService';

async function createFixture(configuredHash?: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'life-site-reading-bridge-routes-'));
  const store = new LocalReadingStore(path.join(directory, 'reading.json'));
  let nowMs = Date.parse('2026-07-28T12:00:00.000Z');
  let captureId = 0;
  const service = new ReadingService(
    store,
    () => new Date(nowMs).toISOString(),
    () => 'book_1',
    () => `reading_${String(++captureId).padStart(32, '0')}`,
  );
  const bridgeCredential = crypto.randomBytes(32).toString('base64url');
  const bridgeHash = crypto
    .createHash('sha256')
    .update(bridgeCredential, 'utf8')
    .digest('hex');
  const app = express();
  app.use(
    '/api/bridge/reading-captures',
    createReadingBridgeRouter(service, () => configuredHash ?? bridgeHash),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    bridgeCredential,
    service,
    store,
    advance(ms: number) {
      nowMs += ms;
    },
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

function bridgeHeaders(credential: string): Record<string, string> {
  return {
    Authorization: `Bearer ${credential}`,
    'Content-Type': 'application/json',
  };
}

async function queueCapture(fixture: Awaited<ReturnType<typeof createFixture>>) {
  await fixture.service.createBook({
    title: 'Book',
    author: 'Author',
    destinationNotePath: 'Literature notes/Book — Author.md',
    tags: ['reading'],
  });
  return fixture.service.createCapture({
    bookId: 'book_1',
    originalText: 'STAGING-ONLY harmless bridge verification',
    captureType: 'thought',
  });
}

test('bridge authentication is route-scoped, fail-closed, and checked before parsing', async () => {
  const fixture = await createFixture();
  const unavailable = await createFixture('');
  try {
    for (const credential of [undefined, 'wrong-token']) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (credential) headers.Authorization = `Bearer ${credential}`;
      const response = await fetch(
        `${fixture.baseUrl}/api/bridge/reading-captures/claim`,
        {
          method: 'POST',
          headers,
          body: '{"ownerId":',
        },
      );
      assert.strictEqual(response.status, 401);
    }

    const unavailableResponse = await fetch(
      `${unavailable.baseUrl}/api/bridge/reading-captures/claim`,
      {
        method: 'POST',
        headers: bridgeHeaders(unavailable.bridgeCredential),
        body: JSON.stringify({ ownerId: 'windows-bridge' }),
      },
    );
    assert.strictEqual(unavailableResponse.status, 503);
    assert.strictEqual(
      (await unavailableResponse.json() as any).code,
      'bridge_unavailable',
    );
  } finally {
    await Promise.all([fixture.close(), unavailable.close()]);
  }
});

test('compatibility API claims and confirms the simple queue without stored leases', async () => {
  const fixture = await createFixture();
  try {
    const created = await queueCapture(fixture);
    const claimResponse = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures/claim`,
      {
        method: 'POST',
        headers: bridgeHeaders(fixture.bridgeCredential),
        body: JSON.stringify({ ownerId: 'windows-bridge' }),
      },
    );
    const claim = await claimResponse.json() as any;
    assert.strictEqual(claimResponse.status, 200);
    assert.strictEqual(claim.data.captureId, created.capture.id);
    assert.strictEqual(claim.data.leaseId, created.capture.id);
    assert.ok(claim.data.markdown.startsWith(
      `<!-- life-site-reading-capture:${created.capture.id} -->`,
    ));
    const storedClaim = await fixture.store.getCapture(created.capture.id);
    assert.strictEqual(storedClaim?.status, 'claimed');
    assert.strictEqual('deliveryLease' in (storedClaim ?? {}), false);

    fixture.advance(1_000);
    const confirmResponse = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures/${created.capture.id}/confirm`,
      {
        method: 'POST',
        headers: bridgeHeaders(fixture.bridgeCredential),
        body: JSON.stringify({ leaseId: created.capture.id }),
      },
    );
    const confirmation = await confirmResponse.json() as any;
    assert.strictEqual(confirmResponse.status, 200);
    assert.strictEqual(confirmation.data.status, 'done');
    assert.strictEqual(
      (await fixture.store.getCapture(created.capture.id))?.status,
      'done',
    );
  } finally {
    await fixture.close();
  }
});

test('compatibility recovery is a no-op because stale claims are reclaimed on claim', async () => {
  const fixture = await createFixture();
  try {
    const created = await queueCapture(fixture);
    await fixture.service.claimCapture(created.capture.id);
    fixture.advance(READING_CLAIM_STALE_MS + 1);

    const recoveryResponse = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures/recover-expired`,
      {
        method: 'POST',
        headers: bridgeHeaders(fixture.bridgeCredential),
        body: JSON.stringify({ ownerId: 'windows-bridge' }),
      },
    );
    assert.deepStrictEqual(
      (await recoveryResponse.json() as any).data,
      { recoveredCount: 0 },
    );

    const claimResponse = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures/claim`,
      {
        method: 'POST',
        headers: bridgeHeaders(fixture.bridgeCredential),
        body: JSON.stringify({ ownerId: 'windows-bridge' }),
      },
    );
    assert.strictEqual((await claimResponse.json() as any).data.captureId, created.capture.id);
    assert.strictEqual(
      (await fixture.store.getCapture(created.capture.id))
        ?.deliveryAttempts.count,
      2,
    );
  } finally {
    await fixture.close();
  }
});

test('failure records a fixed code and leaves the claim for stale retry', async () => {
  const fixture = await createFixture();
  try {
    const created = await queueCapture(fixture);
    await fixture.service.claimCapture(created.capture.id);
    const response = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures/${created.capture.id}/failure`,
      {
        method: 'POST',
        headers: bridgeHeaders(fixture.bridgeCredential),
        body: JSON.stringify({
          leaseId: created.capture.id,
          errorCode: 'APPEND_FAILED',
        }),
      },
    );
    const payload = await response.json() as any;
    assert.strictEqual(payload.data.status, 'claimed');
    assert.strictEqual(payload.data.errorCode, 'APPEND_FAILED');
  } finally {
    await fixture.close();
  }
});

test('bridge compatibility routes remain POST-only with strict bodies', async () => {
  const fixture = await createFixture();
  try {
    const headers = bridgeHeaders(fixture.bridgeCredential);
    const invalidOwner = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures/claim`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ownerId: 'windows bridge' }),
      },
    );
    assert.strictEqual(invalidOwner.status, 400);

    const read = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures`,
      { headers: { Authorization: `Bearer ${fixture.bridgeCredential}` } },
    );
    assert.strictEqual(read.status, 405);

    const genericPost = await fetch(
      `${fixture.baseUrl}/api/bridge/reading-captures`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      },
    );
    assert.strictEqual(genericPost.status, 405);
  } finally {
    await fixture.close();
  }
});
