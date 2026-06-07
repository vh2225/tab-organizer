// Unit tests for the pure settings helpers (no chrome.* needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSettings, normalizeCategory, DEFAULT_SETTINGS } from '../src/settings.js';
import { planGroups } from '../src/categorize.js';

test('mergeSettings: empty -> defaults', () => {
  const s = mergeSettings(null);
  assert.equal(s.minGroupSize, DEFAULT_SETTINGS.minGroupSize);
  assert.ok(Array.isArray(s.categories) && s.categories.length > 0);
});

test('mergeSettings: clamps + coerces', () => {
  const s = mergeSettings({ minGroupSize: 999, useAiByDefault: 'yes', bookmarkParentId: 'x' });
  assert.equal(s.minGroupSize, 20);
  assert.equal(s.useAiByDefault, true);
  assert.equal(s.bookmarkParentId, '2'); // invalid -> Other Bookmarks
});

test('normalizeCategory: parses domains from string, validates color', () => {
  const c = normalizeCategory({ label: 'My Cat', color: 'neon', domains: 'a.com, b.com\nc.com', keywords: '' });
  assert.equal(c.color, 'grey'); // invalid color falls back
  assert.deepEqual(c.domains, ['a.com', 'b.com', 'c.com']);
  assert.equal(c.id, 'mycat');
});

test('custom categories drive grouping end-to-end', () => {
  const settings = mergeSettings({
    categories: [{ id: 'fun', label: 'Fun', color: 'pink', emoji: '🎈', domains: 'funsite.com', keywords: '' }],
  });
  const tabs = [
    { id: 1, url: 'https://funsite.com/a', title: '' },
    { id: 2, url: 'https://funsite.com/b', title: '' },
    { id: 3, url: 'https://github.com/x', title: '' }, // not in custom set -> domain fallback (singleton dropped)
  ];
  const groups = planGroups(tabs, { minGroupSize: 2, categories: settings.categories });
  const fun = groups.find((g) => g.key === 'fun');
  assert.ok(fun && fun.ids.length === 2, 'custom category grouped its tabs');
});
