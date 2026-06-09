// Browser-facing actions. These touch chrome.* and are driven from the popup, the
// keyboard command, or the context menu. All pure decision logic lives in
// categorize.js; user config in settings.js.

import { planGroups, planGather, findDuplicateTabIds, sortKey, categorize } from './categorize.js';
import { loadSettings } from './settings.js';
import { loadDomainIndex } from './dataset.js';
import { aiAvailable, aiCategorize } from './ai.js';
import { groupUndo, sortUndo, dedupeUndo, ungroupUndo, gatherUndo, setUndo, undoLast } from './undo.js';

export { undoLast as undo };

const currentWindowTabs = () => chrome.tabs.query({ currentWindow: true });

// Ungroup the given tabs so grouping starts from a clean slate. Chrome's tabs.group won't pull
// already-grouped tabs into a new group, so without this a re-group leaves the old group and
// spawns a duplicate (two "Shopping" groups). Clearing first guarantees one group per category.
async function ungroupFirst(tabs) {
  const ids = tabs.filter((t) => t.groupId != null && t.groupId !== -1).map((t) => t.id);
  if (ids.length) await chrome.tabs.ungroup(ids);
}

// Group all tabs in the current window into native tab groups by smart category.
// `useAi` defaults to the user's setting (on-device AI runs when available; no-op otherwise),
// so the keyboard shortcut / context menu / auto-group get the smart pass too.
export async function groupTabs({ useAi } = {}) {
  const settings = await loadSettings();
  if (settings.groupAcrossWindows) return groupAcrossWindows({ useAi });
  const domainIndex = await loadDomainIndex(settings.categories);
  const wantAi = useAi === undefined ? settings.useAiByDefault : useAi;
  const tabs = await currentWindowTabs();
  const groupable = tabs.filter((t) => !t.pinned && t.id != null);

  let aiCategories = null;
  if (wantAi && (await aiAvailable())) {
    const leftovers = groupable.filter((t) => !categorize(t, settings.categories, domainIndex))
      .map((t) => ({ id: t.id, url: t.url || '', title: t.title || '' }));
    aiCategories = await aiCategorize(leftovers, settings.categories);
  }

  await ungroupFirst(groupable);
  const plan = planGroups(groupable, {
    minGroupSize: settings.minGroupSize, aiCategories, categories: settings.categories, domainIndex,
  });
  let groupsMade = 0;
  let tabsGrouped = 0;
  const grouped = [];
  for (const g of plan) {
    if (!g.ids.length) continue;
    const groupId = await chrome.tabs.group({ tabIds: g.ids });
    await chrome.tabGroups.update(groupId, { title: g.label, color: g.color });
    groupsMade += 1;
    tabsGrouped += g.ids.length;
    grouped.push(...g.ids);
  }
  if (grouped.length) await setUndo(groupUndo(grouped));
  return { groupsMade, tabsGrouped, total: groupable.length };
}

// "Group across all windows" mode: merge categories scattered over 2+ windows into the active
// window, then group every window in place. One undo restores the original windows + groups.
export async function groupAcrossWindows({ useAi } = {}) {
  const settings = await loadSettings();
  const domainIndex = await loadDomainIndex(settings.categories);
  const wantAi = useAi === undefined ? settings.useAiByDefault : useAi;
  const activeWindowId = (await chrome.windows.getCurrent()).id;
  const usable = (await chrome.tabs.query({})).filter((t) => !t.pinned && t.id != null && /^https?:/.test(t.url || ''));

  let aiCategories = null;
  if (wantAi && (await aiAvailable())) {
    const leftovers = usable.filter((t) => !categorize(t, settings.categories, domainIndex))
      .map((t) => ({ id: t.id, url: t.url || '', title: t.title || '' }));
    aiCategories = await aiCategorize(leftovers, settings.categories);
  }

  // 1) Pull scattered-category tabs into the active window (don't group yet).
  const { moves } = planGather(usable, {
    activeWindowId, minGroupSize: settings.minGroupSize, categories: settings.categories, aiCategories, domainIndex,
  });
  for (const m of moves) await chrome.tabs.move(m.id, { windowId: activeWindowId, index: -1 });

  // 2) Clean slate, then group every window in place — the active window now holds the moved-in tabs.
  const afterMove = await chrome.tabs.query({});
  await ungroupFirst(afterMove.filter((t) => !t.pinned && t.id != null));
  const byWindow = new Map();
  for (const t of await chrome.tabs.query({})) {
    if (t.pinned || t.id == null) continue;
    if (!byWindow.has(t.windowId)) byWindow.set(t.windowId, []);
    byWindow.get(t.windowId).push(t);
  }
  const grouped = [];
  let groupsMade = 0;
  let tabsGrouped = 0;
  for (const [, wtabs] of byWindow) {
    const plan = planGroups(wtabs, {
      minGroupSize: settings.minGroupSize, aiCategories, categories: settings.categories, domainIndex,
    });
    for (const g of plan) {
      if (!g.ids.length) continue;
      const groupId = await chrome.tabs.group({ tabIds: g.ids });
      await chrome.tabGroups.update(groupId, { title: g.label, color: g.color });
      grouped.push(...g.ids);
      groupsMade += 1;
      tabsGrouped += g.ids.length;
    }
  }
  if (moves.length || grouped.length) await setUndo(gatherUndo(moves, grouped));
  return { mode: 'cross', merged: moves.length, fromWindows: new Set(moves.map((m) => m.fromWindowId)).size, groupsMade, tabsGrouped };
}

