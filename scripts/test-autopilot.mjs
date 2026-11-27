// node scripts/test-autopilot.mjs : Beirut days and hours, 2 h pacing, cutoff, idle days (mock database)
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
const { clock, decide, judge } = await import('../functions/_autopilot.js'), pub = await import('../functions/_publish.js');
const at = (s) => new Date(s + '+02:00'); // Beirut winter time
const run = (s, state = {}) => decide(clock(at(s)), state, at(s));
assert.equal(run('2026-12-01T05:59'), 'early');
assert.equal(run('2026-12-01T06:00'), 'generate');
for (const d of ['11-29', '11-30', '12-02', '12-04']) assert.equal(run(`2026-${d}T08:00`), 'idle', d);
for (const d of ['12-01', '12-03', '12-05']) assert.equal(run(`2026-${d}T08:00`), 'generate', d);
assert.equal(clock(new Date('2026-07-07T03:00:00Z')).time, '06:00'); // summer time
const closed = at('2026-12-01T09:00').toISOString();
assert.equal(run('2026-12-01T10:59', { closed }), 'pacing');
assert.equal(run('2026-12-01T11:00', { closed }), 'generate');
assert.equal(run('2026-12-01T11:00', { pending: true }), 'pending');
assert.equal(run('2026-12-01T11:00', { approved: true, closed }), 'approved');
assert.equal(run('2026-12-01T19:00', { closed }), 'cutoff');
const dir = new URL('../tools/marketing-render/posts/', import.meta.url);
const posts = readdirSync(dir).map((f) => JSON.parse(readFileSync(new URL(f, dir))));
assert.match(judge(posts[0], [{ ...posts[0], id: "earlier" }]), /already used/);

// the tick on an idle day touches only in-flight publishes; on an active day it also looks for due posts
const env = { DATABASE_URL: 'postgres://u:p@h.example/db' }; let seen = [];
globalThis.fetch = async (url, o) => { seen.push(JSON.parse(o.body).query); return new Response('{"rows":[]}'); };
assert.equal((await pub.tick(env, at('2026-11-30T19:00'))).idle, true);
assert.ok(!seen.some((q) => /slot <= now|slot_missed|auto_day|ig_token_|status = 'scheduled'/.test(q)));
seen = []; assert.equal((await pub.tick(env, at('2026-12-01T19:30'))).autopilot, 'cutoff');
assert.ok(seen.some((q) => /slot <= now/.test(q)) && seen.some((q) => /auto_day <=/.test(q)));
console.log('autopilot ok');
// duplicates: queue posts and Instagram page captions
const { repeats } = await import('../functions/_marketing.js');
const fresh = { ...posts[0], id: 'new', keyword: 'ZEBRA', info: { title: 'Parking minder', summary: 'Watches delivery bays.' }, caption: 'Vans block bays.\n\nComment ZEBRA', scenes: [{ say: 'Your delivery bay is blocked again.' }] };
assert.equal(repeats(fresh, posts), '');
assert.match(repeats({ ...fresh, caption: posts[0].caption }, posts), /caption repeats/);
assert.match(repeats(fresh, [{ page: true, caption: fresh.caption.replace('ZEBRA', 'OTHER') }]), /page post/);
assert.match(repeats(fresh, [{ page: true, caption: 'Hello\n\nComment ZEBRA' }]), /Instagram page/);
console.log('duplicates ok');
