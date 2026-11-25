// Enrich an Instagram profile or a bio link from the terminal (no Apify, no database, no AI).
// usage: node scripts/ig-intel.mjs <profile.json>   (lookup `profile` or a raw Apify profile item)
//        node scripts/ig-intel.mjs https://linktr.ee/name
import { readFileSync } from 'node:fs';
import { enrich } from '../functions/_igintel.js';

const arg = process.argv[2];
if (!arg) { console.error('usage: node scripts/ig-intel.mjs <profile.json | link>'); process.exit(1); }
function load() {
  if (/^https?:\/\//.test(arg)) return { handle: '', links: [{ url: arg }] };
  const j = JSON.parse(readFileSync(arg, 'utf8')), r = j.profile || (Array.isArray(j) ? j[0] : j);
  if (r.handle) return r;
  return { handle: r.username, name: r.fullName, category: r.businessCategoryName, bio: r.biography,
    links: (r.externalUrls?.length ? r.externalUrls : r.externalUrl ? [r.externalUrl] : []).map((x) => (typeof x === 'string' ? { url: x } : x)),
    recent: (r.latestPosts || []).slice(0, 12).map((p) => ({ date: String(p.timestamp || '').slice(0, 10), caption: p.caption, location: p.locationName })) };
}
console.log(JSON.stringify(await enrich(load()), null, 1));