// Remove every tab group in the current window (tabs stay open).
export async function ungroupAll() {
  const tabs = await currentWindowTabs();
  const grouped = tabs.filter((t) => t.groupId != null && t.groupId !== -1);
  if (grouped.length) {
    const meta = {};
    for (const g of await chrome.tabGroups.query({})) meta[g.id] = { title: g.title, color: g.color };
    await setUndo(ungroupUndo(grouped.map((t) => ({ id: t.id, groupId: t.groupId })), meta));
    await chrome.tabs.ungroup(grouped.map((t) => t.id));
  }
  return { ungrouped: grouped.length };
}

// Reorder tabs so related ones are adjacent (category -> domain -> title).
export async function sortTabs() {
  const settings = await loadSettings();
  const domainIndex = await loadDomainIndex(settings.categories);
  const tabs = await currentWindowTabs();
  const movable = tabs.filter((t) => !t.pinned);
  const pinnedCount = tabs.length - movable.length;
  const ordered = [...movable].sort((a, b) => sortKey(a, settings.categories, domainIndex).localeCompare(sortKey(b, settings.categories, domainIndex)));
  if (movable.length) await setUndo(sortUndo(movable));
  for (let i = 0; i < ordered.length; i += 1) {
    await chrome.tabs.move(ordered[i].id, { index: pinnedCount + i });
  }
  return { sorted: ordered.length };
}

// Close duplicate tabs (keeps the first occurrence; never closes pinned tabs).
export async function dedupeTabs() {
  const tabs = await currentWindowTabs();
  const candidates = tabs.filter((t) => !t.pinned);
  const dupes = findDuplicateTabIds(candidates);
  if (dupes.length) {
    const dupeSet = new Set(dupes);
    await setUndo(dedupeUndo(candidates.filter((t) => dupeSet.has(t.id))));
    await chrome.tabs.remove(dupes);
  }
  return { closed: dupes.length };
}

// Save all tabs in the current window as a dated bookmark folder.
export async function saveSession() {
  const tabs = await currentWindowTabs();
  const saveable = tabs.filter((t) => /^https?:/.test(t.url || ''));
  const parent = await ensureFolder('Tab Organizer Sessions', '2'); // '2' = Other Bookmarks
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const folder = await chrome.bookmarks.create({ parentId: parent.id, title: `Session ${stamp}` });
  for (const t of saveable) {
    await chrome.bookmarks.create({ parentId: folder.id, title: t.title || t.url, url: t.url });
  }
  return { saved: saveable.length, folder: folder.title };
}

// Auto-group on startup / new window (called by background.js when enabled in settings).
export async function maybeAutoGroup() {
  const settings = await loadSettings();
  if (!settings.autoGroupOnStartup) return;
  await groupTabs({ useAi: settings.useAiByDefault });
}

async function ensureFolder(title, parentId) {
  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = children.find((c) => !c.url && c.title === title);
  if (existing) return existing;
  return chrome.bookmarks.create({ parentId, title });
}
