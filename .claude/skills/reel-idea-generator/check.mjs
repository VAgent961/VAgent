#!/usr/bin/env node
// check.mjs list            : what is already used, plus queue states
// check.mjs <post-id> ...   : new drafts must be valid, fresh and renderable
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const { lint } = await import(ROOT + 'functions/_marketing.js');
const R = ROOT + 'tools/marketing-render/';
const posts = readdirSync(R + 'posts').filter((f) => f.endsWith('.json')).map((f) => ({ file: f, ...JSON.parse(readFileSync(R + 'posts/' + f)) }));
async function queue() {
  const r = await fetch('https://vagent.online/hook/marketing', { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return Object.fromEntries((await r.json()).posts.map((p) => [p.id, p.status]));
}
const args = process.argv.slice(2);
if (!args.length) { console.error('usage: check.mjs list | <post-id> ...'); process.exit(2); }

if (args[0] === 'list') {
  let states = {};
  try { states = await queue(); } catch (e) { console.log('queue unreachable:', e.message); }
  for (const p of posts) console.log([p.id, states[p.id] || 'draft', p.keyword, p.direction.world, p.scenes[0].say, p.direction.concept].join(' | '));
  const n = (...s) => posts.filter((p) => s.includes(states[p.id] || 'draft')).length;
  console.log(`unpublished buffer: ${n('draft', 'rendering', 'review', 'scheduled')} (waiting for approval ${n('review')}, approved ${n('scheduled')})`);
  process.exit(0);
}

const STOP = new Set('a an the and or of to in on is it you your we our for with that this who are be can no not never one get just here want comment words word agent vagent'.split(' '));
const words = (s) => new Set(s.toLowerCase().match(/[a-z]{3,}/g)?.filter((w) => !STOP.has(w)).map((w) => w.replace(/s$/, '')) || []);
const alike = (a, b) => { const x = words(a), y = words(b), both = [...x].filter((w) => y.has(w)).length; return both / (x.size + y.size - both || 1); };
let states = {};
try { states = await queue(); } catch (e) { console.log('queue unreachable:', e.message); }
let failed = 0;
for (const id of args) {
  const p = posts.find((x) => x.id === id), errors = [];
  if (!p) { console.log(`FAIL ${id}: no such draft`); failed++; continue; }
  if (p.file !== id + '.json') errors.push('file name must be <id>.json');
  const bad = lint(p); if (bad) errors.push(bad);
  else {
    const say = p.scenes.map((s) => s.say).join(' '), count = say.split(/\s+/).length, first = p.scenes[0].say;
    if (count < 65 || count > 90) errors.push(`script is ${count} words; keep 65-90 (25-35 s)`);
    if (first.split(/\s+/).length > 12) errors.push('first spoken line is over 12 words');
    if (p.scenes.at(-1).shot !== 'cta') errors.push('last scene must be shot "cta"');
    for (const ext of ['mjs', 'json']) if (!existsSync(`${R}worlds/${p.direction.world}.${ext}`)) errors.push(`missing worlds/${p.direction.world}.${ext}`);
    for (const o of posts.filter((x) => x.id !== id)) {
      if (o.keyword === p.keyword) errors.push(`keyword used by ${o.id}`);
      if (o.direction.world === p.direction.world) errors.push(`world used by ${o.id}`);
      for (const [what, a, b, max] of [['first line', first, o.scenes[0].say, .4], ['concept', p.direction.concept, o.direction.concept, .4], ['topic', `${p.info.title} ${p.info.summary}`, `${o.info.title} ${o.info.summary}`, .35], ['script', say, o.scenes.map((s) => s.say).join(' '), .3]]) {
        const v = alike(a, b); if (v >= max) errors.push(`${what} too close to ${o.id} (${v.toFixed(2)})`);
      }
    }
    if ((states[id] || 'draft') === 'draft') { // not in the queue yet: ask HQ about past posts and the Instagram page
      try {
        const secret = readFileSync(homedir() + '/agent-tools/.vagent-webhook-secret', 'utf8').trim();
        const r = await fetch('https://vagent.online/hook/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-VAgent-Secret': secret }, body: JSON.stringify({ action: 'check', post: p }), signal: AbortSignal.timeout(2e5) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
        if (j.duplicate) errors.push(j.duplicate);
      } catch (e) { errors.push('could not check the queue and the Instagram page: ' + e.message); }
    }
    const scorer = ROOT + '.claude/skills/ig-reel/hookscore.py';
    if (!existsSync(scorer)) console.log('note: hookscore.py not installed (scripts/install-ig-skill.sh); hook not scored');
    else {
      let out; try { out = execFileSync('python3', [scorer, '--hook', first, '--json'], { encoding: 'utf8' }); } catch (e) { out = e.stdout; }
      const score = [JSON.parse(out)].flat()[0].score;
      if (score < 75) errors.push(`hook scores ${score}; needs 75+`);
    }
  }
  console.log(errors.length ? `FAIL ${id}: ${errors.join('; ')}` : `ok ${id}`); failed += errors.length ? 1 : 0;
}
process.exit(failed ? 1 : 0);
