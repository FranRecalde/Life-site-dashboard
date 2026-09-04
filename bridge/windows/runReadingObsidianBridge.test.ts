import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GenericDelivery } from '../../src/types';
import { main, runReadingBridgeRehearsal } from './runReadingObsidianBridge';

test('launcher opens the configured Firestore store and local vault paths', async () => {
  const events: string[] = [];
  const result = await runReadingBridgeRehearsal(
    'gen-lang-client-0802447346',
    'life-site-staging',
    'C:\\vault',
    `reading_${'a'.repeat(32)}`,
    {
      createService: (projectId, databaseId) => {
        events.push(`store:${projectId}:${databaseId}`);
        return {} as any;
      },
      getMarkerBasePath: () => 'C:\\bridge-state\\staging',
      createBridge: (_service, vaultRoot, markerBasePath) => ({
        runOnce: async (options) => {
          events.push(`vault:${vaultRoot}:${markerBasePath}:${options?.expectedCaptureId}`);
          return { outcome: 'idle' };
        },
        drainPendingCaptures: async () => ({ outcome: 'idle', deliveredCaptureIds: [] }),
      }),
    },
  );
  assert.deepStrictEqual(result, { outcome: 'idle' });
  assert.deepStrictEqual(events, [
    'store:gen-lang-client-0802447346:life-site-staging',
    `vault:C:\\vault:C:\\bridge-state\\staging:reading_${'a'.repeat(32)}`,
  ]);
});

test('launcher accepts optional expected-capture-id and prints delivered IDs', async () => {
  const stdout: string[] = [];
  const events: string[] = [];
  assert.strictEqual(await main([
    '--firestore-project-id', 'project',
    '--firestore-database-id', 'database',
    '--vault-root', 'C:\\vault',
  ], {
    getMarkerBasePath: () => 'C:\\bridge-state\\database',
    createService: () => ({} as any),
    createBridge: () => ({
      runOnce: async () => ({ outcome: 'idle' }),
      drainPendingCaptures: async () => {
        events.push('drained');
        return {
          outcome: 'delivered',
          deliveredCaptureIds: [`reading_${'a'.repeat(32)}`, `reading_${'b'.repeat(32)}`],
        };
      },
    }),
    stdout: (line) => stdout.push(line),
  }), 0);
  assert.deepStrictEqual(events, ['drained']);
  assert.deepStrictEqual(stdout, [JSON.stringify({
    outcome: 'delivered',
    deliveredCaptureIds: [`reading_${'a'.repeat(32)}`, `reading_${'b'.repeat(32)}`],
    deliveredCount: 2,
  })]);
});

test('launcher keeps the expected-capture-id one-shot path', async () => {
  const events: string[] = [];
  const expectedCaptureId = `reading_${'a'.repeat(32)}`;
  assert.strictEqual(await main([
    '--firestore-project-id', 'project',
    '--firestore-database-id', 'database',
    '--vault-root', 'C:\\vault',
    '--expected-capture-id', expectedCaptureId,
  ], {
    run: async (_projectId, _databaseId, _vaultRoot, receivedCaptureId) => {
      events.push(receivedCaptureId ?? 'missing');
      return { outcome: 'delivered', captureId: expectedCaptureId, appendOutcome: 'appended' };
    },
    stdout: () => undefined,
  }), 0);
  assert.deepStrictEqual(events, [expectedCaptureId]);
});

test('launcher without local-store still requires both Firestore arguments', async () => {
  for (const args of [
    ['--vault-root', 'C:\\vault'],
    ['--firestore-project-id', 'project', '--vault-root', 'C:\\vault'],
    ['--firestore-database-id', 'database', '--vault-root', 'C:\\vault'],
  ]) {
    const stderr: string[] = [];
    assert.strictEqual(await main(args, { stderr: (line) => stderr.push(line) }), 1);
    assert.deepStrictEqual(stderr, ['{"outcome":"failed","errorCode":"INVALID_ARGUMENTS"}']);
  }
});

test('local-store launcher delivers a generic entry to the local vault', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'life-site-local-bridge-'));
  const stateFile = path.join(directory, 'reading.json'); const vaultRoot = path.join(directory, 'vault');
  const entry: GenericDelivery = {
    deliveryKind: 'generic', id: `reading_${'a'.repeat(32)}`,
    destinationNotePath: 'Fleeting Notes/Signal.md', renderedMarkdown: '## Signal\n---\n',
    receivedAt: '2026-09-04T16:00:00.000Z', status: 'pending', deliveryAttempts: { count: 0 }, updatedAt: '2026-09-04T16:00:00.000Z',
  };
  try {
    await fs.mkdir(vaultRoot, { recursive: true });
    await fs.writeFile(stateFile, JSON.stringify({ version: 1, books: [], captures: [entry] }), 'utf8');
    assert.strictEqual(await main(['--local-store', stateFile, '--vault-root', vaultRoot], { stdout: () => undefined }), 0);
    assert.strictEqual(await fs.readFile(path.join(vaultRoot, 'Fleeting Notes', 'Signal.md'), 'utf8'), entry.renderedMarkdown);
    assert.strictEqual(JSON.parse(await fs.readFile(stateFile, 'utf8')).captures[0].status, 'done');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
