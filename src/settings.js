// User settings + customizable categories, persisted in chrome.storage.sync so they
// follow the user across machines. Pure merge/validate helpers are exported separately
// so they can be unit-tested without chrome.*.

import { DEFAULT_CATEGORIES } from './categorize.js';

export const DEFAULT_SETTINGS = {
  categories: DEFAULT_CATEGORIES,
  minGroupSize: 2,
  useAiByDefault: true, // on-device AI runs when available; silent no-op when not
  groupAcrossWindows: false, // when true, "Group tabs" merges split categories across all windows
  autoGroupOnStartup: false,
};

const KEY = 'settings';
const VALID_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

// PURE: sanitize one user-supplied category into the shape the engine expects.
export function normalizeCategory(c) {
  const slug = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const id = slug(c.id) || slug(c.label) || `cat${Math.abs(hash(c.label || ''))}`;
  return {
    id,
    label: String(c.label || c.id || 'Untitled').trim().slice(0, 40),
    color: VALID_COLORS.includes(c.color) ? c.color : 'grey',
    emoji: (c.emoji || '🔖').slice(0, 4),
    domains: toList(c.domains),
    keywords: toList(c.keywords),
  };
}

// PURE: merge stored settings over defaults, validating types.
export function mergeSettings(stored, defaults = DEFAULT_SETTINGS) {
  const s = { ...defaults, ...(stored || {}) };
  s.minGroupSize = clampInt(s.minGroupSize, 1, 20, defaults.minGroupSize);
  s.useAiByDefault = !!s.useAiByDefault;
  s.groupAcrossWindows = !!s.groupAcrossWindows;
  s.autoGroupOnStartup = !!s.autoGroupOnStartup;
  s.categories = Array.isArray(s.categories) && s.categories.length
    ? s.categories.map(normalizeCategory).filter((c) => c.id)
    : defaults.categories;
  return s;
}

export async function loadSettings() {
  const got = await chrome.storage.sync.get(KEY);
  return mergeSettings(got[KEY]);
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  const next = mergeSettings({ ...current, ...patch });
  await chrome.storage.sync.set({ [KEY]: next });
  return next;
}

export async function resetSettings() {
  await chrome.storage.sync.remove(KEY);
  return mergeSettings(null);
}

// --- helpers ---
function toList(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  if (typeof v === 'string') return v.split(/[\n,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  return [];
}
function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return h;
}
