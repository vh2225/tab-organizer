# Design — Smarter categorization + cross-window grouping

_2026-06-08_

Addresses three pieces of real-world feedback:
1. Sites the rules don't know (e.g. `dealcatcher.com`) aren't categorized.
2. Related tabs in different windows don't group together.
3. Two identical eBay tabs in different windows — only one grouped (same root cause as #2).

## Decisions

- **Engine: on-device Gemini Nano only.** No cloud/local BYO LLM — keeps the "nothing
  leaves your browser" promise. Heuristic rules stay the always-on offline baseline.
- **Cross-window: gather-then-group, "only merged" scope.** Surgical, not a sledgehammer.
- **Cross-window grouping is a separate action**, never the default click.

## A. Smarter categorization (#1)

The fix is to let the on-device AI pass actually run, instead of being an off-by-default
afterthought:

- `DEFAULT_SETTINGS.useAiByDefault = true` — so when Nano is available it runs; when it
  isn't, it's a silent no-op and the heuristics carry on.
- `groupTabs()` defaults `useAi` to `settings.useAiByDefault` when the caller doesn't pass
  it — so the keyboard shortcut / context menu / auto-group get the AI pass too, not just
  the popup checkbox.
- The AI pass already runs only over heuristic-leftovers (high-precision rules first, model
  fills the gaps), and already receives the user's live categories. `dealcatcher.com` →
  leftover → Nano → `shopping`. No hardcoding.

Trade-off the user accepted: with Nano unavailable, #1 is unimproved (we are NOT growing the
heuristic list). Documented, intentional.

## B. Cross-window "Gather & group" (#2 + #3)

New action `gatherAndGroup()`, surfaced as its own popup button. Operates on ALL windows.

**Scatter rule (pure, testable):** a category is "scattered" when its tabs span **2+ windows**
AND total count ≥ `minGroupSize`. Only scattered categories are touched. A topic living in a
single window is left exactly where it is — intentional multi-window setups are preserved.

**`planGather(tabs, {activeWindowId, minGroupSize, categories, aiCategories})`** (pure, in
`categorize.js`) returns:
- `moves`: `[{ id, fromWindowId, fromIndex }]` — tabs in scattered categories that live
  outside the active window (captured BEFORE moving, for undo).
- `groups`: `[{ label, color, ids }]` — one per scattered category, ids = all its tabs.

**Execution (`actions.js`):**
1. `chrome.tabs.query({})`, drop pinned / non-http.
2. Optional AI pass over leftovers (when enabled+available).
3. `planGather(...)` with the active window id (`chrome.windows.getCurrent()`).
4. Record gather undo (the `moves` originals + every grouped id).
5. Move each `moves` tab into the active window; `chrome.tabs.group` + label/color per group.
6. Result: `Merged N tabs from M windows into K groups.` (or `Nothing is scattered across
   windows.`)

Non-scattered active-window tabs are left for the regular "Group tabs" button — keeps this
action single-purpose and its undo clean.

## C. Undo for gather

New record `gatherUndo(movedTabs, groupedIds)` → `{ action:'gather', moves:[{id,windowId,
index}], groupedIds }`. `undoLast` 'gather' branch: ungroup `groupedIds`, then move each tab
back to its original `{windowId, index}` (best-effort, try/catch per move in case a source
window was closed).

## Testing

- Pure: `planGather` scatter detection + move plan (multi-window fixtures); `gatherUndo`
  builder. Unit-tested, no chrome.
- Integration (mock chrome, extended with multi-window + cross-window `tabs.move`):
  `gatherAndGroup` merges scattered tabs, leaves single-window topics, and undo restores the
  original window layout.

## No manifest changes

`chrome.tabs.query({})` and cross-window `chrome.tabs.move` need only the existing `tabs`
permission; `chrome.windows.getCurrent` needs none.
