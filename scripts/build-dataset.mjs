// Maintainer build step (run by you / CI, NOT in the user's browser):
//
//   node scripts/build-dataset.mjs
//
// Generates data/domains.json (the shipped + remote dataset) by merging, in precedence order:
//   1. clean hostnames pulled from DEFAULT_CATEGORIES in src/categorize.js (the code seed)
//   2. data/curated.json (hand-maintained additions)
//   3. publicSources() — pluggable hook for mapping public domain lists to our category ids
//      (starts empty; this is the documented growth path, not boiling the ocean)
// Later sources win. The result is validated and written with a bumped version.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_CATEGORIES } from '../src/categorize.js';
import { mergeDatasets, validateDataset } from '../src/dataset.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'data', 'domains.json');
const CURATED = join(root, 'data', 'curated.json');

// A default-category domain string is dataset-usable only if it's a plain hostname
// (has a dot, no slash/space, no trailing dot). Pattern entries like "amazon.", "localhost",
// "google.com/travel" stay handled by the substring matcher in categorize.js.
const isCleanHost = (d) => /\./.test(d) && !/[/\s]/.test(d) && !d.endsWith('.');

function fromDefaults() {
  const out = {};
  for (const c of DEFAULT_CATEGORIES) for (const d of (c.domains || [])) {
    if (isCleanHost(d)) out[d.toLowerCase()] = c.id;
  }
  return out;
}

function fromCurated() {
  if (!existsSync(CURATED)) return {};
  const raw = JSON.parse(readFileSync(CURATED, 'utf8'));
  delete raw._comment;
  return raw;
}

// Hook for public lists. Map third-party taxonomies to OUR category ids here. Empty for now.
function fromPublicSources() {
  return {};
}

const domains = mergeDatasets(fromDefaults(), fromPublicSources(), fromCurated());

const prevVersion = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')).version || 0) : 0;
const dataset = { version: prevVersion + 1, updated: new Date().toISOString().slice(0, 10), domains };

if (!validateDataset(dataset)) { console.error('Generated dataset failed validation'); process.exit(1); }

writeFileSync(OUT, `${JSON.stringify(dataset, null, 0)}\n`);
console.log(`Wrote ${OUT}: version ${dataset.version}, ${Object.keys(domains).length} domains.`);
