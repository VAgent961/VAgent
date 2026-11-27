#!/usr/bin/env node
// reel.mjs status [post-id ...]  : queue state of posts
// reel.mjs wait <post-id> ...    : wait (up to 9 min) until each reaches review or fails
// reel.mjs clean [--dry]         : delete local video/temp files of published and declined posts
import { readdirSync, rmSync, existsSync, lstatSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

async function states() {
  const r = await fetch('https://city.vagent.online/hook/marketing', { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('queue: HTTP ' + r.status);
  return Object.fromEntries((await r.json()).posts.map((p) => [p.id, p.status]));
}
export const localDirs = () => [join(homedir(), 'Movies', 'VAgent'), join(homedir(), 'Movies'), ...['out', 'tmp'].map((d) => join(ROOT, 'tools/marketing-render', d)), join(ROOT, 'tmp'), tmpdir()];
// Only our own names match: vagent-reel-<id>, followed by nothing or by . _ or --
// so "x-1" never takes the files of "x-10", and other files in ~/Movies are never touched.
export function matches(dirs, closed) {
  const out = [];
  for (const d of dirs) {
    if (!existsSync(d) || !lstatSync(d).isDirectory()) continue;
    for (const f of readdirSync(d)) if (closed.some((id) => f === `vagent-reel-${id}` || [`.`, `_`, `--`].some((s) => f.startsWith(`vagent-reel-${id}${s}`)))) out.push(join(d, f));
  }
  return out;
}

async function main([cmd, ...args]) {
  if (cmd === 'clean') {
    const all = await states(); // unreachable queue = error, and nothing is deleted
    const found = matches(localDirs(), Object.keys(all).filter((id) => ['published', 'declined'].includes(all[id])));
    for (const f of found) { if (!args.includes('--dry')) rmSync(f, { recursive: true, force: true }); console.log(args.includes('--dry') ? 'would delete' : 'deleted', f); }
    console.log(`${found.length} local file(s)`); return 0;
  }
  if (cmd === 'status') {
    const all = await states();
    for (const id of args.length ? args : Object.keys(all)) console.log(id, all[id] || 'not in queue');
    return 0;
  }
  if (cmd === 'wait' && args.length) {
    const end = Date.now() + 54e4;
    for (;;) {
      const all = await states(), open = args.filter((id) => !all[id] || all[id] === 'rendering');
      if (!open.length || Date.now() > end) { for (const id of args) console.log(id, all[id] || 'not in queue'); return args.every((id) => all[id] === 'review') ? 0 : 1; }
      await new Promise((r) => setTimeout(r, 30000));
    }
  }
  console.error('usage: reel.mjs status [id ...] | wait <id ...> | clean [--dry]'); return 2;
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exit(await main(process.argv.slice(2)));
