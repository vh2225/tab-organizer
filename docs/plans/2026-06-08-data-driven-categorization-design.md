# Design — Data-driven categorization (auto-updating domain dataset)

_2026-06-08_

Stop hardcoding/hand-adding domains. Categorization is driven by a maintained dataset that
the extension ships, and refreshes from a public URL on a schedule. On-device Gemini Nano
stays as the optional last-resort smart layer for sites the dataset still doesn't know.

## Decisions (approved)

- **Hybrid source.** A curated `data/domains.json` in the repo is the source of truth,
  seeded/augmented from public lists by a maintainer-side build script. The *extension* only
  ever fetches that one file we control — no third-party calls from the user's browser.
- **Host: public repo.** Refresh from `https://raw.githubusercontent.com/vh2225/tab-organizer/main/data/domains.json`. Repo flipped to public.
- **Cadence: weekly + manual.** `chrome.alarms` weekly + an "Update now" button in Settings.
- **Offline-first.** `data/domains.json` ships inside the extension; remote fetch only refreshes.
- **Keep on-device Nano** as an optional layer; unchanged.

## Categorization stack (precedence)

1. User custom category domains  2. Cached remote dataset  3. Shipped baseline dataset
4. Built-in keyword/title match  5. On-device Gemini Nano (leftovers, when available)
6. Registrable-domain fallback grouping.

Layers 1–3 are a single `Map<host|registrableDomain, catId>` (the "domain index"). A dataset
entry only applies if its `catId` still exists in the active categories (so it degrades
gracefully when a user renames/removes categories).

## Components

### data/domains.json (shipped + remote, same shape)
```json
{ "version": 3, "updated": "2026-06-08",
  "domains": { "github.com": "dev", "mail.google.com": "email", "dealcatcher.com": "shopping" } }
```
Flat map keyed by hostname OR registrable domain → category id. O(1) lookup. `DEFAULT_CATEGORIES`
keeps category *metadata* (id/label/color/emoji/keywords) and its current domains as the core
seed; the dataset is generated from those + `data/curated.json`, so there's no hand-maintained
duplication.

### src/dataset.js (pure + thin chrome glue)
- `validateDataset(obj)` → normalized `{version, domains}` or `null` (rejects malformed remote
  payloads: wrong types, non-string keys/values, absurd size).
- `buildDomainIndex({shipped, remote, categories})` → `Map`, precedence user>remote>shipped,
  filtered to catIds that exist. **Pure, unit-tested.**
- `loadShipped()` → `fetch(chrome.runtime.getURL('data/domains.json'))`.
- `getCachedRemote()/setCachedRemote()` → `chrome.storage.local`.
- `refreshDataset({fetchImpl, now})` → conditional GET (stored ETag), validate, cache; returns
  `{updated, version, count}` or `{updated:false, reason}`. fetch+now injectable → **mock-tested**
  (success, 304 not-modified, network error → keep cache).
- `loadDomainIndex(settings)` → assembles the Map from shipped + cached remote + settings.

### categorize() (src/categorize.js)
New optional 3rd arg `domainIndex`: after the `chrome:`/`about:` guard, look up `host` then
`registrableDomain` in the index; if hit and the catId exists, return it. Else existing
substring-domain + keyword logic (handles pattern entries like `amazon.`, `localhost`, and
custom domains). Backward-compatible: `domainIndex` defaults to `null` → current behavior.
`planGroups`, `sortKey`, `planGather` thread the index through.

### background.js
`chrome.alarms.create('refresh-dataset', { periodInMinutes: 10080 })`; `onAlarm` and
`onInstalled` → `refreshDataset()`.

### options (Settings)
"Update domain list now" button → `refreshDataset()` → show version, entry count, last-updated.

### scripts/build-dataset.mjs (maintainer side, Node)
`mergeDatasets(base, overlay)` (pure, tested) combines `DEFAULT_CATEGORIES` domains +
`data/curated.json` + (pluggable) public lists mapped to our ids → writes `data/domains.json`
with a bumped version. v1 ships curated + defaults and **one** documented public-source hook;
not boiling the ocean.

### manifest.json
Add `"alarms"` permission and `"host_permissions": ["https://raw.githubusercontent.com/vh2225/tab-organizer/*"]`. Privacy policy gains: "downloads a public category list; never uploads your data."

## Error handling
Every remote step is best-effort: bad/again-unreachable payloads are ignored, cache is kept,
and the shipped baseline always backs the index. Categorization never depends on the network.

## Testing
Pure: `validateDataset`, `buildDomainIndex` (precedence + catId filtering), `categorize` with
an index, `mergeDatasets`. Integration (mock fetch + mock storage): `refreshDataset` success /
304 / failure-fallback. Existing 41 tests stay green (domainIndex is additive/optional).
