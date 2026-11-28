// node scripts/test-autopilot.mjs : Beirut days and hours, 2 h pacing, cutoff, idle days (mock database)
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
const { clock, decide, judge } = await import('../functions/_autopilot.js'), { langFor, AR, asksFor } = await import('../functions/_lang.js'), pub = await import('../functions/_publish.js');
const at = (s) => new Date(s + '+02:00'); // Beirut winter time
const run = (s, state = {}) => decide(clock(at(s)), state, at(s));
// every day of the week works; the language alternates by calendar day from Sat 28 Nov 2026
assert.equal(run('2026-12-01T05:59'), 'early');
for (const d of ['11-28', '11-29', '11-30', '12-01', '12-02', '12-03', '12-04']) assert.equal(run(`2026-${d}T06:00`), 'generate', d);
assert.deepEqual(['11-27', '11-28', '11-29', '11-30', '12-01', '12-31'].map((d) => langFor(`2026-${d}`)), ['en', AR, 'en', AR, 'en', 'en']);
assert.equal(langFor('2027-01-01'), AR); assert.equal(langFor('2027-03-28') === langFor('2027-03-29'), false); // over the clock change
assert.equal(clock(new Date('2026-11-28T22:30:00Z')).lang, 'en'); // already Sunday in Beirut
assert.equal(clock(new Date('2026-07-07T03:00:00Z')).time, '06:00'); // summer time
const closed = at('2026-12-01T09:00').toISOString();
assert.equal(run('2026-12-01T10:59', { closed }), 'pacing');
assert.equal(run('2026-12-01T11:00', { closed }), 'generate');
assert.equal(run('2026-12-01T11:00', { pending: true }), 'pending');
assert.equal(run('2026-12-01T11:00', { approved: true, closed }), 'approved');
assert.equal(run('2026-12-01T19:00', { closed }), 'cutoff');
const dir = new URL('../tools/marketing-render/posts/', import.meta.url);
const posts = readdirSync(dir).map((f) => JSON.parse(readFileSync(new URL(f, dir))));
const { BEATS, CHAT_BY } = await import('../functions/_scenario.js'), base = posts[0];
const staged = { ...base, topic: { key: 'an-idea', summary: 'An idea.' }, scenes: BEATS.map((shot, i) => ({ ...base.scenes[i === 6 ? base.scenes.length - 1 : i % (base.scenes.length - 1)], shot, say: i === 6 ? base.scenes.at(-1).say : 'You are buried in notes again, here is one calm step.', title: i === 6 ? base.scenes.at(-1).title : 'Lost again?', items: ['One note', 'Two notes'], chat: CHAT_BY[i] ? [CHAT_BY[i], 'I lose track'] : undefined })) };
assert.match(judge(staged, [{ ...base, id: 'earlier' }]), /already used/);

