// Browser-facing actions. These touch chrome.* and are driven from the popup, the
// keyboard command, or the context menu. All pure decision logic lives in
// categorize.js; user config in settings.js.

import { planGroups, findDuplicateTabIds, sortKey, categorize, categoryMeta, registrableDomain }
  from './categorize.js';
import { loadSettings } from './settings.js';
import { aiAvailable, aiCategorize } from './ai.js';

const currentWindowTabs = () => chrome.tabs.query({ currentWindow: true });

// Group all tabs in the current window into native tab groups by smart category.
export async function groupTabs({ useAi = false } = {}) {
  const settings = await loadSettings();
  const tabs = await currentWindowTabs();
  const groupable = tabs.filter((t) => !t.pinned && t.id != null);

  let aiCategories = null;
  if (useAi && (await aiAvailable())) {
    const leftovers = groupable.filter((t) => !categorize(t, settings.categories))
      .map((t) => ({ id: t.id, url: t.url || '', title: t.title || '' }));
    aiCategories = await aiCategorize(leftovers);
  }

  const plan = planGroups(groupable, {
    minGroupSize: settings.minGroupSize, aiCategories, categories: settings.categories,
  });
  let groupsMade = 0;
  let tabsGrouped = 0;
  for (const g of plan) {
    if (!g.ids.length) continue;
    const groupId = await chrome.tabs.group({ tabIds: g.ids });
    await chrome.tabGroups.update(groupId, { title: g.label, color: g.color });
    groupsMade += 1;
    tabsGrouped += g.ids.length;
  }
  return { groupsMade, tabsGrouped, total: groupable.length };
}

// Remove every tab group in the current window (tabs stay open).
export async function ungroupAll() {
  const tabs = await currentWindowTabs();
  const grouped = tabs.filter((t) => t.groupId != null && t.groupId !== -1).map((t) => t.id);
  if (grouped.length) await chrome.tabs.ungroup(grouped);
  return { ungrouped: grouped.length };
}

// Reorder tabs so related ones are adjacent (category -> domain -> title).
export async function sortTabs() {
  const settings = await loadSettings();
  const tabs = await currentWindowTabs();
  const movable = tabs.filter((t) => !t.pinned);
  const pinnedCount = tabs.length - movable.length;
  const ordered = [...movable].sort((a, b) => sortKey(a, settings.categories).localeCompare(sortKey(b, settings.categories)));
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
  if (dupes.length) await chrome.tabs.remove(dupes);
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

    const catId = categorize(bm, settings.categories);
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
