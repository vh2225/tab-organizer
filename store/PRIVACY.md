# Privacy Policy — Smart Tab & Bookmark Organizer

_Last updated: 2026-06-07_

**Short version: we don't collect, transmit, or sell any of your data. Everything stays in
your browser.**

## What the extension accesses

To organize your tabs and bookmarks, the extension reads:

- **Open tabs** in the current window (URL and title) — to group, sort, and de-duplicate them.
- **Bookmarks** — to file loose bookmarks into folders and save sessions.
- **Local extension storage** — to remember your settings and custom categories
  (stored via `chrome.storage.sync`, which Chrome may sync across your own signed-in devices).

## What we do with it

All processing happens **locally, inside your browser**. The extension:

- Does **not** send your tabs, bookmarks, URLs, titles, or any browsing data to any server.
- Has **no analytics, no tracking, and no third-party scripts.**
- Requires **no account and no sign-in.**

The only network request the extension makes is to **download** a public category list
(a domain→category mapping it ships with and refreshes weekly from its own GitHub repo).
This is a one-way download of a public file — it carries **no information about you** and
contains nothing about your tabs or browsing.

## On-device AI (optional)

If you enable "Use on-device AI for unknown tabs," categorization uses Chrome's **built-in,
on-device** AI model (Gemini Nano). This also runs **locally** — your tab information is **not**
sent over the network.

## Cost

The extension is **completely free** — no paid tiers, no in-app purchases, no payment
processing of any kind.

## Permissions, plainly

| Permission | Why |
| --- | --- |
| `tabs` | Read tab URLs/titles to group, sort, de-dupe |
| `tabGroups` | Create and label the color-coded groups |
| `bookmarks` | File bookmarks into folders, save sessions |
| `storage` | Save your settings and custom categories |
| `contextMenus` | The right-click "Group tabs by topic" entry |

## Contact

Questions or issues: please open an issue on the project's GitHub repository
(`https://github.com/vh2225/tab-organizer/issues`). No personal contact required.
