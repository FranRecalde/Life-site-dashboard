import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  copyGlobalSearchQuery,
  startMobileHandoffFallbackMonitor,
} from './GlobalSearchControl';

class FakeEventSource {
  private readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    const typeListeners = this.listeners.get(type) || new Set<EventListener>();
    typeListeners.add(listener);
    this.listeners.set(type, typeListeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    this.listeners.get(type)?.forEach(listener => listener(new Event(type)));
  }

  count(type: string): number {
    return this.listeners.get(type)?.size || 0;
  }
}

test('mobile handoff offers copy fallback when the page stays visible', () => {
  const pageTarget = new FakeEventSource();
  const visibilityTarget = new FakeEventSource();
  let scheduledCallback: (() => void) | null = null;
  let fallbackCalls = 0;
  const cancelledHandles: unknown[] = [];

  startMobileHandoffFallbackMonitor({
    pageTarget,
    visibilityTarget,
    isPageHidden: () => false,
    schedule: callback => {
      scheduledCallback = callback;
      return 'handoff-timer';
    },
    cancelScheduled: handle => {
      cancelledHandles.push(handle);
    },
    onFallback: () => {
      fallbackCalls += 1;
    },
  });

  assert.equal(pageTarget.count('pagehide'), 1);
  assert.equal(visibilityTarget.count('visibilitychange'), 1);
  assert.ok(scheduledCallback);
  scheduledCallback();

  assert.equal(fallbackCalls, 1);
  assert.deepEqual(cancelledHandles, ['handoff-timer']);
  assert.equal(pageTarget.count('pagehide'), 0);
  assert.equal(visibilityTarget.count('visibilitychange'), 0);
});

test('mobile handoff does not offer copy fallback after Obsidian hides the page', () => {
  const pageTarget = new FakeEventSource();
  const visibilityTarget = new FakeEventSource();
  let pageHidden = false;
  let scheduledCallback: (() => void) | null = null;
  let fallbackCalls = 0;

  startMobileHandoffFallbackMonitor({
    pageTarget,
    visibilityTarget,
    isPageHidden: () => pageHidden,
    schedule: callback => {
      scheduledCallback = callback;
      return 'handoff-timer';
    },
    cancelScheduled: () => undefined,
    onFallback: () => {
      fallbackCalls += 1;
    },
  });

  pageHidden = true;
  visibilityTarget.dispatch('visibilitychange');
  assert.ok(scheduledCallback);
  scheduledCallback();

  assert.equal(fallbackCalls, 0);
  assert.equal(pageTarget.count('pagehide'), 0);
  assert.equal(visibilityTarget.count('visibilitychange'), 0);
});

test('mobile handoff cleanup prevents a stale fallback on retry or unmount', () => {
  const pageTarget = new FakeEventSource();
  const visibilityTarget = new FakeEventSource();
  let scheduledCallback: (() => void) | null = null;
  let fallbackCalls = 0;
  let cancellationCalls = 0;

  const cleanup = startMobileHandoffFallbackMonitor({
    pageTarget,
    visibilityTarget,
    isPageHidden: () => false,
    schedule: callback => {
      scheduledCallback = callback;
      return 'handoff-timer';
    },
    cancelScheduled: () => {
      cancellationCalls += 1;
    },
    onFallback: () => {
      fallbackCalls += 1;
    },
  });

  cleanup();
  cleanup();
  assert.ok(scheduledCallback);
  scheduledCallback();

  assert.equal(fallbackCalls, 0);
  assert.equal(cancellationCalls, 1);
  assert.equal(pageTarget.count('pagehide'), 0);
  assert.equal(visibilityTarget.count('visibilitychange'), 0);
});

test('copy-query fallback copies the trimmed query and reports clipboard failures', async () => {
  const copiedValues: string[] = [];
  await copyGlobalSearchQuery('  reading notes  ', {
    writeText: async value => {
      copiedValues.push(value);
    },
  });
  assert.deepEqual(copiedValues, ['reading notes']);

  await assert.rejects(
    copyGlobalSearchQuery('reading notes', undefined),
    /Clipboard access is unavailable/
  );
  await assert.rejects(
    copyGlobalSearchQuery('reading notes', {
      writeText: async () => {
        throw new Error('denied');
      },
    }),
    /denied/
  );
});
