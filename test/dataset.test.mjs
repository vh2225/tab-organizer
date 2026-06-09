// Pure logic for the data-driven domain dataset: validation, index build, and merge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset, buildDomainIndex, mergeDatasets } from '../src/dataset.js';

test('validateDataset accepts a well-formed payload and lowercases keys/values', () => {
  const v = validateDataset({ version: 4, domains: { 'GitHub.com': 'Dev', 'ebay.com': 'shopping' } });
  assert.equal(v.version, 4);
  assert.deepEqual(v.domains, { 'github.com': 'dev', 'ebay.com': 'shopping' });
});

test('validateDataset rejects malformed payloads', () => {
  assert.equal(validateDataset(null), null);
  assert.equal(validateDataset({}), null);
  assert.equal(validateDataset({ domains: [] }), null);          // array, not object
  assert.equal(validateDataset({ domains: {} }), null);          // empty
  assert.equal(validateDataset({ domains: { 'x.com': 5 } }), null); // non-string value -> dropped -> empty -> null
});

test('buildDomainIndex layers precedence: user category domains > remote > shipped', () => {
  const categories = [
    { id: 'dev', label: 'Dev', domains: ['github.com'] },
    { id: 'shopping', label: 'Shopping', domains: [] },
  ];
  const shipped = { 'github.com': 'shopping', 'ebay.com': 'shopping' }; // wrong on purpose
  const remote = { 'github.com': 'dev', 'dealcatcher.com': 'shopping' };
  const idx = buildDomainIndex({ shipped, remote, categories });
  assert.equal(idx.get('github.com'), 'dev', 'remote + user override shipped');
  assert.equal(idx.get('ebay.com'), 'shopping', 'shipped entry survives');
  assert.equal(idx.get('dealcatcher.com'), 'shopping', 'remote entry present');
});

test('buildDomainIndex drops entries whose category id is unknown', () => {
  const categories = [{ id: 'dev', label: 'Dev', domains: [] }];
  const idx = buildDomainIndex({ shipped: { 'x.com': 'ghost' }, remote: {}, categories });
  assert.equal(idx.has('x.com'), false);
});

test('mergeDatasets combines sources with later ones winning', () => {
  const merged = mergeDatasets(
    { 'a.com': 'dev' },
    { 'a.com': 'ai', 'b.com': 'news' },
  );
  assert.deepEqual(merged, { 'a.com': 'ai', 'b.com': 'news' });
});
