// PUBLIC GET /api/public-item-image?id=<item id> — serves an uploaded product photo (stored as a data:image URL) for the Voice AI chat.
// Only photos of items that belong to an ACTIVE business; https-linked photos are redirected. Nothing else about the item is returned.
import { sql } from '../_lib.js';
export async function onRequestGet({ request, env }) {
  const id = parseInt(new URL(request.url).searchParams.get('id') || '', 10);
  if (!(id > 0)) return new Response('Bad id', { status: 400 });
  let r; try { r = await sql(env, "SELECT i.image_url FROM items i JOIN businesses b ON b.id = i.business_id WHERE i.id = $1 AND b.active AND coalesce(i.image_url, '') <> ''", [id]); } catch { return new Response('Error', { status: 500 }); }
  const u = r[0] && String(r[0].image_url || '');
  if (!u) return new Response('No photo', { status: 404 });
  if (/^https:\/\//i.test(u)) return Response.redirect(u, 302);
  const m = u.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) return new Response('Bad image', { status: 404 });
  const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  return new Response(bin, { headers: { 'Content-Type': m[1].toLowerCase(), 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
}
