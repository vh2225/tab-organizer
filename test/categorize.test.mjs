// Unit tests for the pure categorization logic. Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categorize, planGroups, findDuplicateTabIds, normalizeUrl, registrableDomain, sortKey, DEFAULT_CATEGORIES,
} from '../src/categorize.js';

const tab = (id, url, title = '') => ({ id, url, title });

test('categorize: domain matches', () => {
  assert.equal(categorize(tab(1, 'https://github.com/foo/bar')), 'dev');
  assert.equal(categorize(tab(2, 'https://www.youtube.com/watch?v=x')), 'media');
  assert.equal(categorize(tab(3, 'https://mail.google.com/mail/u/0')), 'email');
  assert.equal(categorize(tab(4, 'https://chat.openai.com/c/abc')), 'ai');
  assert.equal(categorize(tab(5, 'https://www.amazon.com/dp/123')), 'shopping');
});

test('categorize: keyword fallback via title', () => {
  assert.equal(categorize(tab(1, 'https://example.com/x', 'My flight to Tokyo')), 'travel');
});

test('categorize: domainIndex matches by exact host then registrable domain', () => {
  const idx = new Map([['dealcatcher.com', 'shopping'], ['mail.google.com', 'email']]);
  assert.equal(categorize(tab(1, 'https://dealcatcher.com/x'), DEFAULT_CATEGORIES, idx), 'shopping');
  assert.equal(categorize(tab(2, 'https://www.dealcatcher.com/x'), DEFAULT_CATEGORIES, idx), 'shopping');
  assert.equal(categorize(tab(3, 'https://sub.dealcatcher.com/x'), DEFAULT_CATEGORIES, idx), 'shopping'); // registrable fallback
  assert.equal(categorize(tab(4, 'https://mail.google.com/u/0'), DEFAULT_CATEGORIES, idx), 'email');
});

test('categorize: domainIndex entry is ignored when its category no longer exists', () => {
  const idx = new Map([['weird.xyz', 'ghost-category']]);
  assert.equal(categorize(tab(1, 'https://weird.xyz/a'), DEFAULT_CATEGORIES, idx), null);
});

test('categorize: skips chrome:// and unknown', () => {
  assert.equal(categorize(tab(1, 'chrome://extensions')), null);
  assert.equal(categorize(tab(2, 'https://some-random-blog.xyz/post', 'hello')), null);
});

test('registrableDomain', () => {
  assert.equal(registrableDomain('https://a.b.example.com/x'), 'example.com');
  assert.equal(registrableDomain('https://example.com'), 'example.com');
});

test('normalizeUrl strips hash + trailing slash, keeps query', () => {
  assert.equal(normalizeUrl('https://x.com/a/#frag'), 'https://x.com/a');
  assert.equal(normalizeUrl('https://x.com/a?q=1'), 'https://x.com/a?q=1');
});

test('findDuplicateTabIds keeps first, flags later copies', () => {
  const tabs = [
    tab(1, 'https://x.com/a'),
    tab(2, 'https://x.com/a#frag'),
    tab(3, 'https://x.com/b'),
    tab(4, 'https://x.com/a/'),
  ];
  assert.deepEqual(findDuplicateTabIds(tabs).sort(), [2, 4]);
});

test('planGroups: groups by category, drops singletons, domain-falls-back', () => {
  const tabs = [
    tab(1, 'https://github.com/a'),
    tab(2, 'https://stackoverflow.com/q/1'),
    tab(3, 'https://youtube.com/watch?v=1'),     // media singleton -> dropped
    tab(4, 'https://blog.acme.io/one'),
    tab(5, 'https://docs.acme.io/two'),          // same registrable domain acme.io -> grouped
  ];
  const groups = planGroups(tabs, { minGroupSize: 2 });
  const dev = groups.find((g) => g.key === 'dev');
  assert.ok(dev && dev.ids.length === 2, 'dev group has 2 tabs');
  assert.ok(!groups.find((g) => g.key === 'media'), 'media singleton dropped');
  const acme = groups.find((g) => g.key === 'dom:acme.io');
  assert.ok(acme && acme.ids.length === 2, 'acme.io domain fallback group');
});

test('planGroups: AI assignment folds leftovers into a category', () => {
  const tabs = [tab(1, 'https://github.com/a'), tab(2, 'https://github.com/b'), tab(3, 'https://weird.xyz/x')];
  const ai = new Map([[3, 'dev']]);
  const groups = planGroups(tabs, { minGroupSize: 2, aiCategories: ai });
  const dev = groups.find((g) => g.key === 'dev');
  assert.equal(dev.ids.length, 3, 'AI-tagged tab joined the dev group');
});

test('sortKey orders by category then domain', () => {
  const a = sortKey(tab(1, 'https://github.com/a'));   // dev (index 0)
  const b = sortKey(tab(2, 'https://youtube.com/x'));  // media (later)
  assert.ok(a < b, 'dev sorts before media');
});
