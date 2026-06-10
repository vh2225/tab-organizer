# Tabs Rebrand + Restore Session + Studio Listing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the tabs-only rebrand, add a "Restore last session" action, and list the extension on the 3app.studio hub with a landing page that hosts the privacy policy.

**Architecture:** Pure rename/copy edits across manifest/README/store files; one new `chrome.*` action (`restoreSession`) in `src/actions.js` tested via mock-chrome; one new code-defined showcase entry (Habena pattern) in `revenue-framework/apps/web/src/showcase.ts`.

**Tech Stack:** Chrome MV3 extension (vanilla JS, `node --test`), Fastify/TypeScript hub (vitest).

---

### Task 1: Rebrand to "Smart Tab Organizer"

**Files:**
- Modify: `manifest.json` (name, default_title, description, version → 1.2.0)
- Modify: `README.md` (title + intro), `options.html` (title, h1)
- Modify: `store/listing.md` (name, summary, description), `store/PRIVACY.md` (title, bookmark justifications → sessions-only)

**Steps:** edit each file; run `node --test` (expect 54 pass — copy edits must not break anything); grep for leftover `Bookmark` outside docs/plans; commit `fix: finish tabs-only rebrand — drop stale bookmark naming and copy`.

### Task 2: Restore last session (TDD)

**Files:**
- Test: `test/actions.test.mjs` — add: restore reopens newest session folder's URLs in a new window; returns `{ restored: 0 }` when no sessions exist.
- Modify: `src/actions.js` — add `restoreSession()`; `test/mock-chrome.mjs` — add `windows.create` if missing.
- Modify: `popup.html` / `popup.js` — button + message; `README.md`, `store/listing.md` — feature bullet.

**Steps:** write failing tests → `node --test` (FAIL: `restoreSession` not exported) → implement minimal `restoreSession()` (find 'Tab Organizer Sessions' under parent '2', newest child by title, `chrome.windows.create({ url })`) → `node --test` (PASS) → wire popup button → commit `feat: restore last saved session from the popup`.

### Task 3: Studio listing on 3app.studio

**Files:**
- Modify: `revenue-framework/apps/web/src/showcase.ts` — add `tab-organizer` entry with `tabOrganizerLanding()` (Habena-style HTML: hero, features, install, `#privacy` section mirroring `store/PRIVACY.md`, GitHub link).
- Modify: `revenue-framework/apps/web/src/__tests__/showcase.test.ts` — cover the new slug.
- Modify: `store/listing.md` — privacy URL `https://tab-organizer.3app.studio/#privacy`; `README.md` — landing link.

**Steps:** add entry + landing → run revenue-framework web tests → commit there `feat: list Smart Tab Organizer on the studio showcase`; update tab-organizer docs → commit → push both repos if remotes configured; check hub deploy mechanism (ops docs) and redeploy if it's a local service.
