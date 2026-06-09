// Browser-facing actions. These touch chrome.* and are driven from the popup, the
// keyboard command, or the context menu. All pure decision logic lives in
// categorize.js; user config in settings.js.

import { planGroups, planGather, findDuplicateTabIds, sortKey, categorize, categoryMeta, registrableDomain }
  from './categorize.js';
import { loadSettings } from './settings.js';
import { loadDomainIndex } from './dataset.js';
import { aiAvailable, aiCategorize } from './ai.js';
import { groupUndo, sortUndo, dedupeUndo, ungroupUndo, gatherUndo, setUndo, undoLast } from './undo.js';

export { undoLast as undo };

const currentWindowTabs = () => chrome.tabs.query({ currentWindow: true });

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

  // 2) Group every window in place — the active window now also holds the moved-in tabs.
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

// Cross-window "gather & group": pull tabs of any category that is scattered across 2+
// windows into the active window and group them. Single-window topics are left untouched.
export async function gatherAndGroup({ useAi } = {}) {
  const settings = await loadSettings();
  const domainIndex = await loadDomainIndex(settings.categories);
  const wantAi = useAi === undefined ? settings.useAiByDefault : useAi;
  const activeWindowId = (await chrome.windows.getCurrent()).id;
  const all = await chrome.tabs.query({});
  const usable = all.filter((t) => !t.pinned && t.id != null && /^https?:/.test(t.url || ''));

  let aiCategories = null;
  if (wantAi && (await aiAvailable())) {
    const leftovers = usable.filter((t) => !categorize(t, settings.categories, domainIndex))
      .map((t) => ({ id: t.id, url: t.url || '', title: t.title || '' }));
    aiCategories = await aiCategorize(leftovers, settings.categories);
  }

  const { moves, groups } = planGather(usable, {
    activeWindowId, minGroupSize: settings.minGroupSize, categories: settings.categories, aiCategories, domainIndex,
  });
  if (!groups.length) return { merged: 0, fromWindows: 0, groupsMade: 0 };

  const groupedIds = groups.flatMap((g) => g.ids);
  await setUndo(gatherUndo(moves, groupedIds));

  const fromWindows = new Set(moves.map((m) => m.fromWindowId)).size;
  for (const m of moves) await chrome.tabs.move(m.id, { windowId: activeWindowId, index: -1 });
  for (const g of groups) {
    const groupId = await chrome.tabs.group({ tabIds: g.ids });
    await chrome.tabGroups.update(groupId, { title: g.label, color: g.color });
  }
  return { merged: moves.length, fromWindows, groupsMade: groups.length };
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

// File loose bookmarks in a target folder into category subfolders + drop dup URLs.
export async function organizeBookmarks({ parentId } = {}) {
  const settings = await loadSettings();
  const domainIndex = await loadDomainIndex(settings.categories);
  const target = parentId || settings.bookmarkParentId || '2';
  const children = await chrome.bookmarks.getChildren(target);
  const loose = children.filter((c) => c.url);
  const seen = new Set();
  let filed = 0;
  let deduped = 0;
  const folderCache = new Map();

  const folderFor = async (label) => {
    if (folderCache.has(label)) return folderCache.get(label);
    const f = await ensureFolder(label, target);
    folderCache.set(label, f);
    return f;
  };

  for (const bm of loose) {
    const norm = (bm.url || '').replace(/#.*$/, '').replace(/\/$/, '');
    if (seen.has(norm)) { await chrome.bookmarks.remove(bm.id); deduped += 1; continue; }
    seen.add(norm);

    const catId = categorize(bm, settings.categories, domainIndex);
    let label;
    if (catId) { const m = categoryMeta(catId, settings.categories); label = `${m.emoji} ${m.label}`; }
    else { const dom = registrableDomain(bm.url); label = dom ? `🔖 ${dom}` : '🔖 Other'; }

    const folder = await folderFor(label);
    await chrome.bookmarks.move(bm.id, { parentId: folder.id });
    filed += 1;
  }
  return { filed, deduped };
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
