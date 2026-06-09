// Integration tests for refreshDataset against a mock chrome.storage.local + injected fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMockChrome } from './mock-chrome.mjs';
import { refreshDataset, getCachedRemote, REMOTE_URL } from '../src/dataset.js';

const res = ({ status = 200, body = null, etag = null }) => ({
  status, ok: status >= 200 && status < 300,
  json: async () => body,
  headers: { get: (h) => (h.toLowerCase() === 'etag' ? etag : null) },
});

test('refreshDataset: 200 validates, caches, and reports count + version', async () => {
  installMockChrome();
  const fetchImpl = async () => res({ status: 200, etag: '"v2"', body: { version: 2, domains: { 'a.com': 'dev', 'b.com': 'ai' } } });
  const out = await refreshDataset({ fetchImpl, now: () => 1000 });
  assert.deepEqual(out, { updated: true, version: 2, count: 2 });
  const cached = await getCachedRemote();
  assert.equal(cached.version, 2);
  assert.equal(cached.etag, '"v2"');
  assert.deepEqual(cached.domains, { 'a.com': 'dev', 'b.com': 'ai' });
});

test('refreshDataset: sends If-None-Match from cached etag and handles 304', async () => {
  installMockChrome();
  // seed a cache with an etag
  await chrome.storage.local.set({ datasetCache: { version: 1, domains: { 'a.com': 'dev' }, etag: '"v1"' } });
  let sentHeaders = null;
  const fetchImpl = async (url, opts) => { sentHeaders = opts.headers; assert.equal(url, REMOTE_URL); return res({ status: 304 }); };
  const out = await refreshDataset({ fetchImpl });
  assert.deepEqual(out, { updated: false, reason: 'not-modified' });
  assert.equal(sentHeaders['If-None-Match'], '"v1"');
  // cache untouched
  assert.deepEqual((await getCachedRemote()).domains, { 'a.com': 'dev' });
});

test('refreshDataset: network error keeps the existing cache', async () => {
  installMockChrome();
  await chrome.storage.local.set({ datasetCache: { version: 1, domains: { 'a.com': 'dev' } } });
  const out = await refreshDataset({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.deepEqual(out, { updated: false, reason: 'error' });
  assert.deepEqual((await getCachedRemote()).domains, { 'a.com': 'dev' });
});

test('refreshDataset: invalid payload is rejected, cache untouched', async () => {
  installMockChrome();
  const out = await refreshDataset({ fetchImpl: async () => res({ status: 200, body: { domains: 'nope' } }) });
  assert.deepEqual(out, { updated: false, reason: 'invalid' });
  assert.equal(await getCachedRemote(), null);
});
