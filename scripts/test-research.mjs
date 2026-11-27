// node scripts/test-research.mjs : offline checks of the Sniper research buttons (all fetches faked).
import assert from 'node:assert';
import { inspect, scoreLead, discover, audit, outreach, proposal } from '../functions/_research.js';
import { onRequestPost } from '../functions/api/sniper/research.js';

const calls = []; let ai = null;
const html = (b) => new Response(b, { headers: { 'content-type': 'text/html' } }), j = (o) => new Response(JSON.stringify(o));
const place = (title, website, id) => ({ title, website, place_id: id, data_id: 'd' + id, address: 'Hamra, Beirut', phone: '+961 1 000 000', rating: 4.1, reviews: 90, type: 'Dentist' });
globalThis.fetch = async (u, o) => {
  const x = new URL(u); calls.push(x.href);
  if (x.host === 'brain.test') return j({ ok: !!ai, text: ai });
  if (x.pathname === '/account.json') return j({ searches_per_month: 100, this_month_usage: 1, plan_searches_left: 99 });
  if (x.host === 'serpapi.com') return x.searchParams.get('engine') === 'google_maps_reviews' ? j({ reviews: [1, 2, 3].map((i) => ({ rating: 1, snippet: 'Nobody answers the phone ' + i })) })
    : j({ local_results: [place('Weak Dental', 'http://weak.example.com', 'a'), place('No Site Dental', '', 'b'), { ...place('Gone', '', 'c'), open_state: 'Permanently closed' }] });
  if (x.host === 'weak.example.com') return html('<html><head><title>Weak Dental</title></head><body><p>' + 'Dental clinic in Beirut. '.repeat(30) + '</p></body></html>');
  if (x.host === 'good.example.com') return html('<html><head><title>Good</title><meta name="viewport" content="width=device-width"><meta name="description" content="d"><script type="application/ld+json">{}</script></head><body><h1>Good</h1><a href="tel:+9611222333">Call</a><a href="https://calendly.com/x">Book now</a><p>' + 'text '.repeat(100) + '© 2026</p></body></html>');
  if (x.host === 'blocked.example.com') return new Response('no', { status: 403 });
  if (x.host === 'js.example.com') return html('<html><head><title>App</title></head><body><div id="root"></div><script src="a.js"></script></body></html>');
  return new Response('', { status: 404 });
};
const env = { SERPAPI_API_KEY: 'k', BRAIN_URL: 'https://brain.test/' };

const good = await inspect('good.example.com'); assert.deepEqual(good.gaps, []);
assert.deepEqual((await inspect('https://blocked.example.com')).gaps, []);                       // refused = unverified, no points
assert(!(await inspect('js.example.com')).gaps.some((g) => g.key === 'booking'));
assert.equal((await inspect('http://127.0.0.1')).status, 'unchecked'); assert(!calls.some((c) => c.includes('127.0.0.1')));
assert.equal((await inspect('instagram.com/abc')).status, 'social');

const none = await scoreLead({ name: 'No Site Dental', address: 'Beirut', reviews: 90, phone: '1', mapsUrl: 'https://maps.test/b', source: 'maps' }, 'dental clinics in Beirut');
assert.equal(none.score, 100); assert.equal(none.tier, 'Hot'); assert(none.gaps[0].url);
const ok = await scoreLead({ website: 'good.example.com', source: 'list' }, 'dental in Beirut'); assert.equal(ok.parts.gap, 0); assert.equal(ok.parts.signal, 0);
const weak = await scoreLead({ website: 'weak.example.com', source: 'list' }, 'dental in Beirut'); assert.equal(weak.parts.gap, 25); assert.equal(weak.parts.fit, 20); assert(weak.gaps.every((g) => g.url && g.date));

// credit protection
const req = (b, role = 'owner') => onRequestPost({ request: new Request('https://x/api', { method: 'POST', body: JSON.stringify(b) }), env, data: { role, owner: 'hassan@x' } });
calls.length = 0;
assert.equal((await req({ action: 'discover', query: 'dentists in Beirut' })).status, 400);
await audit(env, { input: 'weak.example.com', paid: false });
await req({ action: 'score', lead: { website: 'good.example.com' } });
assert(!calls.some((c) => c.includes('serpapi') || c.includes('apify') || c.includes('webhook')));
assert.equal((await req({ action: 'discover' }, 'client')).status, 403);
const d = await discover(env, 'dentists in Beirut'); assert.equal(d.leads.length, 2); assert.equal(d.closed, 1);
assert.equal(calls.filter((c) => c.includes('search.json')).length, 1);

ai = '{"themes":[{"theme":"nobody answers the phone","ids":[1,2,99]}]}';
const a = await audit(env, { input: 'Weak Dental', area: 'Beirut', paid: true });
assert.equal(a.credits, 3); assert.equal(a.findings.length, 3); assert(a.findings.every((f) => f.url)); assert(a.findings.concat(a.otherFindings).some((f) => f.key === 'review'));
const other = await audit(env, { input: 'Totally Different Co', paid: true }); assert.equal(other.listing, null); assert.equal(other.findings.length, 0);

ai = JSON.stringify({ subject: 'Booking', opener: 'Hi — we saw no booking link!\n\nCan we show you? 🙂\n[Your name]', followup1: 'Following up.', followup2: 'Last note.' });
const o = await outreach(env, { name: 'Weak', findings: a.findings, sender: 'Hassan' }); assert.equal(o.by, 'ai'); assert(!/[—!🙂]/u.test(o.opener));
ai = JSON.stringify({ opener: 'You lose 40% of customers.', followup1: 'a', followup2: 'b' });
const t = await outreach(env, { name: 'Weak', findings: a.findings, channel: 'whatsapp' }); assert.equal(t.by, 'template'); assert.equal(t.status, 'DRAFT - not sent');
await assert.rejects(outreach(env, { name: 'x', findings: [] }), /No proven finding/);

const p = proposal({ name: 'Weak Dental', service: 'automation', findings: a.findings }); assert(p.missing.includes('[PRICE]') && /Not included/.test(p.text));
assert(/1200 USD/.test(proposal({ name: 'x', price: '1200', findings: [] }).text));
console.log('PASS research: inspection, scoring, credit protection, audit attribution, draft guards, proposal');
