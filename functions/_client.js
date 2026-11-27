// Voice AI SaaS: client (business owner) auth + subscription helpers, shared by functions/api/client/* and the HQ accounts API.
// A client's business_id ALWAYS comes from the signed session cookie "vc_session" (-> client_accounts row), never from the request.
import { sql, json } from './_lib.js';

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

// Signed cookie, separate name + separate HMAC domain ("client:") from the HQ owner session, so one can never be used as the other.
export async function makeClientSession(env, accountId, hours) {
  const body = b64u(enc.encode(JSON.stringify({ c: accountId, x: Date.now() + hours * 3600e3 })));
  return body + '.' + (await hmac(env.SESSION_SECRET, 'client:' + body));
}
export async function readClientSession(env, request) {
  const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)vc_session=([^;]+)/);
  if (!m || !env.SESSION_SECRET) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig || (await hmac(env.SESSION_SECRET, 'client:' + body)) !== sig) return null;
  try { const p = JSON.parse(new TextDecoder().decode(unb64u(body))); return p.x > Date.now() && Number.isInteger(p.c) ? p : null; } catch { return null; }
}
export const clientCookie = (value, maxAge) => 'vc_session=' + value + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + maxAge;

// One account row + live subscription numbers computed by Postgres (so "expired" is decided by the database clock).
export const ACCOUNT_COLS = `id, business_id, business_name, slug, custom_subdomain, email, phone, subscription_start, subscription_end, status, created_at,
  (subscription_end <= now()) AS expired, GREATEST(0, CEIL(EXTRACT(EPOCH FROM (subscription_end - now())) / 86400))::int AS days_left`;
export const stateOf = (r) => (r.status === 'canceled' ? 'canceled' : r.expired ? 'expired' : r.days_left <= 2 ? 'expiring' : 'active');
export const voiceLinks = (r) => ({ voice_link: 'https://voice.vagent.online/' + r.slug, custom_link: r.custom_subdomain ? 'https://' + r.custom_subdomain : '' });

// State-changing requests must come from the portal itself (Origin host = this host); SameSite=Strict is the second layer.
export function sameOriginOk(request) {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return true;
  let h; try { h = new URL(request.headers.get('origin') || '').hostname; } catch { return false; }
  const mine = new URL(request.url).hostname;
  return h === mine || h === 'localhost' || h === '127.0.0.1';
}

// Every client route starts with this. Returns { client } (the account row) or { res } (the error response to send).
export async function requireClient({ request, env }) {
  if (!sameOriginOk(request)) return { res: json({ error: 'Not allowed from this site' }, 403) };
  const s = await readClientSession(env, request);
  if (!s) return { res: json({ error: 'Please sign in.', code: 'login' }, 401) };
  let row;
  try { [row] = await sql(env, `SELECT ${ACCOUNT_COLS} FROM client_accounts WHERE id = $1`, [s.c]); } catch { return { res: json({ error: 'Try again in a moment.' }, 500) }; }
  if (!row) return { res: json({ error: 'Please sign in.', code: 'login' }, 401) };
  const st = stateOf(row);
  if (st === 'canceled' || st === 'expired') return { res: json({ error: st === 'canceled' ? 'This account was canceled.' : 'Your subscription has ended. Please renew with VAgent.', code: 'subscription' }, 403) };
  return { client: row };
}

// ---- validation helpers (used by the HQ accounts API too)
export const RESERVED_SLUGS = new Set(['city', 'www', 'adminvoice', 'voice', 'api', 'admin', 'mail', 'app', 'hq', 'office', 'call', 'login', 'static', 'assets', 'ftp', 'n8n', 'hassan', 'boudy', 'fayez', 'demo']);
export const slugOk = (s) => /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(s) && !RESERVED_SLUGS.has(s);
export const emailOk = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) && e.length <= 200;
// WhatsApp number -> digits with country code (Lebanon default: 03 123 456 -> 9613123456)
export function phoneDigits(p) {
  let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '961' + d.slice(1);
  return d.length >= 8 && d.length <= 15 ? d : '';
}

export function cleanItem(b) {
  const name = String(b.name || '').trim().slice(0, 120); if (!name) return { error: 'Give the item a name.' };
  const price = Math.round(Number(b.price) * 100) / 100; if (!Number.isFinite(price) || price < 0 || price > 1e9) return { error: 'Price must be a number (0 or more).' };
  const quantity = Math.trunc(Number(b.quantity)); if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1e6) return { error: 'Quantity must be a whole number (0 or more).' };
  const custom = {};
  if (b.custom_fields && typeof b.custom_fields === 'object' && !Array.isArray(b.custom_fields)) {
    const ent = Object.entries(b.custom_fields); if (ent.length > 30) return { error: 'Max 30 extra fields per item.' };
    for (const [k, v] of ent) { const key = String(k).trim().slice(0, 40); if (key) custom[key] = String(v ?? '').trim().slice(0, 300); }
  }
  // Image: an https:// link or a small uploaded image (data:image/webp|jpeg|png, compressed in the browser to ~400px; capped at 150k characters = ~110 KB). Anything else is refused.
  let image = String(b.image_url || '').trim();
  if (image) {
    const link = /^https:\/\/[^\s"'<>\\]{4,1900}$/i.test(image), upload = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(image) && image.length <= 150000;
    if (!link && !upload) return { error: 'Image must be an https:// link or an uploaded picture (about 110 KB max).' };
  } else image = null;
  return { name, price, quantity, available: b.available !== false, custom, image };
}
