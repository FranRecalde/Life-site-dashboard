import test from 'node:test';
import assert from 'node:assert/strict';
import { main, runReadingBridgeRehearsal } from './runReadingObsidianBridge';

test('launcher directly opens the configured local queue and vault paths', async () => {
  const events: string[] = [];
  const result = await runReadingBridgeRehearsal(
    'C:\\queue\\reading.json', 'C:\\vault', `reading_${'a'.repeat(32)}`,
    {
      createService: (queueFile) => { events.push(`queue:${queueFile}`); return {} as any; },
      createBridge: (_service, vaultRoot, queueFile) => ({ runOnce: async (options) => { events.push(`vault:${vaultRoot}:${queueFile}:${options?.expectedCaptureId}`); return { outcome: 'idle' }; } }),
    },
  );
  assert.deepStrictEqual(result, { outcome: 'idle' });
  assert.deepStrictEqual(events, [
    'queue:C:\\queue\\reading.json',
    `vault:C:\\vault:C:\\queue\\reading.json:reading_${'a'.repeat(32)}`,
  ]);
});

test('launcher requires direct queue, vault, and expected-capture arguments and sanitizes errors', async () => {
  const stderr: string[] = [];
  assert.strictEqual(await main([], { stderr: (line) => stderr.push(line) }), 1);
  assert.deepStrictEqual(stderr, ['{"outcome":"failed","errorCode":"INVALID_ARGUMENTS"}']);
});
