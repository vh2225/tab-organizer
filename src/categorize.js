// Pure categorization logic — NO chrome.* here, so it is unit-testable in Node.
// Everything that touches the browser lives in actions.js / settings.js.
//
// All functions take a `categories` list so the product can ship sensible defaults
// AND let each user customize them (persisted via settings.js). The defaults below
// are just the seed.

// Tab-group colors must be one of Chrome's allowed values:
// grey, blue, red, yellow, green, pink, purple, cyan, orange.
export const DEFAULT_CATEGORIES = [
  { id: 'dev', label: 'Dev', color: 'blue', emoji: '💻',
    domains: ['github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com', 'stackexchange.com',
      'developer.mozilla.org', 'npmjs.com', 'pypi.org', 'readthedocs.io', 'codepen.io', 'jsfiddle.net',
      'codesandbox.io', 'replit.com', 'vercel.com', 'netlify.com', 'huggingface.co', 'kaggle.com', 'localhost'],
    keywords: ['api reference', 'sdk', ' npm ', 'stack trace', 'regex', 'compiler', 'localhost'] },
  { id: 'ai', label: 'AI', color: 'green', emoji: '🤖',
    domains: ['chat.openai.com', 'chatgpt.com', 'claude.ai', 'gemini.google.com', 'perplexity.ai',
      'poe.com', 'copilot.microsoft.com', 'midjourney.com'],
    keywords: ['prompt engineering', 'llm', 'chatbot'] },
  { id: 'docs', label: 'Docs & Notes', color: 'cyan', emoji: '📝',
    domains: ['docs.google.com', 'drive.google.com', 'notion.so', 'notion.site', 'coda.io', 'quip.com',
      'dropbox.com', 'onedrive.live.com', 'evernote.com', 'obsidian.md', 'confluence'],
    keywords: ['documentation', 'readme', 'spec sheet'] },
  { id: 'email', label: 'Email', color: 'red', emoji: '✉️',
    domains: ['mail.google.com', 'outlook.com', 'outlook.office.com', 'mail.yahoo.com', 'mail.proton.me',
      'fastmail.com'],
    keywords: ['inbox', 'compose mail'] },
  { id: 'work', label: 'Work', color: 'blue', emoji: '🗂️',
    domains: ['slack.com', 'zoom.us', 'meet.google.com', 'teams.microsoft.com', 'asana.com', 'trello.com',
      'atlassian.net', 'linear.app', 'monday.com', 'calendly.com', 'calendar.google.com', 'clickup.com'],
    keywords: ['meeting', 'sprint', 'standup', 'jira'] },
  { id: 'social', label: 'Social', color: 'pink', emoji: '💬',
    domains: ['twitter.com', 'x.com', 'reddit.com', 'facebook.com', 'instagram.com', 'linkedin.com',
      'threads.net', 'bsky.app', 'mastodon.social', 'tiktok.com', 'discord.com'],
    keywords: [] },
  { id: 'media', label: 'Media', color: 'purple', emoji: '🎬',
    domains: ['youtube.com', 'youtu.be', 'netflix.com', 'twitch.tv', 'spotify.com', 'soundcloud.com',
      'vimeo.com', 'hulu.com', 'disneyplus.com', 'max.com', 'primevideo.com'],
    keywords: ['playlist', 'episode'] },
  { id: 'news', label: 'News', color: 'orange', emoji: '📰',
    domains: ['news.google.com', 'news.ycombinator.com', 'nytimes.com', 'wsj.com', 'bbc.com', 'bbc.co.uk',
      'cnn.com', 'theguardian.com', 'reuters.com', 'bloomberg.com', 'apnews.com', 'arstechnica.com',
      'techcrunch.com', 'theverge.com'],
    keywords: ['breaking news', 'headlines'] },
  { id: 'shopping', label: 'Shopping', color: 'yellow', emoji: '🛒',
    domains: ['amazon.', 'ebay.com', 'etsy.com', 'aliexpress.com', 'walmart.com', 'target.com',
      'bestbuy.com', 'costco.com', 'wayfair.com', 'shopify.com'],
    keywords: ['add to cart', 'checkout', 'buy now'] },
  { id: 'finance', label: 'Finance', color: 'green', emoji: '💰',
    domains: ['paypal.com', 'stripe.com', 'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'coinbase.com',
      'robinhood.com', 'fidelity.com', 'schwab.com', 'wise.com'],
    keywords: ['invoice', 'portfolio balance', 'transactions'] },
  { id: 'travel', label: 'Travel', color: 'cyan', emoji: '✈️',
    domains: ['airbnb.com', 'booking.com', 'expedia.com', 'tripadvisor.com', 'kayak.com', 'vrbo.com',
      'uber.com', 'lyft.com', 'maps.google.com', 'google.com/travel'],
    keywords: ['flight', 'hotel', 'itinerary', 'reservation'] },
];

