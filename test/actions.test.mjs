// Integration tests for the chrome.* orchestration in actions.js, driven by an
// in-memory mock chrome. Covers each action's effect AND its undo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMockChrome } from './mock-chrome.mjs';
import {
  groupTabs, ungroupAll, sortTabs, dedupeTabs, saveSession, organizeBookmarks,
} from '../src/actions.js';
import { undoLast, getUndo } from '../src/undo.js';

const tab = (id, url, extra = {}) => ({ id, url, title: '', ...extra });
const idsInOrder = (state) => state.tabs.map((t) => t.id);

test('groupTabs groups related tabs, skips pinned, and undo ungroups them', async () => {
  const state = installMockChrome({ tabs: [
    tab(1, 'https://github.com/a'),
    tab(2, 'https://stackoverflow.com/q'),
    tab(3, 'https://youtube.com/x', { pinned: true }), // pinned -> untouched
  ] });
  const r = await groupTabs();
  assert.equal(r.groupsMade, 1);
  assert.equal(r.tabsGrouped, 2);
  assert.equal(state.tabs.find((t) => t.id === 3).groupId, -1, 'pinned tab not grouped');
  assert.notEqual(state.tabs.find((t) => t.id === 1).groupId, -1, 'tab 1 grouped');

  await undoLast();
  assert.equal(state.tabs.find((t) => t.id === 1).groupId, -1, 'undo ungrouped tab 1');
  assert.equal(await getUndo(), null, 'undo record cleared after replay');
});

test('sortTabs reorders by category and undo restores original order', async () => {
  const state = installMockChrome({ tabs: [
    tab(1, 'https://youtube.com/x'),   // media (late)
    tab(2, 'https://github.com/a'),    // dev (early)
    tab(3, 'https://news.ycombinator.com/'), // news (mid)
  ] });
  const before = idsInOrder(state);
  await sortTabs();
  assert.deepEqual(idsInOrder(state), [2, 1, 3], 'dev, media, news order');

  await undoLast();
  assert.deepEqual(idsInOrder(state), before, 'undo restored original order');
});

test('dedupeTabs closes later duplicates and undo reopens them', async () => {
  const state = installMockChrome({ tabs: [
    tab(1, 'https://x.com/a'),
    tab(2, 'https://x.com/a#frag'), // dup of 1
    tab(3, 'https://x.com/b'),
  ] });
  const r = await dedupeTabs();
  assert.equal(r.closed, 1);
  assert.equal(state.tabs.length, 2);

  await undoLast();
  assert.equal(state.tabs.length, 3, 'undo reopened the closed tab');
  assert.ok(state.tabs.some((t) => t.url === 'https://x.com/a#frag'), 'closed url restored');
});

test('ungroupAll clears groups and undo rebuilds them with title + color', async () => {
  const state = installMockChrome({ tabs: [
    tab(1, 'https://github.com/a'),
    tab(2, 'https://stackoverflow.com/q'),
  ] });
  await groupTabs();
  const gid = state.tabs[0].groupId;
  const r = await ungroupAll();
  assert.equal(r.ungrouped, 2);
  assert.equal(state.tabs[0].groupId, -1);

  await undoLast();
  assert.notEqual(state.tabs[0].groupId, -1, 'undo regrouped the tabs');
  const newGid = state.tabs[0].groupId;
  assert.equal(state.groups[newGid].title, state.groups[gid] ? state.groups[gid].title : '💻 Dev');
  assert.equal(state.groups[newGid].color, 'blue');
});

test('saveSession writes every http tab into a dated session folder', async () => {
  const state = installMockChrome({ tabs: [
    tab(1, 'https://a.com/'),
    tab(2, 'chrome://extensions'), // skipped (not http)
    tab(3, 'https://b.com/'),
  ] });
  const r = await saveSession();
  assert.equal(r.saved, 2);
});

const winOf = async (id) => (await chrome.tabs.query({})).find((t) => t.id === id)?.windowId;

test('groupTabs with groupAcrossWindows merges a split category and groups every window', async () => {
  installMockChrome({ currentWindowId: 1, tabs: [
    tab(1, 'https://ebay.com/a', { windowId: 1 }),   // shopping
    tab(2, 'https://amazon.com/x', { windowId: 1 }), // shopping
    tab(3, 'https://ebay.com/b', { windowId: 2 }),   // shopping, other window -> should merge in
    tab(4, 'https://github.com/a', { windowId: 2 }), // dev, single-window -> stays/groups in window 2
    tab(5, 'https://gitlab.com/a', { windowId: 2 }), // dev
  ] });
  await chrome.storage.sync.set({ settings: { groupAcrossWindows: true, useAiByDefault: false } });

  const r = await groupTabs();
  assert.equal(r.merged, 1, 'one shopping tab pulled from window 2');
  assert.equal(await winOf(3), 1, 'eBay tab moved into the active window');
  // The 3 shopping tabs share one group in window 1.
  const all = await chrome.tabs.query({});
  const shop = all.filter((t) => [1, 2, 3].includes(t.id)).map((t) => t.groupId);
  assert.equal(new Set(shop).size, 1, 'all shopping tabs in a single group');
  assert.notEqual(shop[0], -1);
  // The dev tabs (only in window 2) still got grouped, in window 2.
  const dev = all.filter((t) => [4, 5].includes(t.id));
  assert.equal(new Set(dev.map((t) => t.groupId)).size, 1, 'dev tabs grouped together');
  assert.equal(dev[0].windowId, 2, 'dev group stays in window 2');

  await undoLast();
  assert.equal(await winOf(3), 2, 'undo returns the merged tab to its window');
});

test('organizeBookmarks files loose bookmarks into category folders and drops dup urls', async () => {
  installMockChrome({ bookmarks: [
    { title: 'GitHub', url: 'https://github.com/a' },
    { title: 'GitHub dup', url: 'https://github.com/a' }, // dup -> removed
    { title: 'YouTube', url: 'https://youtube.com/x' },
  ] });
  const r = await organizeBookmarks();
  assert.equal(r.filed, 2, 'two unique bookmarks filed');
  assert.equal(r.deduped, 1, 'one duplicate removed');
});
