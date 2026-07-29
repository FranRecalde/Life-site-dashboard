import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ObsidianClient } from './obsidianClient';

const originalFetch = globalThis.fetch;
const encodeRepeatedly = (value: string, depth: number) => {
  let encoded = value;
  for (let layer = 0; layer < depth; layer += 1) {
    encoded = encodeURIComponent(encoded);
  }
  return encoded;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('desktop global search returns matching notes from permitted folders', async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method || 'GET'} ${url}`);

    if (url.includes('/search/simple/')) {
      assert.equal(init?.method, 'POST');
      return new Response(JSON.stringify([
        {
          filename: 'Personal/Matched note.md',
          matches: [{ context: 'A matching passage for the query.', match: { start: 2, end: 10 } }]
        },
        {
          filename: 'Favorites/Favourite match.md',
          matches: [{ context: 'Another matching passage.', match: { start: 1, end: 8 } }]
        }
      ]), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response('# Note\nFull note content', {
      status: 200,
      headers: { 'last-modified': 'Tue, 28 Jul 2026 12:00:00 GMT' }
    });
  };

  const result = await ObsidianClient.searchGlobalNotes(
    'https://127.0.0.1:27124',
    'test-api-key',
    'Test Vault',
    'matching',
    [
      { path: 'Personal', context: 'personal' },
      { path: 'Favorites', context: 'favorite' }
    ],
    'desktop'
  );

  assert.equal(result.kind, 'notes');
  if (result.kind !== 'notes') return;
  assert.deepEqual(result.notes.map(note => note.path), [
    'Personal/Matched note.md',
    'Favorites/Favourite match.md'
  ]);
  assert.deepEqual(result.notes.map(note => note.context), ['personal', 'favorite']);
  assert.equal(result.notes[0].preview, 'A matching passage for the query.');
  assert.equal(result.notes[0].modifiedAt, '2026-07-28T12:00:00.000Z');
  assert.equal(calls.filter(call => call.startsWith('POST ')).length, 1);
  assert.equal(calls.filter(call => call.startsWith('GET ')).length, 2);
});

test('desktop global search never reads matches outside permitted folder boundaries', async () => {
  const fileReads: string[] = [];
  const deeplyEncodedTraversal = encodeRepeatedly('..', 32);
  const deeplyEncodedAllowedPath = encodeRepeatedly('Personal/Deeply encoded allowed.md', 32);
  const deeplyEncodedAbsolutePath = encodeRepeatedly('/Private/Absolute.md', 32);
  const deeplyEncodedDrivePath = encodeRepeatedly('C:\\Private\\Drive.md', 32);
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/search/simple/')) {
      return new Response(JSON.stringify([
        { filename: 'Personal/Allowed.md', matches: [] },
        { filename: 'Personal/Subfolder/Also allowed.md', matches: [] },
        { filename: 'Personal Archive/Outside.md', matches: [] },
        { filename: 'Professional/Outside.md', matches: [] },
        { filename: 'Personal/../Private/Traversal.md', matches: [] },
        { filename: 'Personal/%252e%252e/Private/Encoded traversal.md', matches: [] },
        { filename: `Personal/${deeplyEncodedTraversal}/Private/Deep traversal.md`, matches: [] },
        { filename: deeplyEncodedAllowedPath, matches: [] },
        { filename: deeplyEncodedAbsolutePath, matches: [] },
        { filename: deeplyEncodedDrivePath, matches: [] },
        { filename: 'Private/Unsafe configured folder.md', matches: [] },
        { filename: 'Personal/not-markdown.txt', matches: [] }
      ]), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    fileReads.push(url);
    return new Response('Allowed content', {
      status: 200,
      headers: { 'last-modified': 'Tue, 28 Jul 2026 12:00:00 GMT' }
    });
  };

  const result = await ObsidianClient.searchGlobalNotes(
    'https://127.0.0.1:27124',
    'test-api-key',
    'Test Vault',
    'allowed',
    [
      { path: 'Personal', context: 'personal' },
      { path: '%2e%2e/Private', context: 'favorite' },
      { path: `${deeplyEncodedTraversal}/Private`, context: 'favorite' }
    ],
    'desktop'
  );

  assert.equal(result.kind, 'notes');
  if (result.kind !== 'notes') return;
  assert.deepEqual(result.notes.map(note => note.path), [
    'Personal/Allowed.md',
    'Personal/Subfolder/Also allowed.md',
    'Personal/Deeply encoded allowed.md'
  ]);
  assert.equal(fileReads.length, 3);
  assert.ok(fileReads.every(url => url.includes('/vault/Personal/')));
});

test('mobile global search returns an Obsidian search handoff without Local REST access', async () => {
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Local REST must not be called in mobile mode.');
  };

  const result = await ObsidianClient.searchGlobalNotes(
    '',
    '',
    'Test Vault',
    'reading notes',
    [{ path: 'Personal', context: 'personal' }],
    'mobile'
  );

  assert.deepEqual(result, {
    kind: 'mobile-handoff',
    uri: 'obsidian://search?vault=Test+Vault&query=reading+notes'
  });
  assert.equal(fetchCalls, 0);
});
