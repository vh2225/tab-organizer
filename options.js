import { loadSettings, saveSettings, resetSettings } from './src/settings.js';
import { refreshDataset, getCachedRemote, loadShipped } from './src/dataset.js';

const $ = (s) => document.querySelector(s);
const COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
const catsEl = $('#categories');

if (new URLSearchParams(location.search).get('welcome')) $('#welcome').classList.remove('hidden');

// ---- Categories editor ----
function categoryRow(c = { emoji: '🔖', label: '', color: 'grey', domains: [], keywords: [] }) {
  const row = document.createElement('div');
  row.className = 'cat';
  row.innerHTML = `
    <div class="cat-head">
      <input class="emoji" maxlength="4" value="${esc(c.emoji || '🔖')}" />
      <input class="label" placeholder="Category name" value="${esc(c.label || '')}" />
      <select class="color">${COLORS.map((x) => `<option ${x === c.color ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <button class="remove small ghost" title="Remove">✕</button>
    </div>
    <textarea class="domains" rows="2" placeholder="domains, one per line (e.g. github.com)">${esc((c.domains || []).join('\n'))}</textarea>
    <textarea class="keywords" rows="1" placeholder="title keywords (optional)">${esc((c.keywords || []).join('\n'))}</textarea>
  `;
  row.querySelector('.remove').addEventListener('click', () => row.remove());
  return row;
}

function renderCategories(categories) {
  catsEl.innerHTML = '';
  categories.forEach((c) => catsEl.appendChild(categoryRow(c)));
}

function collectCategories() {
  return [...catsEl.querySelectorAll('.cat')].map((row, i) => ({
    id: slug(row.querySelector('.label').value) || `cat${i}`,
    emoji: row.querySelector('.emoji').value,
    label: row.querySelector('.label').value,
    color: row.querySelector('.color').value,
    domains: row.querySelector('.domains').value,
    keywords: row.querySelector('.keywords').value,
  })).filter((c) => c.label.trim());
}

// ---- Load / save ----
async function init() {
  const settings = await loadSettings();
  $('#minGroupSize').value = settings.minGroupSize;
  $('#useAiByDefault').checked = settings.useAiByDefault;
  $('#groupAcrossWindows').checked = settings.groupAcrossWindows;
  $('#autoGroupOnStartup').checked = settings.autoGroupOnStartup;
  $('#bookmarkParentId').value = settings.bookmarkParentId;
  renderCategories(settings.categories);
}

async function save() {
  await saveSettings({
    minGroupSize: $('#minGroupSize').value,
    useAiByDefault: $('#useAiByDefault').checked,
    groupAcrossWindows: $('#groupAcrossWindows').checked,
    autoGroupOnStartup: $('#autoGroupOnStartup').checked,
    bookmarkParentId: $('#bookmarkParentId').value,
    categories: collectCategories(),
  });
  flash('Saved ✓');
}

function flash(msg) {
  const el = $('#saved');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

// ---- Domain list ----
async function showDatasetStatus() {
  const [cached, shipped] = await Promise.all([getCachedRemote(), loadShipped()]);
  const el = $('#datasetStatus');
  if (cached) {
    const count = Object.keys(cached.domains || {}).length;
    const when = cached.fetchedAt ? new Date(cached.fetchedAt).toLocaleDateString() : 'unknown';
    el.textContent = `Updated ${when} · v${cached.version} · ${count} sites.`;
  } else {
    el.textContent = `Using the built-in list (${Object.keys(shipped).length} sites). No update fetched yet.`;
  }
}

$('#updateDataset').addEventListener('click', async () => {
  const btn = $('#updateDataset');
  btn.disabled = true;
  $('#datasetStatus').textContent = 'Checking…';
  const r = await refreshDataset();
  if (r.updated) $('#datasetStatus').textContent = `Updated ✓ v${r.version} · ${r.count} sites.`;
  else if (r.reason === 'not-modified') { $('#datasetStatus').textContent = 'Already up to date ✓'; }
  else { await showDatasetStatus(); flash('Could not update — using cached/built-in list.'); }
  btn.disabled = false;
});

// ---- Events ----
$('#addCategory').addEventListener('click', () => catsEl.appendChild(categoryRow()));
$('#save').addEventListener('click', save);
$('#reset').addEventListener('click', async () => {
  const s = await resetSettings();
  renderCategories(s.categories);
  $('#minGroupSize').value = s.minGroupSize;
  $('#useAiByDefault').checked = s.useAiByDefault;
  $('#groupAcrossWindows').checked = s.groupAcrossWindows;
  $('#autoGroupOnStartup').checked = s.autoGroupOnStartup;
  flash('Reset to defaults ✓');
});

init();
showDatasetStatus();