export const categoryMeta = (id, categories = DEFAULT_CATEGORIES) =>
  categories.find((c) => c.id === id) || null;

export function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}

// Registrable-ish domain (last two labels) for the domain-fallback grouping.
export function registrableDomain(url) {
  const host = hostnameOf(url);
  if (!host) return '';
  const parts = host.split('.');
  return parts.length <= 2 ? host : parts.slice(-2).join('.');
}

// Returns a category id, or null when nothing matches (-> domain fallback).
// Accepts anything shaped like { url, title } — works for tabs AND bookmarks.
export function categorize(item, categories = DEFAULT_CATEGORIES) {
  const url = (item.url || item.pendingUrl || '').toLowerCase();
  if (!url || url.startsWith('chrome:') || url.startsWith('edge:') || url.startsWith('about:')) return null;
  const host = hostnameOf(url);
  const title = (item.title || '').toLowerCase();

  // 1) Domain match is the strongest signal.
  for (const c of categories) {
    if ((c.domains || []).some((d) => host.includes(d) || url.includes(d))) return c.id;
  }
  // 2) Keyword in the title (padded to reduce false positives on short tokens).
  const paddedTitle = ` ${title} `;
  for (const c of categories) {
    if ((c.keywords || []).some((k) => paddedTitle.includes(k))) return c.id;
  }
  return null;
}

// Normalize a URL for duplicate detection: drop hash + trailing slash, keep query.
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return (u.origin + u.pathname).replace(/\/$/, '') + u.search;
  } catch { return url || ''; }
}

// Build a grouping plan from a list of tabs (each needs at least {id,url,title}).
// Returns [{ key, label, color, ids:[tabId,...] }], only for groups >= minGroupSize.
// aiCategories (Map<tabId, categoryId>) folds in on-device AI for items the heuristics
// could not place; it never overrides a confident match.
export function planGroups(tabs, { minGroupSize = 2, aiCategories = null, categories = DEFAULT_CATEGORIES } = {}) {
  const byCat = new Map();
  const uncategorized = [];

  const place = (t, id) => {
    const m = categoryMeta(id, categories);
    if (!m) return false;
    if (!byCat.has(id)) byCat.set(id, { key: id, label: `${m.emoji} ${m.label}`, color: m.color, ids: [] });
    byCat.get(id).ids.push(t.id);
    return true;
  };

  for (const t of tabs) {
    const id = categorize(t, categories);
    if (id) place(t, id);
    else uncategorized.push(t);
  }

  // Optional AI pass over the leftovers.
  const stillUncategorized = [];
  for (const t of uncategorized) {
    const aid = aiCategories && aiCategories.get(t.id);
    if (aid && place(t, aid)) continue;
    stillUncategorized.push(t);
  }

  // Domain fallback for whatever is left.
  const byDom = new Map();
  for (const t of stillUncategorized) {
    const dom = registrableDomain(t.url || t.pendingUrl || '') || 'other';
    if (!byDom.has(dom)) byDom.set(dom, []);
    byDom.get(dom).push(t.id);
  }

  const groups = [...byCat.values()];
  for (const [dom, ids] of byDom) groups.push({ key: `dom:${dom}`, label: dom, color: 'grey', ids });

  return groups.filter((g) => g.ids.length >= minGroupSize);
}

// Tab ids that are duplicates (2nd+ occurrence of the same normalized URL).
export function findDuplicateTabIds(tabs) {
  const seen = new Set();
  const dupes = [];
  for (const t of tabs) {
    const u = normalizeUrl(t.url || t.pendingUrl || '');
    if (!u) continue;
    if (seen.has(u)) dupes.push(t.id);
    else seen.add(u);
  }
  return dupes;
}

// A stable sort key so related tabs end up adjacent: category order, then domain, then title.
export function sortKey(tab, categories = DEFAULT_CATEGORIES) {
  const id = categorize(tab, categories);
  const catIndex = id ? categories.findIndex((c) => c.id === id) : categories.length;
  const dom = registrableDomain(tab.url || tab.pendingUrl || '');
  return `${String(catIndex).padStart(2, '0')}|${dom}|${(tab.title || '').toLowerCase()}`;
}
