// node scripts/ig-intel-test.mjs — offline checks of functions/_igintel.js (fetch and AI are faked).
import assert from 'node:assert';
import { enrich, safeUrl, kindOf, pageLinks } from '../functions/_igintel.js';

const next = { props: { pageProps: { links: [{ title: 'Book a free trial', url: 'https://calendly.com/studio/trial' }, { title: 'Chat', url: 'https://wa.me/96176111222' }, { title: 'Our site', url: 'https://studio-site.com/' }, { title: 'Join', url: 'https://forms.gle/abc' }] } } };
const pages = {
  'https://linktr.ee/studio': `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script><a href="/privacy">p</a><a href="https://linktr.ee/other">x</a>`,
  'https://studio-site.com/': '<style>.a{}</style><p>Write to hello@studio-site.com</p><a href="tel:+9611999888">Call</a><a href="https://maps.app.goo.gl/x">Find us</a><script>var a="+96100000000"</script>',
};
const fetched = [];
globalThis.fetch = async (u) => {
  fetched.push(u);
  if (u === 'https://short.example.com/go') return new Response(null, { status: 302, headers: { location: 'https://wa.me/96178222333' } });
  if (u === 'https://evil.example.com/') return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
  if (u === 'https://down.example.com/') throw new Error('timeout');
  return pages[u] ? new Response(pages[u], { headers: { 'content-type': 'text/html' } }) : new Response('no', { status: 404, headers: { 'content-type': 'text/html' } });
};

for (const u of ['http://127.0.0.1/', 'http://[::1]/', 'http://localhost/', 'http://2130706433/', 'http://a.internal/', 'https://vagent.online/hook/progress', 'ftp://x.com/', 'https://u:p@x.com/', 'https://x.com:8080/']) assert(!safeUrl(u), u);
assert(safeUrl('https://linktr.ee/studio'));
assert.equal(kindOf('https://wa.me/1'), 'WhatsApp'); assert.equal(kindOf('https://forms.gle/a'), 'Form'); assert.equal(kindOf('https://x.com/book-now'), 'Social');
assert.equal(pageLinks(pages['https://linktr.ee/studio'], 'https://linktr.ee/studio').length, 4);

const profile = { handle: 'studio', name: 'Studio', bio: 'Yoga & dance in Baakline, Chouf 🧘\nKids ages 4-12 and ladies\nOrder: 03 123 456 | hi@studio.lb',
  contacts: ['Business phone: +961 3 123 456', 'Business address: Main road, Baakline'],
  links: [{ url: 'https://linktr.ee/studio' }, { url: 'https://short.example.com/go' }, { url: 'https://evil.example.com/' }, { url: 'https://down.example.com/' }],
  recent: [{ date: '2026-11-10', caption: 'Free trial class! Book: ٧١ ١٢٣ ٤٥٦ with @partner.gym\nWorkshop Saturday at @venue.hall. Price 1,500,000 LBP on 25.11.2026, id 17918631873519674', location: 'Jounieh' }, { date: '2026-11-01', caption: 'Hello @studio mail team@studio.lb' }] };
const r = await enrich(profile, { ask: async () => '```json\n{"offer":"Yoga and dance classes","audience":"kids and ladies","ages":"4-12","booking":"free trial","activity":["Workshop Saturday"]}\n```' });
const phone = Object.fromEntries(r.phones.map((x) => [x.normalized, x.sources]));
assert.deepEqual(Object.keys(phone).sort(), ['+961 1 999 888', '+961 3 123 456', '+961 71 123 456', '+961 76 111 222', '+961 78 222 333'], JSON.stringify(r.phones));
assert(phone['+961 71 123 456'].includes('Post 2026-11-10'));
assert.deepEqual(r.emails.map((x) => x.value).sort(), ['hello@studio-site.com', 'hi@studio.lb', 'team@studio.lb']);
const main = r.links[0]; assert(main.sources.includes('Main bio link'));
assert.deepEqual(main.destinations.map((d) => d.kind), ['Booking', 'WhatsApp', 'Website', 'Form']);
assert.equal(r.links.find((l) => l.url.includes('down.')).state, 'unreachable');
assert.equal(r.links.find((l) => l.url.includes('evil.')).state, 'blocked'); assert(!fetched.some((u) => u.includes('127.0.0.1') || u.includes('wa.me')));
for (const p of ['Baakline', 'Chouf', 'Jounieh', 'Main road, Baakline']) assert(r.places.some((x) => x.value === p), p);
assert.deepEqual(r.mentions.map((x) => x.value).sort(), ['partner.gym', 'venue.hall']);
for (const k of ['offer', 'audience', 'booking', 'activity']) assert(r.snapshot.evidence[k].length, k);
assert.equal(r.snapshot.ai.ages, '4-12'); assert.deepEqual(r.posts[0].phones, ['71 123 456']); assert.deepEqual(r.posts[1].emails, ['team@studio.lb']); assert(r.retry);

const q = await enrich({ handle: 'x', bio: '$3 000 000, 2024-2025, 100.000.000', links: [], recent: [] }, { ask: async () => { throw new Error('busy'); } });
assert.equal(q.phones.length, 0); assert.equal(q.snapshot.aiState, 'unavailable'); assert(q.retry);
const e = await enrich({ handle: 'x', private: true }); assert.equal(e.snapshot.aiState, 'skipped'); assert(!e.retry);
console.log('PASS ig-intel: phones, emails, link-in-bio, unsafe links, places, partners, snapshot, per-post, failures');
