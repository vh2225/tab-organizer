import * as actions from './src/actions.js';
import { aiAvailable } from './src/ai.js';
import { loadSettings } from './src/settings.js';
import { getLicense, hasFeature, CHECKOUT_URL } from './src/license.js';

const $ = (sel) => document.querySelector(sel);
const statusEl = $('#status');

const MESSAGES = {
  groupTabs: (r) => r.groupsMade ? `Grouped ${r.tabsGrouped} tabs into ${r.groupsMade} groups.` : 'Nothing to group (need 2+ related tabs).',
  ungroupAll: (r) => r.ungrouped ? `Ungrouped ${r.ungrouped} tabs.` : 'No groups to remove.',
  sortTabs: (r) => `Sorted ${r.sorted} tabs.`,
  dedupeTabs: (r) => r.closed ? `Closed ${r.closed} duplicate tabs.` : 'No duplicates found.',
  saveSession: (r) => `Saved ${r.saved} tabs to “${r.folder}”.`,
  organizeBookmarks: (r) => `Filed ${r.filed} bookmarks${r.deduped ? `, removed ${r.deduped} duplicates` : ''}.`,
};

async function run(name) {
  const buttons = document.querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  statusEl.textContent = 'Working…';
  try {
    const opts = name === 'groupTabs' ? { useAi: $('#useAi').checked } : {};
    const result = await actions[name](opts);
    statusEl.textContent = MESSAGES[name] ? MESSAGES[name](result) : 'Done.';
    if (name !== 'organizeBookmarks') refreshSummary();
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function refreshSummary() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const groups = new Set(tabs.map((t) => t.groupId).filter((g) => g != null && g !== -1));
  $('#summary').textContent = `${tabs.length} tabs · ${groups.size} group${groups.size === 1 ? '' : 's'}`;
}

async function initTierAndAi() {
  const [{ tier }, settings, aiOk, canAi] = await Promise.all([
    getLicense(), loadSettings(), aiAvailable(), hasFeature('ai'),
  ]);

  $('#tier').textContent = tier === 'pro' ? 'Pro' : 'Free';
  $('#tier').classList.toggle('pro', tier === 'pro');
  if (tier !== 'pro') $('#upgradeLink').classList.remove('hidden');

  const box = $('#useAi');
  box.checked = settings.useAiByDefault && canAi && aiOk;
  if (!canAi) { box.disabled = true; $('#aiStatus').textContent = '(Pro)'; }
  else if (!aiOk) { box.disabled = true; $('#aiStatus').textContent = '(model unavailable)'; }
}

document.querySelectorAll('button[data-action]').forEach((btn) => {
  btn.addEventListener('click', () => run(btn.dataset.action));
});
$('#settingsLink').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
$('#upgradeLink').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: CHECKOUT_URL }); });

refreshSummary();
initTierAndAi();
