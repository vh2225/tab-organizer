# Smart Tab & Bookmark Organizer

A Chrome (Manifest V3) extension that **smartly organizes your open tabs and bookmarks**.
Categorization runs **locally and free** — no API key, no account, works offline — using a
curated domain/keyword ruleset, with an **optional on-device AI** pass (Chrome's built-in
Gemini Nano) for tabs the rules don't recognize.

## What it does

**Tabs**
- **Group tabs by topic** — collects open tabs into native Chrome tab groups (Dev, AI, Email,
  Social, Media, News, Shopping, Finance, Travel, Docs, Work…), each color-coded. Unknown sites
  are grouped by domain. Pinned tabs are left alone.
- **Group across all windows** — flip the **Group across all windows** toggle (in the popup, right
  under *Group tabs*) and the **Group tabs** button merges any category that's split across windows
  into one group — moving those tabs together — and groups every window. Leave it off for
  current-window-only grouping. Undoable. For a one-off, toggle on, group, toggle off.
- **Sort tabs** — reorders so related tabs sit next to each other (category → domain → title).
- **Close duplicate tabs** — closes repeat URLs, keeps the first (ignores `#fragments`, never
  touches pinned tabs).
- **Save session** — saves every tab in the window to a dated bookmark folder under
  *Other Bookmarks → Tab Organizer Sessions*.
- **Ungroup all** — clears groups without closing anything.
- **Undo last action** — reverses the most recent group / sort / close-duplicates / ungroup
  (re-opens closed tabs, restores order, rebuilds groups). One step back, no surprises.

**Bookmarks**
- **File loose bookmarks into folders** — sorts the loose bookmarks in *Other Bookmarks* into
  category folders and removes exact-duplicate URLs. Existing folders are untouched.

Bonus: keyboard shortcut **Ctrl/Cmd+Shift+O** and a right-click menu both trigger
"Group tabs by topic".

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right) on.
3. Click **Load unpacked** and select this folder (`tab-organizer/`).
4. Pin the extension and click its icon to open the popup.

## Optional: on-device AI

The "Use on-device AI for unknown tabs" toggle uses Chrome's built-in Prompt API (Gemini Nano),
which runs **locally and free**. It's **on by default** and runs whenever the model is available
— this is what catches sites the rules don't list (e.g. a deals site → Shopping) without any
hardcoding. If the model isn't available the toggle shows *(unavailable)* and everything still
works via the heuristic rules. To enable the model: recent desktop Chrome, then check
`chrome://on-device-internals`. The extension never sends your tabs anywhere — all categorization
is local either way.

## Self-updating domain list

Which sites belong to which category lives in a **maintained dataset** (`data/domains.json`),
not buried in code. The extension ships that list and **refreshes it weekly** from this repo
(`raw.githubusercontent.com/.../data/domains.json`), so coverage keeps improving without a new
release — a deals site you hit today gets recognized after the next refresh. There's also an
**Update now** button in Settings.

This is a *download only*: the extension fetches a public file and **never uploads** anything
about you — the privacy promise holds. If the network is down or the fetch fails, it falls back
to the shipped baseline, so categorization always works offline.

Maintainers regenerate the dataset with `node scripts/build-dataset.mjs`, which merges the code
defaults + `data/curated.json` (+ a pluggable hook for public lists) into `data/domains.json`.

## Customize categories

No code needed — open **Settings** (popup → ⚙️, or the Options page) and edit the **Categories**
list: name, emoji, color, domains, and keywords per category. Saved to `chrome.storage.sync`, so
they follow you across devices. (The seed defaults live in `src/categorize.js` → `DEFAULT_CATEGORIES`.)

## Free & open

This is a **free** extension — every feature is unlocked for everyone, no account, no paid tiers,
no tracking. Source is **MIT-licensed** (`LICENSE`), so it can live on GitHub for issues and
contributions. Its angle is privacy: **100% local, no account, free on-device AI** — something
cloud tab managers (Toby, Workona) structurally can't claim.

**Publish to the Web Store** (optional): see `store/listing.md` (name, descriptions, screenshot
shotlist, submission checklist) and `store/PRIVACY.md` (the privacy policy you must host publicly
and link). One-time $5 Chrome developer registration; no payment integration needed.

## Develop / test

Pure logic (categorization, grouping plan, dedupe) is isolated in `src/categorize.js` with no
`chrome.*` calls, so it's unit-tested in Node:

```bash
node --test        # categorize, settings, undo (pure) + actions (mock-chrome) + smoke
```

The `chrome.*` orchestration in `actions.js` is also covered, driven by an in-memory mock
`chrome` (`test/mock-chrome.mjs`), and a smoke test imports every `src/` module so a broken
import can't silently take down the service worker.

## Layout

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (permissions, action, options, command) |
| `src/categorize.js` | Pure categorization + grouping/dedupe/sort logic (unit-tested) |
| `src/dataset.js` | Domain dataset: validate/merge/build-index (pure) + fetch/cache refresh |
| `data/domains.json` | Shipped + remotely-refreshed domain→category list (generated) |
| `data/curated.json` | Hand-maintained domain additions (input to the build script) |
| `scripts/build-dataset.mjs` | Regenerates `data/domains.json` from defaults + curated |
| `src/settings.js` | User settings + custom categories (chrome.storage; pure merge helpers tested) |
| `src/ai.js` | Optional on-device Prompt API pass (best-effort, graceful fallback) |
| `src/actions.js` | `chrome.*` orchestration for each action |
| `popup.html/.css/.js` | The toolbar popup UI |
| `options.html/.css/.js` | Settings: editable categories and preferences |
| `src/undo.js` | Undo records for the destructive tab actions (pure builders unit-tested) |
| `background.js` | Service worker: command, context menu, onboarding, auto-group |
| `store/` | Web Store listing copy + privacy policy |
| `test/` | Node unit tests for the pure logic |
