// Guard against load-time breakage: every module the service worker and popup pull
// in must import cleanly in Node (no chrome.* is called at module top level). This
// would have caught the broken `import { CATEGORIES }` in ai.js that took down the
// whole service-worker graph (background -> actions -> ai) and the popup.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('every src module imports without a load-time error', async () => {
  await assert.doesNotReject(import('../src/categorize.js'));
  await assert.doesNotReject(import('../src/settings.js'));
  await assert.doesNotReject(import('../src/ai.js'));
  await assert.doesNotReject(import('../src/dataset.js'));
  await assert.doesNotReject(import('../src/actions.js'));
  await assert.doesNotReject(import('../src/undo.js'));
});
