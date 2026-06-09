// Undo support for the destructive tab actions. The record *builders* are pure (and
// unit-tested in undo.test.mjs); persistence and replay touch chrome.* and are kept
// thin. One record is kept at a time in chrome.storage.session (cleared on browser
// restart) so the popup can offer "Undo last" even after it has been reopened.

const UNDO_KEY = 'lastUndo';

// --- PURE record builders ---

// Group: undo = ungroup exactly the tabs this action grouped.
export function groupUndo(tabIds) {
  return { action: 'group', tabIds: [...tabIds] };
}

// Sort: undo = move each tab back to the index it held before.
export function sortUndo(tabsWithIndex) {
  return { action: 'sort', order: tabsWithIndex.map((t) => ({ id: t.id, index: t.index })) };
}

// Dedupe: undo = reopen each closed url at the index it occupied (new tab ids).
export function dedupeUndo(closedTabs) {
  return { action: 'dedupe', closed: closedTabs.map((t) => ({ url: t.url, index: t.index })) };
}

// Gather: undo = ungroup, then move each pulled-in tab back to its original window+slot.
export function gatherUndo(movedTabs, groupedIds) {
  return {
    action: 'gather',
    moves: movedTabs.map((t) => ({ id: t.id, windowId: t.fromWindowId, index: t.fromIndex })),
    groupedIds: [...groupedIds],
  };
}

// Ungroup-all: undo = rebuild each original group (tab ids survive ungrouping).
export function ungroupUndo(groupedTabs, groupMeta) {
  const byGroup = new Map();
  for (const t of groupedTabs) {
    if (!byGroup.has(t.groupId)) {
      const m = groupMeta[t.groupId] || {};
      byGroup.set(t.groupId, { ids: [], title: m.title || '', color: m.color || 'grey' });
    }
    byGroup.get(t.groupId).ids.push(t.id);
  }
  return { action: 'ungroup', clusters: [...byGroup.values()] };
}

// --- chrome.storage.session glue ---

export async function setUndo(record) {
  await chrome.storage.session.set({ [UNDO_KEY]: record });
}
export async function getUndo() {
  const got = await chrome.storage.session.get(UNDO_KEY);
  return got[UNDO_KEY] || null;
}
export async function clearUndo() {
  await chrome.storage.session.remove(UNDO_KEY);
}

// --- replay ---

// Apply the stored undo record, then clear it. Returns { undone, action } or
// { undone: false } when there is nothing to undo.
export async function undoLast() {
  const rec = await getUndo();
  if (!rec) return { undone: false };

  if (rec.action === 'group') {
    if (rec.tabIds.length) await chrome.tabs.ungroup(rec.tabIds);
  } else if (rec.action === 'sort') {
    for (const { id, index } of rec.order) await chrome.tabs.move(id, { index });
  } else if (rec.action === 'dedupe') {
    for (const { url, index } of rec.closed) await chrome.tabs.create({ url, index, active: false });
  } else if (rec.action === 'ungroup') {
    for (const c of rec.clusters) {
      if (!c.ids.length) continue;
      const groupId = await chrome.tabs.group({ tabIds: c.ids });
      await chrome.tabGroups.update(groupId, { title: c.title, color: c.color });
    }
  } else if (rec.action === 'gather') {
    if (rec.groupedIds.length) await chrome.tabs.ungroup(rec.groupedIds);
    for (const m of rec.moves) {
      try { await chrome.tabs.move(m.id, { windowId: m.windowId, index: m.index }); }
      catch { /* source window may be gone; best-effort */ }
    }
  }

  await clearUndo();
  return { undone: true, action: rec.action };
}
