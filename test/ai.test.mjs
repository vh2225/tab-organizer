// Exercises the on-device AI pass against a fake LanguageModel global (no real model).
// Guards that we declare an output language (Chrome warns otherwise) and that confident
// answers map back to category ids.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiCategorize, aiAvailable, availabilityStatus, downloadModel } from '../src/ai.js';
import { DEFAULT_CATEGORIES } from '../src/categorize.js';

function fakeModel(answer, availability = 'available') {
  const calls = { create: null, availability: null };
  globalThis.LanguageModel = {
    availability: async (opts) => { calls.availability = opts; return availability; },
    create: async (opts) => {
      calls.create = opts;
      return { prompt: async () => answer, destroy() {} };
    },
  };
  return calls;
}

test('aiCategorize declares an English output language on the session', async () => {
  const calls = fakeModel('shopping');
  await aiCategorize([{ id: 1, url: 'https://dealcatcher.com', title: 'Deals' }], DEFAULT_CATEGORIES);
  assert.deepEqual(calls.create.expectedOutputs, [{ type: 'text', languages: ['en'] }]);
  assert.deepEqual(calls.create.expectedInputs, [{ type: 'text', languages: ['en'] }]);
});

test('aiCategorize maps a confident answer to its category id', async () => {
  fakeModel('shopping');
  const out = await aiCategorize([{ id: 7, url: 'https://dealcatcher.com', title: 'Deals' }], DEFAULT_CATEGORIES);
  assert.equal(out.get(7), 'shopping');
});

test('aiCategorize ignores an answer that is not a known category id', async () => {
  fakeModel('banana');
  const out = await aiCategorize([{ id: 7, url: 'https://x.com', title: 't' }], DEFAULT_CATEGORIES);
  assert.equal(out.has(7), false);
});

test('aiCategorize returns an empty map with no items', async () => {
  fakeModel('shopping');
  const out = await aiCategorize([], DEFAULT_CATEGORIES);
  assert.equal(out.size, 0);
});

test('aiAvailable is true only when the model is ready, not while downloading', async () => {
  fakeModel('shopping', 'available');
  assert.equal(await aiAvailable(), true);
  fakeModel('shopping', 'downloadable');
  assert.equal(await aiAvailable(), false, 'downloadable must not count as ready (would block on download)');
  fakeModel('shopping', 'downloading');
  assert.equal(await aiAvailable(), false);
});

test('availabilityStatus surfaces the raw model state for accurate UI messaging', async () => {
  fakeModel('shopping', 'downloading');
  assert.equal(await availabilityStatus(), 'downloading');
  globalThis.LanguageModel = undefined;
  assert.equal(await availabilityStatus(), 'unavailable');
});

test('availabilityStatus declares the language on the availability() request (no Chrome warning)', async () => {
  const calls = fakeModel('shopping', 'available');
  await availabilityStatus();
  assert.deepEqual(calls.availability.expectedOutputs, [{ type: 'text', languages: ['en'] }]);
  assert.deepEqual(calls.availability.expectedInputs, [{ type: 'text', languages: ['en'] }]);
});

test('downloadModel declares the language on its create() request', async () => {
  const calls = fakeModel('shopping', 'available');
  await downloadModel(() => {});
  assert.deepEqual(calls.create.expectedOutputs, [{ type: 'text', languages: ['en'] }]);
});

test('downloadModel streams download progress (0..1) and resolves true when ready', async () => {
  globalThis.LanguageModel = {
    availability: async () => 'downloading',
    create: async (opts) => {
      const listeners = {};
      opts.monitor?.({ addEventListener: (ev, cb) => { listeners[ev] = cb; } });
      listeners.downloadprogress?.({ loaded: 0.25 });
      listeners.downloadprogress?.({ loaded: 1 });
      return { destroy() {} };
    },
  };
  const seen = [];
  const ok = await downloadModel((loaded) => seen.push(loaded));
  assert.equal(ok, true);
  assert.deepEqual(seen, [0.25, 1]);
});

test('downloadModel returns false when there is no model API', async () => {
  globalThis.LanguageModel = undefined;
  assert.equal(await downloadModel(() => {}), false);
});

test('aiCategorize gives up at the deadline instead of hanging on a slow model', async () => {
  // Model whose prompt() never resolves — the action must not freeze.
  globalThis.LanguageModel = {
    availability: async () => 'available',
    create: async () => ({ prompt: () => new Promise(() => {}), destroy() {} }),
  };
  const out = await aiCategorize(
    [{ id: 1, url: 'https://x.com', title: 't' }], DEFAULT_CATEGORIES, { deadlineMs: 30 },
  );
  assert.equal(out.size, 0, 'returns (empty) rather than hanging');
});
