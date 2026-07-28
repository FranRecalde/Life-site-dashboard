import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  appendCaptureToExistingNote,
  BridgeClaim,
  BridgeFailureCode,
  BridgeLocalError,
  BridgeProtocolError,
  HttpReadingBridgeClient,
  ReadingBridgeClient,
  ReadingObsidianBridge,
  withSingleInstanceLock,
} from './readingObsidianBridge';

const captureId = `reading_${'a'.repeat(32)}`;
const marker = `<!-- life-site-reading-capture:${captureId} -->`;

function makeClaim(
  overrides: Partial<BridgeClaim> = {},
): BridgeClaim {
  return {
    captureId,
    destinationNotePath:
      'Literature notes/_Staging/Phase 3 Bridge Verification.md',
    markdown: [
      marker,
      '### Thought',
      '- Captured: 2026-07-28T12:00:00.000Z',
      '- Type: Thought',
      '',
      'STAGING-ONLY harmless bridge verification',
    ].join('\n'),
    leaseId: 'lease_1',
    leaseExpiresAt: '2026-07-28T12:05:00.000Z',
    ...overrides,
  };
}

async function createVault(initialContent = '# Phase 3 verification\n') {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'life-site-reading-bridge-worker-'),
  );
  const note = path.join(
    directory,
    'Literature notes',
    '_Staging',
    'Phase 3 Bridge Verification.md',
  );
  await fs.mkdir(path.dirname(note), { recursive: true });
  await fs.writeFile(note, initialContent, 'utf8');
  return {
    directory,
    note,
    cleanup: () => fs.rm(directory, { recursive: true, force: true }),
  };
}

class FakeBridgeClient implements ReadingBridgeClient {
  claims: Array<BridgeClaim | null> = [];
  confirmations: Array<{ captureId: string; leaseId: string }> = [];
  failures: Array<{
    captureId: string;
    leaseId: string;
    errorCode: BridgeFailureCode;
  }> = [];
  recoveries: string[] = [];
  confirmError: Error | null = null;

  async claim(): Promise<BridgeClaim | null> {
    return this.claims.shift() ?? null;
  }

  async recoverExpired(ownerId: string): Promise<number> {
    this.recoveries.push(ownerId);
    return 1;
  }

  async confirm(captureIdValue: string, leaseId: string): Promise<void> {
    this.confirmations.push({ captureId: captureIdValue, leaseId });
    if (this.confirmError) throw this.confirmError;
  }

  async reportFailure(
    captureIdValue: string,
    leaseId: string,
    errorCode: BridgeFailureCode,
  ): Promise<void> {
    this.failures.push({ captureId: captureIdValue, leaseId, errorCode });
  }
}

test('worker appends once, verifies exact Markdown, and confirms delivery', async () => {
  const vault = await createVault();
  const client = new FakeBridgeClient();
  const claim = makeClaim();
  client.claims.push(claim);
  try {
    const bridge = new ReadingObsidianBridge(
      client,
      vault.directory,
      'windows-bridge',
    );
    assert.deepStrictEqual(await bridge.runOnce(), {
      outcome: 'delivered',
      captureId,
      appendOutcome: 'appended',
    });
    const content = await fs.readFile(vault.note, 'utf8');
    assert.strictEqual(content.split(marker).length - 1, 1);
    assert.ok(content.includes(claim.markdown));
    assert.deepStrictEqual(client.confirmations, [
      { captureId, leaseId: 'lease_1' },
    ]);
    assert.deepStrictEqual(client.failures, []);
  } finally {
    await vault.cleanup();
  }
});

test('worker treats an exact existing block as delivered without appending again', async () => {
  const claim = makeClaim();
  const vault = await createVault(`# Note\n\n${claim.markdown}\n`);
  const client = new FakeBridgeClient();
  client.claims.push(claim);
  try {
    const before = await fs.readFile(vault.note, 'utf8');
    const bridge = new ReadingObsidianBridge(
      client,
      vault.directory,
      'windows-bridge',
    );
    assert.deepStrictEqual(await bridge.runOnce(), {
      outcome: 'delivered',
      captureId,
      appendOutcome: 'already_present',
    });
    assert.strictEqual(await fs.readFile(vault.note, 'utf8'), before);
    assert.strictEqual(client.confirmations.length, 1);
  } finally {
    await vault.cleanup();
  }
});

test('worker never duplicates after confirmation uncertainty', async () => {
  const vault = await createVault();
  const client = new FakeBridgeClient();
  const claim = makeClaim();
  client.claims.push(claim, claim);
  client.confirmError = new Error('simulated network uncertainty with private details');
  try {
    const bridge = new ReadingObsidianBridge(
      client,
      vault.directory,
      'windows-bridge',
    );
    await assert.rejects(() => bridge.runOnce());
    client.confirmError = null;
    assert.deepStrictEqual(await bridge.runOnce(), {
      outcome: 'delivered',
      captureId,
      appendOutcome: 'already_present',
    });
    const content = await fs.readFile(vault.note, 'utf8');
    assert.strictEqual(content.split(marker).length - 1, 1);
    assert.deepStrictEqual(client.failures, []);
  } finally {
    await vault.cleanup();
  }
});

