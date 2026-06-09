import * as actions from './src/actions.js';
import { availabilityStatus, downloadModel } from './src/ai.js';
import { loadSettings } from './src/settings.js';
import { getUndo } from './src/undo.js';

const $ = (sel) => document.querySelector(sel);
const statusEl = $('#status');

const UNDO_LABEL = { group: 'grouping', sort: 'sort', dedupe: 'duplicate close', ungroup: 'ungroup' };

const MESSAGES = {
  groupTabs: (r) => r.groupsMade ? `Grouped ${r.tabsGrouped} tabs into ${r.groupsMade} groups.` : 'Nothing to group (need 2+ related tabs).',
  gatherAndGroup: (r) => r.groupsMade
    ? `Merged ${r.merged} tab${r.merged === 1 ? '' : 's'} from ${r.fromWindows} other window${r.fromWindows === 1 ? '' : 's'} into ${r.groupsMade} group${r.groupsMade === 1 ? '' : 's'}.`
    : 'Nothing is scattered across windows.',
  ungroupAll: (r) => r.ungrouped ? `Ungrouped ${r.ungrouped} tabs.` : 'No groups to remove.',
  sortTabs: (r) => `Sorted ${r.sorted} tabs.`,
  dedupeTabs: (r) => r.closed ? `Closed ${r.closed} duplicate tabs.` : 'No duplicates found.',
  saveSession: (r) => `Saved ${r.saved} tabs to “${r.folder}”.`,
  organizeBookmarks: (r) => `Filed ${r.filed} bookmarks${r.deduped ? `, removed ${r.deduped} duplicates` : ''}.`,
  undo: (r) => r.undone ? `Undid the last ${UNDO_LABEL[r.action] || 'action'}.` : 'Nothing to undo.',
};

async function run(name) {
  const buttons = document.querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  statusEl.textContent = 'Working…';
  try {
    const opts = (name === 'groupTabs' || name === 'gatherAndGroup') ? { useAi: $('#useAi').checked } : {};
    const result = await actions[name](opts);
    statusEl.textContent = MESSAGES[name] ? MESSAGES[name](result) : 'Done.';
    if (name !== 'organizeBookmarks') refreshSummary();
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    buttons.forEach((b) => (b.disabled = false));
    refreshUndo();
  }
}

async function refreshUndo() {
  const rec = await getUndo();
  $('#undoBtn').disabled = !rec;
}

async function refreshSummary() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const groups = new Set(tabs.map((t) => t.groupId).filter((g) => g != null && g !== -1));
  $('#summary').textContent = `${tabs.length} tabs · ${groups.size} group${groups.size === 1 ? '' : 's'}`;
}

async function initAi() {
  const [settings, status] = await Promise.all([loadSettings(), availabilityStatus()]);
  const box = $('#useAi');
  const ready = status === 'available';
  box.checked = settings.useAiByDefault && ready;
  box.disabled = !ready;

  if (ready) { $('#aiStatus').textContent = ''; return; }
  if (status === 'downloading') {
    runModelDownload();              // already downloading — show live progress
  } else if (status === 'downloadable') {
    $('#aiStatus').textContent = '(on-device AI available to download)';
    $('#aiDownloadBtn').classList.remove('hidden');
  } else {
    $('#aiStatus').textContent = '(model unavailable)';
  }
}

// Trigger / monitor the model download and reflect progress in a real bar + percentage,
// instead of a generic "Working…". Resolves when the model is ready (or fails).
async function runModelDownload() {
  const box = $('#useAi');
  const btn = $('#aiDownloadBtn');
  const bar = $('#aiProgressBar');
  btn.classList.add('hidden');
  $('#aiProgress').classList.remove('hidden');
  $('#aiStatus').textContent = 'Downloading model… 0%';

  const ok = await downloadModel((loaded) => {
    const pct = Math.round(loaded * 100);
    bar.style.width = `${pct}%`;
    $('#aiStatus').textContent = `Downloading model… ${pct}%`;
  });

  if (ok) {
    bar.style.width = '100%';
    $('#aiStatus').textContent = '(model ready ✓)';
    box.disabled = false;
    box.checked = true;
    setTimeout(() => $('#aiProgress').classList.add('hidden'), 600);
  } else {
    $('#aiProgress').classList.add('hidden');
    $('#aiStatus').textContent = '(download failed — try again)';
    btn.classList.remove('hidden');
  }
}

document.querySelectorAll('button[data-action]').forEach((btn) => {
  btn.addEventListener('click', () => run(btn.dataset.action));
});
$('#settingsLink').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
$('#aiDownloadBtn').addEventListener('click', runModelDownload);

refreshSummary();
initAi();
refreshUndo();
