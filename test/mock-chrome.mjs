// A small in-memory `chrome` for exercising actions.js / undo.js in Node. Models just
// enough of tabs, tabGroups, bookmarks, windows, and storage to drive the real action
// code — including multiple windows and cross-window tab moves.
//
// Tabs are stored per-window (windowId -> ordered array); a tab's `index` is its position
// in that window. `state.tabs` is a getter that flattens all windows in (windowId, index)
// order and returns the live tab objects, so existing single-window assertions still work.
export function installMockChrome({ tabs = [], bookmarks = [], currentWindowId = 1 } = {}) {
  let nextTabId = Math.max(0, ...tabs.map((t) => t.id || 0)) + 1;
  let nextGroupId = 100;
  const groups = {};
  const windows = new Map(); // windowId -> [tab, ...]
  const winArr = (id) => { if (!windows.has(id)) windows.set(id, []); return windows.get(id); };
  for (const t of tabs) {
    const { windowId = currentWindowId, ...rest } = t;
    winArr(windowId).push({ pinned: false, groupId: -1, title: '', ...rest });
  }
  const findTab = (id) => {
    for (const [windowId, arr] of windows) {
      const i = arr.findIndex((t) => t.id === id);
      if (i !== -1) return { windowId, arr, i, tab: arr[i] };
    }
    return null;
  };

  const state = {
    groups,
    windows,
    get tabs() { // flattened live tab objects, window by window, in order
      const out = [];
      for (const wid of [...windows.keys()].sort((a, b) => a - b)) out.push(...windows.get(wid));
      return out;
    },
  };

  const tabsApi = {
    query: async (info = {}) => {
      const out = [];
      for (const wid of [...windows.keys()].sort((a, b) => a - b)) {
        if (info.currentWindow && wid !== currentWindowId) continue;
        windows.get(wid).forEach((t, index) => out.push({ ...t, windowId: wid, index }));
      }
      return out;
    },
    group: async ({ tabIds, groupId }) => {
      const gid = groupId != null ? groupId : nextGroupId++;
      let win;
      for (const id of tabIds) {
        const f = findTab(id);
        if (!f) continue;
        // Matches Chrome: a brand-new group only picks up tabs that aren't already grouped.
        if (groupId == null && f.tab.groupId !== -1) continue;
        f.tab.groupId = gid;
        win = f.windowId;
      }
      if (groupId == null && win != null) groups[gid] = { ...(groups[gid] || {}), windowId: win };
      return gid;
    },
    ungroup: async (ids) => {
      for (const id of (Array.isArray(ids) ? ids : [ids])) { const f = findTab(id); if (f) f.tab.groupId = -1; }
    },
    move: async (id, { index, windowId }) => {
      const f = findTab(id);
      if (!f) return;
      if (windowId != null && windowId !== f.windowId) f.tab.groupId = -1; // leaving a window ungroups it
      f.arr.splice(f.i, 1);
      const dest = winArr(windowId ?? f.windowId);
      if (index == null || index < 0 || index > dest.length) dest.push(f.tab);
      else dest.splice(index, 0, f.tab);
    },
    remove: async (ids) => {
      for (const id of (Array.isArray(ids) ? ids : [ids])) { const f = findTab(id); if (f) f.arr.splice(f.i, 1); }
    },
    create: async ({ url, index, windowId = currentWindowId, title = '' }) => {
      const tab = { id: nextTabId++, url, title, pinned: false, groupId: -1 };
      const dest = winArr(windowId);
      if (index == null || index < 0 || index > dest.length) dest.push(tab);
      else dest.splice(index, 0, tab);
      return { ...tab, windowId, index };
    },
  };
  const tabGroupsApi = {
    update: async (groupId, { title, color }) => { groups[groupId] = { ...(groups[groupId] || {}), title, color }; },
    query: async (info = {}) => {
      const live = new Set(state.tabs.map((t) => t.groupId).filter((g) => g != null && g !== -1));
      return Object.entries(groups)
        .filter(([id]) => live.has(Number(id)))
        .map(([id, g]) => ({ id: Number(id), ...g }))
        .filter((g) => (info.windowId == null || g.windowId === info.windowId) && (info.title == null || g.title === info.title));
    },
  };
  const windowsApi = { getCurrent: async () => ({ id: currentWindowId }) };

  // --- bookmarks: node map; root children seeded under parentId '2' (Other Bookmarks) ---
  let nextBmId = 1000;
  const nodes = new Map();
  nodes.set('2', { id: '2', title: 'Other Bookmarks', children: [] });
  const addNode = (node) => {
    nodes.set(node.id, node);
    const parent = nodes.get(node.parentId);
    if (parent) (parent.children ||= []).push(node.id);
  };
  bookmarks.forEach((b) => addNode({ id: String(nextBmId++), parentId: '2', children: b.url ? undefined : [], ...b }));
  const bookmarksApi = {
    getChildren: async (id) => (nodes.get(id)?.children || []).map((cid) => ({ ...nodes.get(cid) })),
    create: async ({ parentId, title, url }) => {
      const node = { id: String(nextBmId++), parentId, title, url, children: url ? undefined : [] };
      addNode(node);
      return { ...node };
    },
    remove: async (id) => {
      const node = nodes.get(id);
      if (!node) return;
      const siblings = nodes.get(node.parentId)?.children;
      if (siblings) siblings.splice(siblings.indexOf(id), 1);
      nodes.delete(id);
    },
    move: async (id, { parentId }) => {
      const node = nodes.get(id);
      if (!node) return;
      const old = nodes.get(node.parentId)?.children;
      if (old) old.splice(old.indexOf(id), 1);
      node.parentId = parentId;
      (nodes.get(parentId).children ||= []).push(id);
    },
  };

  const mkStore = () => {
    const data = {};
    return {
      get: async (key) => (key in data ? { [key]: data[key] } : {}),
      set: async (obj) => { Object.assign(data, obj); },
      remove: async (key) => { delete data[key]; },
    };
  };

  globalThis.chrome = {
    tabs: tabsApi,
    tabGroups: tabGroupsApi,
    windows: windowsApi,
    bookmarks: bookmarksApi,
    // Non-fetchable URL -> loadShipped() falls back to {} (no network in tests).
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
    storage: { sync: mkStore(), session: mkStore(), local: mkStore() },
  };
  return state;
}
