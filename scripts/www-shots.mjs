// Regenerates the site's images from the real scene: www/img/f0..f5.webp (fallback stills) and share.jpg.
// usage: node scripts/www-shots.mjs   (needs Chrome and Playwright; PLAYWRIGHT=<path to the module> if not installed here)
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { serve } from './www-preview.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || homedir() + '/agent-tools/site-checker/node_modules/playwright');
const img = new URL('../www/img/', import.meta.url);
const server = await serve(8791), browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('http://127.0.0.1:8791/');
await page.waitForFunction(() => window.__vagentScene, null, { timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: new URL('share.jpg', img).pathname, type: 'jpeg', quality: 86 });
for (let k = 0; k < 6; k++) {
  const url = await page.evaluate((k) => window.__vagentScene.still(k, 900, 900), k);
  writeFileSync(new URL(`f${k}.webp`, img), Buffer.from(url.split(',')[1], 'base64'));
}
await browser.close(); server.close(); console.log('stills + share.jpg written');