test('worker reports sanitized local failures without modifying the vault', async () => {
  const vault = await createVault();
  const cases: Array<{
    claim: BridgeClaim;
    errorCode: BridgeFailureCode;
  }> = [
    {
      claim: makeClaim({ destinationNotePath: '../private.md' }),
      errorCode: 'UNSAFE_DESTINATION',
    },
    {
      claim: makeClaim({
        destinationNotePath: 'Literature notes/_Staging/Missing.md',
      }),
      errorCode: 'DESTINATION_NOT_FOUND',
    },
    {
      claim: makeClaim(),
      errorCode: 'PARTIAL_CAPTURE_BLOCK',
    },
  ];
  try {
    await fs.writeFile(vault.note, `${marker}\npartial\n`, 'utf8');
    for (const item of cases) {
      const client = new FakeBridgeClient();
      client.claims.push(item.claim);
      const bridge = new ReadingObsidianBridge(
        client,
        vault.directory,
        'windows-bridge',
      );
      const result = await bridge.runOnce();
      assert.strictEqual(result.outcome, 'needs_attention');
      assert.strictEqual(
        result.outcome === 'needs_attention' ? result.errorCode : '',
        item.errorCode,
      );
      assert.deepStrictEqual(client.confirmations, []);
      assert.strictEqual(client.failures[0].errorCode, item.errorCode);
      assert.strictEqual(
        JSON.stringify(client.failures).includes(vault.directory),
        false,
      );
      assert.strictEqual(
        JSON.stringify(client.failures).includes('private.md'),
        false,
      );
    }
  } finally {
    await vault.cleanup();
  }
});

test('append rejects a marker-only partial write and leaves it unchanged', async () => {
  const claim = makeClaim();
  const vault = await createVault(`${marker}\npartial`);
  try {
    const before = await fs.readFile(vault.note, 'utf8');
    await assert.rejects(
      () => appendCaptureToExistingNote(vault.directory, claim),
      (error: unknown) => (
        error instanceof BridgeLocalError &&
        error.code === 'PARTIAL_CAPTURE_BLOCK'
      ),
    );
    assert.strictEqual(await fs.readFile(vault.note, 'utf8'), before);
  } finally {
    await vault.cleanup();
  }
});

test('append rejects oversized injected Markdown without touching the note', async () => {
  const vault = await createVault();
  const oversized = makeClaim({
    markdown: `${marker}\n${'x'.repeat(128 * 1024)}`,
  });
  try {
    const before = await fs.readFile(vault.note, 'utf8');
    await assert.rejects(
      () => appendCaptureToExistingNote(vault.directory, oversized),
      (error: unknown) => (
        error instanceof BridgeLocalError &&
        error.code === 'APPEND_FAILED'
      ),
    );
    assert.strictEqual(await fs.readFile(vault.note, 'utf8'), before);
  } finally {
    await vault.cleanup();
  }
});

test('HTTP client requires safe transport and returns only sanitized errors', async () => {
  const rawToken = 'private-bridge-token-value';
  assert.throws(
    () => new HttpReadingBridgeClient(
      'http://staging.example.test',
      rawToken,
    ),
    (error: unknown) => (
      error instanceof BridgeProtocolError &&
      error.code === 'INVALID_CONFIGURATION' &&
      !error.message.includes(rawToken)
    ),
  );

  const client = new HttpReadingBridgeClient(
    'https://staging.example.test',
    rawToken,
    async () => new Response(
      JSON.stringify({
        success: false,
        error: `provider leaked ${rawToken}`,
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    ),
  );
  await assert.rejects(
    () => client.claim('windows-bridge'),
    (error: unknown) => (
      error instanceof BridgeProtocolError &&
      error.code === 'REQUEST_FAILED' &&
      !error.message.includes(rawToken)
    ),
  );
});

test('HTTP client stops at its bounded response limit', async () => {
  const client = new HttpReadingBridgeClient(
    'https://staging.example.test',
    'private-bridge-token-value',
    async () => new Response('x'.repeat(512 * 1024 + 1), { status: 200 }),
  );
  await assert.rejects(
    () => client.claim('windows-bridge'),
    (error: unknown) => (
      error instanceof BridgeProtocolError &&
      error.code === 'INVALID_RESPONSE'
    ),
  );
});

test('single-instance lock prevents overlap and is removed afterward', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'life-site-reading-bridge-lock-'),
  );
  const lockFile = path.join(directory, 'bridge.lock');
  try {
    await withSingleInstanceLock(lockFile, async () => {
      await assert.rejects(
        () => withSingleInstanceLock(lockFile, async () => undefined),
        (error: unknown) => (
          error instanceof BridgeProtocolError &&
          error.code === 'INVALID_CONFIGURATION'
        ),
      );
    });
    await assert.rejects(() => fs.stat(lockFile));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('worker exposes explicit expired-lease recovery without starting a loop', async () => {
  const client = new FakeBridgeClient();
  const bridge = new ReadingObsidianBridge(
    client,
    'unused-in-this-test',
    'windows-bridge',
  );
  assert.strictEqual(await bridge.recoverExpired(), 1);
  assert.deepStrictEqual(client.recoveries, ['windows-bridge']);
});
