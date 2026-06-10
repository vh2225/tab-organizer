// Generates Chrome Web Store screenshots (1280×800) from the real extension pages.
// Loads the unpacked extension into Chromium via Playwright, opens the popup and
// options pages as tabs, dresses them on a studio backdrop, and saves PNGs to
// store/screenshots/. The "messy window → grouped" hero shot still needs a real
// desktop session (the tab strip isn't page content), so capture that one by hand.
//
// Run: NODE_PATH=$(npm root -g) node scripts/store-screenshots.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'store', 'screenshots');
mkdirSync(OUT, { recursive: true });

const context = await chromium.launchPersistentContext(join(tmpdir(), 'tab-org-shots'), {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
});

let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent('serviceworker');
const extId = new URL(worker.url()).host;

const BACKDROP = `
  html { background: radial-gradient(60rem 30rem at 50% -10rem, #d8f3ef, #fbfaf8 60%) fixed; }
`;

// Popup: fixed-width card — center it on the backdrop like a hero card.
const popup = await context.newPage();
await popup.goto(`chrome-extension://${extId}/popup.html`);
await popup.addStyleTag({ content: `${BACKDROP}
  body { margin: 56px auto; box-shadow: 0 30px 80px -30px rgba(10,40,36,.45); border-radius: 14px; }
` });
await popup.waitForTimeout(600); // let summary/AI status settle
await popup.screenshot({ path: join(OUT, '2-popup.png') });

// Options page: full page, fits the frame as-is.
const options = await context.newPage();
await options.goto(`chrome-extension://${extId}/options.html`);
await options.addStyleTag({ content: BACKDROP });
await options.waitForTimeout(400);
await options.screenshot({ path: join(OUT, '3-options.png') });

await context.close();
console.log(`Saved 1280×800 screenshots to ${OUT} (extension ${extId})`);
