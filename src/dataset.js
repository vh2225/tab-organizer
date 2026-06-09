// Data-driven domain dataset. The extension ships a baseline data/domains.json and refreshes
// it weekly from a public URL. Categorization reads a merged Map<host|registrableDomain, catId>
// ("domain index"). Pure helpers (validate/build/merge) are unit-tested; chrome.* + fetch glue
// is thin and best-effort — any failure falls back to the shipped baseline. We download a public
// list; we never upload anything about the user.

import { DEFAULT_CATEGORIES } from './categorize.js';

export const REMOTE_URL = 'https://raw.githubusercontent.com/vh2225/tab-organizer/main/data/domains.json';
const CACHE_KEY = 'datasetCache';
const MAX_ENTRIES = 50000;

const normKey = (s) => String(s || '').trim().toLowerCase().replace(/^www\./, '');

// PURE: validate/normalize an untrusted dataset payload. Returns {version, domains} or null.
export function validateDataset(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const { domains } = obj;
  if (!domains || typeof domains !== 'object' || Array.isArray(domains)) return null;
  const entries = Object.entries(domains);
  if (!entries.length || entries.length > MAX_ENTRIES) return null;
  const clean = {};
  for (const [k, v] of entries) {
    if (typeof k !== 'string' || typeof v !== 'string') continue;
    if (k.length > 255 || v.length > 64) continue;
    const key = normKey(k);
    if (key) clean[key] = v.trim().toLowerCase();
  }
  if (!Object.keys(clean).length) return null;
  return { version: Number.isInteger(obj.version) ? obj.version : 0, domains: clean };
}

// PURE: merge dataset maps; later sources win. Used by the maintainer build script.
export function mergeDatasets(...sources) {
  const out = {};
  for (const src of sources) {
    for (const [k, v] of Object.entries(src || {})) {
      const key = normKey(k);
      if (key && v) out[key] = String(v).trim().toLowerCase();
    }
  }
  return out;
}

// PURE: build the lookup Map, precedence user category domains > remote > shipped, keeping only
// entries whose category id still exists.
export function buildDomainIndex({ shipped = {}, remote = {}, categories = DEFAULT_CATEGORIES } = {}) {
  const validIds = new Set(categories.map((c) => c.id));
  const idx = new Map();
  const add = (domains, restrict) => {
    for (const [d, cat] of Object.entries(domains || {})) {
      const key = normKey(d);
      if (key && (!restrict || validIds.has(cat))) idx.set(key, cat);
    }
  };
  add(shipped, true);
  add(remote, true);
  for (const c of categories) for (const d of (c.domains || [])) { const k = normKey(d); if (k) idx.set(k, c.id); }
  return idx;
}

// --- chrome.* + fetch glue (best-effort) ---

export async function getCachedRemote() {
  try { return (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || null; } catch { return null; }
}
export async function setCachedRemote(data) {
  try { await chrome.storage.local.set({ [CACHE_KEY]: data }); } catch { /* ignore */ }
}

// Load the baseline shipped with the extension.
export async function loadShipped() {
  try {
    const res = await fetch(chrome.runtime.getURL('data/domains.json'));
    return validateDataset(await res.json())?.domains || {};
  } catch { return {}; }
}

// Assemble the domain index from shipped baseline + cached remote + the user's categories.
export async function loadDomainIndex(categories = DEFAULT_CATEGORIES) {
  const [shipped, cached] = await Promise.all([loadShipped(), getCachedRemote()]);
  return buildDomainIndex({ shipped, remote: cached?.domains || {}, categories });
}

// Fetch the remote dataset (conditional on stored ETag), validate, and cache. Never throws.
// fetchImpl/now are injectable for tests. Returns {updated, ...} describing what happened.
export async function refreshDataset({ fetchImpl = fetch, now = Date.now } = {}) {
  try {
    const cached = await getCachedRemote();
    const headers = cached?.etag ? { 'If-None-Match': cached.etag } : {};
    const res = await fetchImpl(REMOTE_URL, { headers, cache: 'no-cache' });
    if (res.status === 304) return { updated: false, reason: 'not-modified' };
    if (!res.ok) return { updated: false, reason: `http-${res.status}` };
    const valid = validateDataset(await res.json());
    if (!valid) return { updated: false, reason: 'invalid' };
    const etag = res.headers?.get?.('etag') || null;
    await setCachedRemote({ version: valid.version, domains: valid.domains, etag, fetchedAt: now() });
    return { updated: true, version: valid.version, count: Object.keys(valid.domains).length };
  } catch { return { updated: false, reason: 'error' }; }
}
