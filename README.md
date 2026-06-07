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
- **Sort tabs** — reorders so related tabs sit next to each other (category → domain → title).
- **Close duplicate tabs** — closes repeat URLs, keeps the first (ignores `#fragments`, never
  touches pinned tabs).
- **Save session** — saves every tab in the window to a dated bookmark folder under
  *Other Bookmarks → Tab Organizer Sessions*.
- **Ungroup all** — clears groups without closing anything.

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
which runs **locally and free**. It only activates if your Chrome has the model available; if not,
the toggle shows *(unavailable)* and everything still works via the heuristic rules. To enable the
model: recent Chrome, then check `chrome://on-device-internals`. The extension never sends your
tabs anywhere — all categorization is local either way.

## Customize categories

No code needed — open **Settings** (popup → ⚙️, or the Options page) and edit the **Categories**
list: name, emoji, color, domains, and keywords per category. Saved to `chrome.storage.sync`, so
they follow you across devices. (The seed defaults live in `src/categorize.js` → `DEFAULT_CATEGORIES`.)

## Productize it (Free / Pro)

This is built to ship as a product with a privacy-first wedge: **100% local, no account, free
on-device AI** — something cloud tab managers (Toby, Workona) structurally can't claim.

- **Tiering** (`src/license.js`): Free = all manual organizing + custom categories. Pro =
  on-device AI grouping + auto-group on startup/new windows. Classic "manual free / automatic Pro"
  split that keeps the free tier a genuine acquisition engine.
- **Wire payments** (no secrets in the repo): set `CHECKOUT_URL` in `src/license.js` and replace
  `checkRemoteLicense()` with either **ExtensionPay** (easiest for MV3) or a **Stripe Payment
  Link + license key**. Until then it runs fully as Free; paste any 6+ char key in Settings to
  test the Pro flow locally.
- **Publish**: see `store/listing.md` (name, descriptions, screenshot shotlist, submission
  checklist) and `store/PRIVACY.md` (required privacy policy — host it publicly and link it).

## Develop / test

Pure logic (categorization, grouping plan, dedupe) is isolated in `src/categorize.js` with no
`chrome.*` calls, so it's unit-tested in Node:

```bash
node --test        # runs test/categorize.test.mjs
```

## Layout

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (permissions, action, options, command) |
| `src/categorize.js` | Pure categorization + grouping/dedupe/sort logic (unit-tested) |
| `src/settings.js` | User settings + custom categories (chrome.storage; pure merge helpers tested) |
| `src/license.js` | Free/Pro tiering + payment seam (no secrets) |
| `src/ai.js` | Optional on-device Prompt API pass (best-effort, graceful fallback) |
| `src/actions.js` | `chrome.*` orchestration for each action |
| `popup.html/.css/.js` | The toolbar popup UI |
| `options.html/.css/.js` | Settings: editable categories, preferences, license |
| `background.js` | Service worker: command, context menu, onboarding, Pro auto-group |
| `store/` | Web Store listing copy + privacy policy |
| `test/` | Node unit tests for the pure logic |
