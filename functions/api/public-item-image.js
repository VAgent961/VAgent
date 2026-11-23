import { sql } from '../_lib.js';
import { limited } from '../_voice.js';

// PUBLIC GET /api/public-item-image?id=<item id>[&business_id=<slug>] — the item's photo for the product cards in the Voice AI chat.
// Only photos of items that belong to an ACTIVE business (and to business_id when given). The photo never goes through n8n or the LLM:
// a data:image upload is decoded and served here, an https link is redirected to. Nothing else about the item is returned.
const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams, bid = q.get('business_id') || '', id = q.get('id') || '';
  if (!/^\d{1,10}$/.test(id) || (bid && !/^[a-z0-9-]{1,40}$/i.test(bid))) return notFound();
  if (await limited(env, request, 'img', 300, 600)) return new Response('Too many requests', { status: 429 });
  try {
    const r = await sql(env, "SELECT i.image_url FROM items i JOIN businesses b ON b.id = i.business_id WHERE i.id = $1 AND b.active AND ($2 = '' OR i.business_id = $2) AND coalesce(i.image_url, '') <> ''", [Number(id), bid]);
    const u = r.length ? String(r[0].image_url || '') : '';
    const cache = { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' };
    const m = u.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/i);
    if (m) return new Response(Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), { headers: { 'Content-Type': m[1].toLowerCase(), ...cache } });
    if (/^https:\/\/[^\s"'<>]+$/i.test(u)) return new Response(null, { status: 302, headers: { Location: u, ...cache } });
    return notFound();
  } catch { return new Response('Try again later', { status: 500 }); }
}
