// Freemium licensing spine. Keeps a clean seam so you can wire ANY checkout without
// touching feature code. Default tier is "free"; Pro unlocks automation + on-device AI.
//
// Tiering rationale (classic, defensible split): manual organizing is free (drives
// installs + word of mouth); "set it and forget it" automation + AI is Pro.
//
// HOW TO MONETIZE (pick one — no secrets live in this repo):
//   1. ExtensionPay (easiest for MV3): https://extensionpay.com — replace
//      checkRemoteLicense() with extpay.getUser(), and set CHECKOUT_URL to your pay page.
//   2. Stripe Payment Link + license key: sell a key, user pastes it in Options;
//      verify it in checkRemoteLicense() against your endpoint. Set CHECKOUT_URL to the link.
// Until then the extension runs fully as Free, and Pro can be unlocked locally for testing.

export const PRO_FEATURES = ['ai', 'autoGroup', 'scheduledClean', 'customCategoriesUnlimited'];
export const FREE_CATEGORY_LIMIT = 12; // free users can keep/edit up to the default set

// Set this to your real checkout (ExtensionPay page or Stripe Payment Link) before publishing.
export const CHECKOUT_URL = 'https://example.com/upgrade';

const KEY = 'license';

export async function getLicense() {
  const got = await chrome.storage.sync.get(KEY);
  const l = got[KEY] || {};
  return { tier: l.tier === 'pro' ? 'pro' : 'free', key: l.key || null, since: l.since || null };
}

export async function isPro() {
  return (await getLicense()).tier === 'pro';
}

export async function hasFeature(feature) {
  if (!PRO_FEATURES.includes(feature)) return true; // free feature
  return isPro();
}

// Local unlock for development / manual key entry. Swap the body for a real remote
// verification when you wire a provider (see header).
export async function activate(key) {
  const ok = await checkRemoteLicense(key);
  if (!ok) return { ok: false, error: 'Invalid or unrecognized license key.' };
  await chrome.storage.sync.set({ [KEY]: { tier: 'pro', key, since: new Date().toISOString() } });
  return { ok: true };
}

export async function deactivate() {
  await chrome.storage.sync.remove(KEY);
}

// STUB: returns true for any non-empty key so you can test the Pro flow today.
// Replace with ExtensionPay's getUser().paid check or your Stripe/license endpoint.
async function checkRemoteLicense(key) {
  return typeof key === 'string' && key.trim().length >= 6;
}
