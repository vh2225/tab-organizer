// Optional on-device categorization via Chrome's built-in Prompt API (Gemini Nano).
// Runs locally, free, no API key, no network. Entirely best-effort: if the API is
// missing or fails, callers fall back to domain grouping. Never throws to the caller.
//
// Availability requires a recent Chrome with the built-in AI model downloaded
// (chrome://on-device-internals). See README for enabling it.

import { CATEGORIES } from './categorize.js';

const LABELS = CATEGORIES.map((c) => c.id);

// Returns the LanguageModel namespace if present, else null. Handles both the
// current `LanguageModel` global and the older `self.ai.languageModel` shape.
function modelApi() {
  if (typeof LanguageModel !== 'undefined') return LanguageModel;
  if (typeof self !== 'undefined' && self.ai && self.ai.languageModel) return self.ai.languageModel;
  return null;
}

export async function aiAvailable() {
  try {
    const api = modelApi();
    if (!api) return false;
    const status = await api.availability();
    return status === 'available' || status === 'downloadable' || status === 'downloading';
  } catch { return false; }
}

// Given leftover items [{id,url,title}], return Map<id, categoryId> for the ones the
// model could confidently place. Best-effort; returns an empty Map on any failure.
export async function aiCategorize(items) {
  const out = new Map();
  if (!items.length) return out;
  let session;
  try {
    const api = modelApi();
    if (!api) return out;
    session = await api.create({
      initialPrompts: [{
        role: 'system',
        content:
          'You sort browser tabs into exactly one category. Reply with ONLY the category id, ' +
          'lowercase, no punctuation. Valid ids: ' + LABELS.join(', ') + '. ' +
          'If none fit, reply "none".',
      }],
    });
  } catch { return out; }

  for (const it of items) {
    try {
      const host = (() => { try { return new URL(it.url).hostname; } catch { return ''; } })();
      const ans = (await session.prompt(`Title: ${it.title || ''}\nURL host: ${host}\nCategory id:`))
        .trim().toLowerCase().replace(/[^a-z]/g, '');
      if (LABELS.includes(ans)) out.set(it.id, ans);
    } catch { /* skip this item */ }
  }
  try { session?.destroy?.(); } catch { /* ignore */ }
  return out;
}
