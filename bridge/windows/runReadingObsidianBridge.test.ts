import test from 'node:test';
import assert from 'node:assert/strict';
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
      getMarkerFile: () => 'C:\\bridge-state\\staging',
      createBridge: (_service, vaultRoot, markerFile) => ({
        runOnce: async (options) => {
          events.push(`vault:${vaultRoot}:${markerFile}:${options?.expectedCaptureId}`);
          return { outcome: 'idle' };
        },
      }),
    },
  );
  assert.deepStrictEqual(result, { outcome: 'idle' });
  assert.deepStrictEqual(events, [
    'store:gen-lang-client-0802447346:life-site-staging',
    `vault:C:\\vault:C:\\bridge-state\\staging:reading_${'a'.repeat(32)}`,
  ]);
});

test('launcher requires Firestore, vault, and expected-capture arguments and sanitizes errors', async () => {
  const stderr: string[] = [];
  assert.strictEqual(await main([], { stderr: (line) => stderr.push(line) }), 1);
  assert.deepStrictEqual(stderr, ['{"outcome":"failed","errorCode":"INVALID_ARGUMENTS"}']);
});
