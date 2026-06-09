// Optional on-device categorization via Chrome's built-in Prompt API (Gemini Nano).
// Runs locally, free, no API key, no network. Entirely best-effort: if the API is
// missing or fails, callers fall back to domain grouping. Never throws to the caller.
//
// Availability requires a recent Chrome with the built-in AI model downloaded
// (chrome://on-device-internals). See README for enabling it.

import { DEFAULT_CATEGORIES } from './categorize.js';

// Declare languages on EVERY LanguageModel request (availability/create/prompt) so Chrome
// doesn't warn and to attest output safety. The Prompt API supports en/ja/es; our prompts and
// category-id output are English. Docs say to pass the same options to availability() as create().
const MODEL_LANG = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

// Returns the LanguageModel namespace if present, else null. Handles both the
// current `LanguageModel` global and the older `self.ai.languageModel` shape.
function modelApi() {
  if (typeof LanguageModel !== 'undefined') return LanguageModel;
  if (typeof self !== 'undefined' && self.ai && self.ai.languageModel) return self.ai.languageModel;
  return null;
}

// Raw model state: 'available' | 'downloadable' | 'downloading' | 'unavailable'.
// Lets the UI tell "downloading…" apart from "not supported".
export async function availabilityStatus() {
  try {
    const api = modelApi();
    if (!api) return 'unavailable';
    return (await api.availability(MODEL_LANG)) || 'unavailable';
  } catch { return 'unavailable'; }
}

// Only "available" means ready-to-use NOW. "downloadable"/"downloading" would make
// create() block on a multi-GB model download and freeze whatever action called it, so
// we treat those as not-ready and let the heuristics carry on.
export async function aiAvailable() {
  return (await availabilityStatus()) === 'available';
}

// Trigger / attach to the on-device model download, reporting progress as a 0..1 fraction
// via onProgress. Resolves true once the model is ready, false if the API is missing or the
// download fails. Safe to call when status is 'downloadable' (starts it; needs a user
// gesture) or 'downloading' (just monitors). Returns only when the download finishes.
export async function downloadModel(onProgress) {
  const api = modelApi();
  if (!api) return false;
  let session;
  try {
    session = await api.create({
      ...MODEL_LANG,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          try { onProgress?.(e.loaded); } catch { /* ignore UI errors */ }
        });
      },
    });
    return true;
  } catch {
    return false;
  } finally {
    try { session?.destroy?.(); } catch { /* ignore */ }
  }
}

// Given leftover items [{id,url,title}], return Map<id, categoryId> for the ones the
// model could confidently place. Best-effort and time-boxed: the whole pass is capped at
// `deadlineMs` so a slow or stalled model can never freeze the action that called it — we
// return whatever we placed so far and let the heuristics handle the rest.
// `categories` is the user's live category list so the model is constrained to the same
// ids the heuristics use (including any custom categories), not just the seed.
export async function aiCategorize(items, categories = DEFAULT_CATEGORIES, { deadlineMs = 6000 } = {}) {
  const out = new Map();
  if (!items.length) return out;
  const api = modelApi();
  if (!api) return out;

  const labels = categories.map((c) => c.id);
  const controller = new AbortController();
  const { signal } = controller;
  let session;
  let timer;
  const deadline = new Promise((resolve) => { timer = setTimeout(resolve, deadlineMs); });

  const work = (async () => {
    session = await api.create({
      ...MODEL_LANG,
      initialPrompts: [{
        role: 'system',
        content:
          'You sort browser tabs into exactly one category. Reply with ONLY the category id, ' +
          'lowercase, no punctuation. Valid ids: ' + labels.join(', ') + '. ' +
          'If none fit, reply "none".',
      }],
      signal,
    });
    for (const it of items) {
      if (signal.aborted) break;
      try {
        const host = (() => { try { return new URL(it.url).hostname; } catch { return ''; } })();
        const ans = (await session.prompt(`Title: ${it.title || ''}\nURL host: ${host}\nCategory id:`, { signal }))
          .trim().toLowerCase().replace(/[^a-z]/g, '');
        if (labels.includes(ans)) out.set(it.id, ans);
      } catch { /* skip this item */ }
    }
  })().catch(() => { /* create failed / aborted: keep whatever we have */ });

  try { await Promise.race([work, deadline]); }
  finally {
    controller.abort();
    clearTimeout(timer);
    try { session?.destroy?.(); } catch { /* ignore */ }
  }
  return out;
}
