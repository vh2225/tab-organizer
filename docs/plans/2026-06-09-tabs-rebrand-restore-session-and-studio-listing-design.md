# Tabs-only rebrand, Restore session, and 3app.studio listing — design

**Date:** 2026-06-09 · **Status:** approved (autonomous run — decisions documented below)

## Goal

Make the extension store-ready and list it on the 3app.studio studio hub, following the
established showcase patterns (Habena = hub-hosted static landing; Auspex = self-hosted with
`landing: null`; Tleilax = own domain, not on the hub).

## Context

- Commit `bbfeebd` removed the bookmark-organizing feature ("focus on tabs"), but the name and
  copy still say "Smart Tab & Bookmark Organizer" and "auto-file bookmarks into category
  folders" (manifest, README, options page, store listing, privacy policy). Misleading store
  copy is a rejection risk and the rename is simply unfinished work.
- Store submission requires a **publicly hosted privacy policy URL** — the hub landing can
  carry it (`https://tab-organizer.3app.studio/#privacy`), killing two birds.
- `saveSession` exists but there is no way to reopen a saved session from the popup — a
  half-feature.

## Decisions (made autonomously, with rationale)

1. **Rename to "Smart Tab Organizer"** in manifest (`name`, `default_title`, `description`),
   README, options page, store listing, privacy policy. Keep the `bookmarks` permission — Save
   session still uses it; the privacy policy justification changes to sessions-only.
   Version bump **1.1.0 → 1.2.0** (user-visible name + feature).
2. **Add "Restore session"**: reopen the most recent "Session …" folder under
   *Other Bookmarks → Tab Organizer Sessions* in a new window. Latest = lexically greatest
   title (titles embed an ISO timestamp). No undo record — closing a window is its own undo.
3. **Hub listing, Habena pattern** (hub-hosted static landing): add a `tab-organizer` entry to
   `revenue-framework/apps/web/src/showcase.ts` with a static landing at
   `tab-organizer.3app.studio` (wildcard DNS already covers new slugs; `extractSlug` handles
   hyphens). The landing carries the privacy policy in an anchored `#privacy` section. Catalog
   card on 3app.studio comes free via `listShowcase()`.
   - Slug `tab-organizer` (matches repo name) over a shorter vanity slug — greppability wins.
   - Links: GitHub repo now; Chrome Web Store link added once published.

## Alternatives considered

- **Auspex pattern (self-hosted landing)** — rejected: an extension has no app to host; a
  static landing on the hub is exactly the Habena case.
- **Privacy policy on GitHub blob URL** — works, but the landing anchor gives a first-party
  URL on our own domain and the section improves the landing anyway.
- **Bigger feature work (e.g. session manager UI)** — rejected (YAGNI); restore-last-session
  completes the existing feature without new surface area.

## Components & flow

- `src/actions.js` → `restoreSession()`: locate sessions folder via `chrome.bookmarks`,
  pick newest child folder, `chrome.windows.create({ url: [...] })`.
- `popup.html/js` → "Restore last session" button + result message.
- Tests: `test/actions.test.mjs` (restore happy path, no-sessions path) via mock-chrome.
- `revenue-framework`: `showcase.ts` entry + landing function; `showcase.test.ts` updated.

## Error handling

- No sessions folder / empty folder → `{ restored: 0 }`, popup says "No saved sessions yet."
- Landing is static HTML — no failure modes beyond the existing host fallbacks.

## Testing

- `node --test` in tab-organizer (existing 54 + new restore tests).
- `revenue-framework` showcase/host test suites.