// every day the tick looks for due posts; after the cutoff it drops a late automatic render
const env = { DATABASE_URL: 'postgres://u:p@h.example/db' }; let seen = [];
globalThis.fetch = async (url, o) => { seen.push(JSON.parse(o.body).query); return new Response('{"rows":[]}'); };
for (const d of ['11-30', '12-01']) { seen = []; assert.equal((await pub.tick(env, at(`2026-${d}T19:30`))).autopilot, 'cutoff'); assert.ok(seen.some((q) => /slot <= now/.test(q)) && seen.some((q) => /auto_day <=/.test(q))); }
console.log('autopilot ok');
// duplicates: queue posts and Instagram page captions
const { repeats } = await import('../functions/_marketing.js');
const fresh = { ...posts[0], id: 'new', keyword: 'ZEBRA', info: { title: 'Parking minder', summary: 'Watches delivery bays.' }, caption: 'Vans block bays.\n\nComment ZEBRA', scenes: [{ say: 'Your delivery bay is blocked again.' }] };
assert.equal(repeats(fresh, posts), '');
assert.match(repeats({ ...fresh, caption: posts[0].caption }, posts), /caption repeats/);
assert.match(repeats(fresh, [{ page: true, caption: fresh.caption.replace('ZEBRA', 'OTHER') }]), /page post/);
assert.match(repeats(fresh, [{ page: true, caption: 'Hello\n\nComment ZEBRA' }]), /Instagram page/);
console.log('duplicates ok');
// Meta blocking API access: only the scheduled draft goes on with the queue history; other errors and manual runs still stop
const { history } = await import('../functions/_autopilot.js'), { encrypt } = await import('../functions/_lib.js');
const igEnv = { ...env, ENC_KEY: Buffer.alloc(32).toString('base64') }, sealed = await encrypt(igEnv, 'EAAtest'); let meta = 'API access blocked.';
globalThis.fetch = async (url, o) => {
  if (String(url).includes('facebook.com')) return Response.json({ error: { code: 200, message: meta } }, { status: 400 });
  const { query, params } = JSON.parse(o.body), v = { ig_token: sealed, ig_user: '{"id":"1"}' }[params?.[0]];
  return Response.json({ rows: /marketing_settings/.test(query) && v ? [{ v }] : [] });
};
assert.deepEqual(await history(igEnv, true), []);
await assert.rejects(history(igEnv), /API access blocked/);
meta = 'Other refusal'; await assert.rejects(history(igEnv, true), /Other refusal/);
console.log('blocked page ok');
// Lebanese Arabic: lint, dialect check, and one idea never twice across the two languages
const { lint } = await import('../functions/_marketing.js');
const says = ['شو بيصير إذا زبون سألك بالليل وما حدا رد؟', 'الرسالة بتضل ناطرة، والزبون عم يفتش على محل غيرك هلق.', 'هيدا الـ agent بيقرا السؤال أول ما يوصل وبيفهم شو المطلوب.', 'بعدين بيحضّر جواب واضح من المعلومات يلي إنت عطيتو ياها.', 'إنت بتشوف الجواب وبتوافق عليه قبل ما ينبعت لأي حدا.', 'هيك بيضل المحل عم يرد بطريقة مرتبة حتى لما تكون مشغول كتير.', 'اكتب رد بالتعليقات ومنبعتلك كيف فيك تجربو.'];
const shots = ['hook', 'phone', 'phone', 'flow', 'approve', 'phone', 'cta'], chats = { 1: ['you', 'ضعت بين الرسايل'], 2: ['agent', 'خلّيني فرجيك'], 5: ['you', 'هيك أريح بكتير'] };
const arabic = { id: 'ar1', lang: AR, topic: { key: 'night-customer-replies', summary: 'Customer questions at night go unanswered; an agent drafts replies for approval.' }, keyword: 'رد', info: { title: 'رد بالليل', summary: 'مساعد بيحضّر الردود.' }, direction: { world: 'auto-ar1', concept: 'A shop at night' },
  scenes: says.map((say, i) => ({ say, title: i === 6 ? 'اكتب رد' : 'مين بيرد؟', shot: shots[i], items: ['بيقرا السؤال'], ...(chats[i] && { chat: chats[i] }) })), caption: 'زبون سأل بالليل وما حدا رد؟ هيدا مساعد بيحضّر الجواب وإنت بتوافق عليه قبل ما ينبعت، حتى تضل مرتاح.\n\nاكتب رد بالتعليقات', hashtags: ['#لبنان'] };
assert.equal(judge(arabic, [], AR), ''); assert.match(judge(arabic, [], 'en'), /English/);
assert.match(judge({ ...arabic, scenes: arabic.scenes.map((x, i) => (i === 1 ? { ...x, say: 'سوف تبقى الرسالة بدون جواب حتى الصباح للأسف.' } : x)) }, [], AR), /textbook/);
assert.match(lint({ ...arabic, topic: undefined }), /topic/); assert.match(lint({ ...arabic, caption: 'بلا طلب' }), /caption must ask/);
assert.equal(asksFor('رد', 'اكتب ردود بالتعليقات'), false);
const english = { ...posts[0], id: 'en1', keyword: 'NIGHT', topic: { key: 'night-customer-replies', summary: 'x' } };
assert.match(repeats(arabic, [english]), /topic repeats/); assert.match(repeats({ ...english, id: 'en2', keyword: 'OWL' }, [arabic]), /./);
assert.match(repeats(arabic, [{ ...posts[0], id: 'old', info: { title: 'Night replies', summary: 'Customer questions at night go unanswered; an agent drafts replies for approval.' } }]), /topic repeats/);
console.log('arabic ok');
// the scene: pet and lost customer, fixed beats, short chat bubbles
const edit = (n, o) => judge({ ...arabic, scenes: arabic.scenes.map((x, i) => (i === n ? { ...x, ...o } : x)) }, [], AR);
assert.match(edit(1, { chat: undefined }), /Scene 2 needs/); assert.match(edit(5, { chat: ['agent', 'تمام'] }), /Scene 6 needs/);
assert.match(edit(2, { chat: ['agent', 'ا'.repeat(61)] }), /Scene 3 needs/); assert.match(edit(3, { shot: 'list' }), /shots in order/);
const { stage, tags } = await import('../functions/_scenario.js');
assert.deepEqual(stage(BEATS.map(() => ({ shot: 'list', chat: 'تمام' }))).map((x) => [x.shot, x.chat?.[0]]), BEATS.map((b, i) => [b, CHAT_BY[i]]));
assert.deepEqual(tags(['#Small Business', 'لبنان', '#', '#لبنان']), ['#Small_Business', '#لبنان']);
console.log('scene ok');
