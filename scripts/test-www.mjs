// Company site checks, no network: node scripts/test-www.mjs
import assert from 'node:assert';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const root = new URL('..', import.meta.url), read = (f) => readFileSync(new URL(f, root), 'utf8'), html = read('www/index.html');
// every local file the page and its scripts point to exists
const refs = [...(html + read('www/site.js')).matchAll(/["'](\/(?:www|assets)\/[^"'?#$]+|\/(?:favicon|apple-touch)[^"'?#]+)["']/g)].map((m) => m[1]);
for (const r of [...refs, ...[0, 1, 2, 3, 4, 5].map((k) => `/www/img/f${k}.webp`), '/www/vendor/three.bundle.min.js']) assert.ok(existsSync(new URL('.' + r, root)), 'missing ' + r);
// public page: no internal endpoints, hosts or addresses
for (const bad of [/\/api\//, /\/hook\//, /\/office\b/, /\/marketing\b/, /adminvoice|hassan\.|boudy\.|fayez\./i, /@gmail\.com/i, /n8n\.vagent/]) assert.ok(!bad.test(html), 'internal reference ' + bad);
assert.equal((html.match(/<h1/g) || []).length, 1);
for (const id of ['hero', 'web', 'design', 'agents', 'infra', 'work', 'process', 'contact']) assert.ok(html.includes(`id="${id}"`), id);
assert.deepEqual([...html.matchAll(/data-formation="(\d)"/g)].map((m) => +m[1]), [0, 1, 2, 3, 4, 5]);
for (const img of html.match(/<img[^>]*>/g)) assert.ok(/\salt=/.test(img), 'alt: ' + img);
assert.match(read('www/site.js'), /prefers-reduced-motion/); assert.ok(!/<script[^>]+three/.test(html), '3D must load lazily');
// budgets (gzip bytes): first load without 3D, then the 3D chunk
const gz = (...f) => f.reduce((n, x) => n + gzipSync(read(x)).length, 0);
const core = gz('www/index.html', 'www/site.css', 'www/site.js', 'www/vendor/gsap.min.js', 'www/vendor/ScrollTrigger.min.js', 'www/vendor/lenis.min.js'), three = gz('www/scene.js', 'www/vendor/three.bundle.min.js');
assert.ok(core < 75e3, 'core ' + core); assert.ok(three < 160e3, '3d ' + three);
assert.ok(statSync(new URL('www/img/f0.webp', root)).size < 150e3);
console.log(`www ok (first load ${(core / 1024).toFixed(0)} kB gz, 3D ${(three / 1024).toFixed(0)} kB gz)`);
