import { loadSettings, saveSettings, resetSettings } from './src/settings.js';
import { getLicense, activate, deactivate, isPro, CHECKOUT_URL, FREE_CATEGORY_LIMIT } from './src/license.js';

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
  const [settings, license, pro] = await Promise.all([loadSettings(), getLicense(), isPro()]);
  $('#minGroupSize').value = settings.minGroupSize;
  $('#useAiByDefault').checked = settings.useAiByDefault;
  $('#autoGroupOnStartup').checked = settings.autoGroupOnStartup;
  $('#bookmarkParentId').value = settings.bookmarkParentId;
  renderCategories(settings.categories);
  renderLicense(license, pro);
}

function renderLicense(license, pro) {
  $('#tier').textContent = pro ? 'Pro' : 'Free';
  $('#tier').classList.toggle('pro', pro);
  $('#licenseState').textContent = pro
    ? `Pro active${license.since ? ` since ${license.since.slice(0, 10)}` : ''}.`
    : 'Free tier.';
  $('#freeBox').classList.toggle('hidden', pro);
  $('#deactivate').classList.toggle('hidden', !pro);
  // Pro-only preference toggles
  for (const id of ['#useAiByDefault', '#autoGroupOnStartup']) {
    $(id).disabled = !pro;
  }
}

async function save() {
  let categories = collectCategories();
  const pro = await isPro();
  if (!pro && categories.length > FREE_CATEGORY_LIMIT) {
    categories = categories.slice(0, FREE_CATEGORY_LIMIT);
    flash(`Free tier keeps up to ${FREE_CATEGORY_LIMIT} categories — extras trimmed. Upgrade for unlimited.`);
  }
  await saveSettings({
    minGroupSize: $('#minGroupSize').value,
    useAiByDefault: $('#useAiByDefault').checked,
    autoGroupOnStartup: $('#autoGroupOnStartup').checked,
    bookmarkParentId: $('#bookmarkParentId').value,
    categories,
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

// ---- Events ----
$('#addCategory').addEventListener('click', () => catsEl.appendChild(categoryRow()));
$('#save').addEventListener('click', save);
$('#reset').addEventListener('click', async () => {
  const s = await resetSettings();
  renderCategories(s.categories);
  $('#minGroupSize').value = s.minGroupSize;
  $('#useAiByDefault').checked = s.useAiByDefault;
  $('#autoGroupOnStartup').checked = s.autoGroupOnStartup;
  flash('Reset to defaults ✓');
});
$('#upgrade').addEventListener('click', () => chrome.tabs.create({ url: CHECKOUT_URL }));
$('#activate').addEventListener('click', async () => {
  const res = await activate($('#licenseKey').value);
  if (!res.ok) { flash(res.error); return; }
  const [license, pro] = await Promise.all([getLicense(), isPro()]);
  renderLicense(license, pro);
  flash('Pro activated ✓');
});
$('#deactivate').addEventListener('click', async () => {
  await deactivate();
  const [license, pro] = await Promise.all([getLicense(), isPro()]);
  renderLicense(license, pro);
  flash('Switched to Free.');
});

init();
