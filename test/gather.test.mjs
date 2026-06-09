// Pure logic for cross-window "gather & group": scatter detection + move plan, and
// the gather undo record. No chrome.* here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planGather } from '../src/categorize.js';
import { gatherUndo } from '../src/undo.js';

const t = (id, url, windowId, index, extra = {}) => ({ id, url, title: '', windowId, index, pinned: false, ...extra });

test('planGather: only categories spanning 2+ windows are gathered', () => {
  const tabs = [
    t(1, 'https://github.com/a', 1, 0),   // dev, active window only -> left alone
    t(2, 'https://ebay.com/x', 1, 1),     // shopping, active window
    t(3, 'https://ebay.com/x', 2, 0),     // shopping, other window -> scattered, moves
    t(4, 'https://youtube.com/v', 2, 1),  // media, other window only -> left alone
  ];
  const { moves, groups } = planGather(tabs, { activeWindowId: 1, minGroupSize: 2 });

  // Only tab 3 (shopping, outside active window) is moved.
  assert.deepEqual(moves, [{ id: 3, fromWindowId: 2, fromIndex: 0 }]);

  // One scattered group: shopping, containing both eBay tabs.
  assert.equal(groups.length, 1);
  assert.equal(groups[0].color, 'yellow');
  assert.match(groups[0].label, /Shopping/);
  assert.deepEqual(groups[0].ids.sort(), [2, 3]);
});

test('planGather: nothing scattered -> no moves, no groups', () => {
  const tabs = [
    t(1, 'https://github.com/a', 1, 0),
    t(2, 'https://github.com/b', 1, 1),   // dev all in active window -> not scattered
    t(3, 'https://youtube.com/v', 2, 0),  // media all in window 2 -> not scattered
  ];
  const { moves, groups } = planGather(tabs, { activeWindowId: 1, minGroupSize: 2 });
  assert.deepEqual(moves, []);
  assert.deepEqual(groups, []);
});

test('planGather: skips pinned tabs and respects minGroupSize', () => {
  const tabs = [
    t(1, 'https://ebay.com/x', 1, 0, { pinned: true }), // pinned -> ignored
    t(2, 'https://ebay.com/y', 2, 0),                   // shopping count would be 1 non-pinned
  ];
  const { moves, groups } = planGather(tabs, { activeWindowId: 1, minGroupSize: 2 });
  assert.deepEqual(moves, []);
  assert.deepEqual(groups, []);
});

test('planGather: AI assignment makes an unknown-domain topic scatter', () => {
  const tabs = [
    t(1, 'https://dealcatcher.com/a', 1, 0), // unknown -> AI says shopping
    t(2, 'https://ebay.com/x', 2, 0),        // shopping
  ];
  const ai = new Map([[1, 'shopping']]);
  const { moves, groups } = planGather(tabs, { activeWindowId: 1, minGroupSize: 2, aiCategories: ai });
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].ids.sort(), [1, 2]);
  assert.deepEqual(moves, [{ id: 2, fromWindowId: 2, fromIndex: 0 }]);
});

test('gatherUndo records original window+index of moved tabs and all grouped ids', () => {
  const moved = [{ id: 3, fromWindowId: 2, fromIndex: 0 }, { id: 5, fromWindowId: 4, fromIndex: 7 }];
  assert.deepEqual(gatherUndo(moved, [2, 3, 5]), {
    action: 'gather',
    moves: [{ id: 3, windowId: 2, index: 0 }, { id: 5, windowId: 4, index: 7 }],
    groupedIds: [2, 3, 5],
  });
});
