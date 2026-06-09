// Pure undo-record builders. The chrome.* execution (undoLast) is exercised in
// actions.test.mjs against a mock chrome; here we only test the pure planning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupUndo, sortUndo, dedupeUndo, ungroupUndo } from '../src/undo.js';

test('groupUndo records the ids that were grouped', () => {
  assert.deepEqual(groupUndo([3, 7, 9]), { action: 'group', tabIds: [3, 7, 9] });
});

test('sortUndo captures each tab id with its prior index', () => {
  const tabs = [{ id: 5, index: 0 }, { id: 8, index: 1 }, { id: 2, index: 2 }];
  assert.deepEqual(sortUndo(tabs), {
    action: 'sort',
    order: [{ id: 5, index: 0 }, { id: 8, index: 1 }, { id: 2, index: 2 }],
  });
});

test('dedupeUndo captures url + index of the tabs about to close', () => {
  const closed = [{ id: 4, url: 'https://x.com/a', index: 3 }, { id: 9, url: 'https://x.com/b', index: 6 }];
  assert.deepEqual(dedupeUndo(closed), {
    action: 'dedupe',
    closed: [{ url: 'https://x.com/a', index: 3 }, { url: 'https://x.com/b', index: 6 }],
  });
});

test('ungroupUndo clusters tabs by their original group, keeping title + color', () => {
  const groupedTabs = [
    { id: 1, groupId: 10 },
    { id: 2, groupId: 20 },
    { id: 3, groupId: 10 },
  ];
  const meta = { 10: { title: '💻 Dev', color: 'blue' }, 20: { title: '🎬 Media', color: 'purple' } };
  const rec = ungroupUndo(groupedTabs, meta);
  assert.equal(rec.action, 'ungroup');
  const dev = rec.clusters.find((c) => c.title === '💻 Dev');
  const media = rec.clusters.find((c) => c.title === '🎬 Media');
  assert.deepEqual(dev, { ids: [1, 3], title: '💻 Dev', color: 'blue' });
  assert.deepEqual(media, { ids: [2], title: '🎬 Media', color: 'purple' });
});
