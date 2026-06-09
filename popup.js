import * as actions from './src/actions.js';
import { availabilityStatus, downloadModel } from './src/ai.js';
import { loadSettings, saveSettings } from './src/settings.js';
import { getUndo } from './src/undo.js';

const $ = (sel) => document.querySelector(sel);
const statusEl = $('#status');

const UNDO_LABEL = { group: 'grouping', sort: 'sort', dedupe: 'duplicate close', ungroup: 'ungroup' };

const MESSAGES = {
  groupTabs: (r) => {
    if (!r.groupsMade) return r.mode === 'cross' ? 'Nothing to group across your windows.' : 'Nothing to group (need 2+ related tabs).';
    const base = `Grouped ${r.tabsGrouped} tabs into ${r.groupsMade} groups`;
    return r.mode === 'cross' && r.merged ? `${base} (merged ${r.merged} from ${r.fromWindows} other window${r.fromWindows === 1 ? '' : 's'}).` : `${base}.`;
  },
  ungroupAll: (r) => r.ungrouped ? `Ungrouped ${r.ungrouped} tabs.` : 'No groups to remove.',
  sortTabs: (r) => `Sorted ${r.sorted} tabs.`,
  dedupeTabs: (r) => r.closed ? `Closed ${r.closed} duplicate tabs.` : 'No duplicates found.',
  saveSession: (r) => `Saved ${r.saved} tabs to “${r.folder}”.`,
  organizeBookmarks: (r) => {
    const parts = [];
    if (r.filed) parts.push(`filed ${r.filed} bookmark${r.filed === 1 ? '' : 's'}`);
    if (r.mergedFolders) parts.push(`merged ${r.mergedFolders} folder${r.mergedFolders === 1 ? '' : 's'}`);
    if (r.deduped) parts.push(`removed ${r.deduped} duplicate${r.deduped === 1 ? '' : 's'}`);
    return parts.length ? `Bookmarks: ${parts.join(', ')}.` : 'Bookmarks already tidy.';
  },
  undo: (r) => r.undone ? `Undid the last ${UNDO_LABEL[r.action] || 'action'}.` : 'Nothing to undo.',
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
    refreshUndo();
  }
}

async function refreshUndo() {
  const rec = await getUndo();
  $('#undoBtn').disabled = !rec;
}

async function initAcrossWindows() {
  const settings = await loadSettings();
  $('#acrossWindows').checked = settings.groupAcrossWindows;
}
$('#acrossWindows').addEventListener('change', (e) => saveSettings({ groupAcrossWindows: e.target.checked }));

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

  // Never auto-show a progress bar (it can sit at 0% forever on managed/unsupported
  // Chrome). Just say it's optional and offer an explicit download button.
  if (status === 'downloadable' || status === 'downloading') {
    $('#aiStatus').textContent = status === 'downloading'
      ? '(on-device AI downloading in the background — optional)'
      : '(on-device AI available to download — optional)';
    $('#aiDownloadBtn').textContent = status === 'downloading'
      ? '📶 Show download progress' : '⬇️ Download on-device AI model';
    $('#aiDownloadBtn').classList.remove('hidden');
  } else {
    $('#aiStatus').textContent = '(model unavailable)';
  }
}

// Trigger / monitor the model download with a real bar. If it doesn't move off 0% within
// a grace period, it stops pretending and explains the likely cause — Nano downloads are
// a Chrome-level component that won't progress on managed/unsupported profiles.
async function runModelDownload() {
  const box = $('#useAi');
  const btn = $('#aiDownloadBtn');
  const bar = $('#aiProgressBar');
  btn.classList.add('hidden');
  bar.style.width = '0%';
  $('#aiProgress').classList.remove('hidden');
  $('#aiStatus').textContent = 'Downloading model… 0%';

  let progressed = false;
  let stalled = false;
  const stallTimer = setTimeout(() => {
    if (progressed) return;
    stalled = true;
    $('#aiProgress').classList.add('hidden');
    $('#aiStatus').textContent = "(download isn't progressing — likely blocked on this Chrome; everything works without it)";
    btn.textContent = '↻ Retry download';
    btn.classList.remove('hidden');
  }, 15000);

  const ok = await downloadModel((loaded) => {
    if (stalled) return;
    if (loaded > 0) progressed = true;
    const pct = Math.round(loaded * 100);
    bar.style.width = `${pct}%`;
    $('#aiStatus').textContent = `Downloading model… ${pct}%`;
  });

  clearTimeout(stallTimer);
  if (stalled) return;
  if (ok) {
    bar.style.width = '100%';
    $('#aiStatus').textContent = '(model ready ✓)';
    box.disabled = false;
    box.checked = true;
    setTimeout(() => $('#aiProgress').classList.add('hidden'), 600);
  } else {
    $('#aiProgress').classList.add('hidden');
    $('#aiStatus').textContent = '(download failed — try again)';
    btn.textContent = '↻ Retry download';
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
initAcrossWindows();
