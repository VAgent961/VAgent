// Shared by the Voice Receptionist proxies: /api/voice + /api/tts (owner session) and /api/public-voice + /api/public-tts (public call page).
import { sql, json } from './_lib.js';

const N8N_VOICE = 'https://hassan.vagent.online/webhook/voice-receptionist';
const N8N_TTS = 'https://hassan.vagent.online/webhook/voice-tts';
const MAX_BYTES = 3 * 1024 * 1024; // ~3 MB of audio is minutes of speech

// Our own pages only: same host as the request, localhost, vagent.online or any *.vagent.online (adminvoice., voice. and every client subdomain such as voice1.). An embedded iframe of /call.html still sends its own
// (vagent.online) origin, so client websites can embed the page without being allowed to call the API directly.
export function originOf(request) {
  const src = request.headers.get('origin') || request.headers.get('referer') || '';
  let h; try { h = new URL(src).hostname; } catch { return ''; }
  const ok = h === new URL(request.url).hostname || h === 'localhost' || h === '127.0.0.1' || h === 'vagent.online' || h.endsWith('.vagent.online');
  return ok ? new URL(src).origin : '';
}
export const originOk = (request) => !!originOf(request);

// CORS for the public endpoints: only an allowed origin is echoed back (never *).
export function withCors(request, res) {
  const o = originOf(request);
  if (o) { res.headers.set('Access-Control-Allow-Origin', o); res.headers.set('Vary', 'Origin'); }
  return res;
}
export function preflight(request) {
  const o = originOf(request);
  if (!o) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' } });
}

// Per-IP counter in Neon (table voice_rate). Returns true when the caller is over the limit.
export async function limited(env, request, scope, max, windowSec) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  try {
    const r = await sql(env, 'INSERT INTO voice_rate (k, bucket, n) VALUES ($1, $2, 1) ON CONFLICT (k, bucket) DO UPDATE SET n = voice_rate.n + 1 RETURNING n', [scope + ':' + ip, bucket]);
    if (Math.random() < 0.02) sql(env, 'DELETE FROM voice_rate WHERE bucket < $1', [bucket - 2]).catch(() => {});
    return Number(r[0].n) > max;
  } catch { return false; } // never block real users because the counter failed
}

// The n8n workflow answers "show these item ids"; the photo itself (https link or uploaded data: image) never goes through the LLM.
// Fallback when n8n sends only `show` ids: returns cards {id,title,price,in_stock,url} for items of THIS business only.
async function imagesFor(env, bid, show) {
  const ids = (Array.isArray(show) ? show : []).map((x) => parseInt(x, 10)).filter((x) => x > 0).slice(0, 3);
  if (!ids.length) return [];
  try {
    const rows = await sql(env, "SELECT id, name, price, image_url FROM items WHERE business_id = $1 AND id = ANY($2::bigint[]) AND coalesce(image_url, '') <> ''", [bid, '{' + ids.join(',') + '}']);
    return ids.map((id) => rows.find((r) => Number(r.id) === id)).filter(Boolean).map((r) => {
      const u = String(r.image_url);
      const url = /^https:\/\//i.test(u) || /^data:image\//i.test(u) ? '/api/public-item-image?business_id=' + bid + '&id=' + r.id : '';
      return url ? { id: Number(r.id), title: String(r.name).slice(0, 120), price: Number(r.price), in_stock: true, url } : null;
    }).filter(Boolean);
  } catch { return []; }
}

// Structured sales cards from n8n, re-checked here so the page only ever gets clean, bounded data:
// images[] {id,title,price,in_stock,url (our own /api/public-item-image link or '')}, orderConfirmation (receipt), whatsappHandoff (wa.me link).
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
function cards(j, bid) {
  const imgRe = new RegExp('^/api/public-item-image\\?business_id=' + bid.replace(/[^a-z0-9-]/gi, '') + '&id=\\d{1,10}$', 'i');
  const images = (Array.isArray(j.images) ? j.images : []).slice(0, 3).filter((x) => x && x.title)
    .map((x) => ({ id: num(x.id), title: str(x.title, 120), price: num(x.price), in_stock: x.in_stock !== false, url: imgRe.test(String(x.url || '')) ? String(x.url) : '' }));
  const o = j.orderConfirmation;
  const orderConfirmation = o && o.id ? {
    id: str(o.id, 12).replace(/\D/g, ''), status: 'Pending', total: num(o.total),
    items: (Array.isArray(o.items) ? o.items : []).slice(0, 10).map((l) => ({ name: str(l.name, 120), qty: Math.max(1, parseInt(l.qty, 10) || 1), price: num(l.price) })),
    summary: str(o.summary, 400), name: str(o.name, 120), phone: str(o.phone, 30), address: str(o.address, 300),
  } : null;
  const h = j.whatsappHandoff;
  const whatsappHandoff = h && /^https:\/\/wa\.me\/\d{8,15}(\?text=[^\s"'<>]{0,1500})?$/.test(String(h.url || '')) ? { url: String(h.url), label: str(h.label, 60) || 'Chat with Store on WhatsApp', phone: str(h.phone, 20) } : null;
  return { images, orderConfirmation, whatsappHandoff };
}

export async function proxyVoice(request, env) {
  if (!originOk(request)) return json({ error: 'Not allowed from this site' }, 403);
  const bid = new URL(request.url).searchParams.get('business_id') || '';
  if (!/^[a-z0-9-]{1,40}$/i.test(bid)) return json({ error: 'Bad business_id' }, 400);
  const len = Number(request.headers.get('content-length') || 0);
  if (!len || len > MAX_BYTES) return json({ error: len ? 'Recording too long' : 'Empty request' }, len ? 413 : 400);
  const type = request.headers.get('content-type') || '';
  if (!/^(multipart\/form-data|application\/json)/i.test(type)) return json({ error: 'Bad content type' }, 415);
  try {
    const r = await fetch(`${env.VOICE_URL || N8N_VOICE}?business_id=${encodeURIComponent(bid)}`, {
      method: 'POST', headers: { 'content-type': type }, body: await request.arrayBuffer(), signal: AbortSignal.timeout(60000),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || typeof j.reply !== 'string') return json({ error: 'The receptionist is not answering right now' }, 502);
    const c = cards(j, bid); if (!c.images.length && Array.isArray(j.show)) c.images = await imagesFor(env, bid, j.show); // n8n sends images[]; older builds send show ids
    return json({ reply: j.reply, transcript: j.transcript || '', order_saved: !!j.order_saved, missed_saved: !!j.missed_saved, ...c });
  } catch {
    return json({ error: 'The receptionist took too long. Try again.' }, 504);
  }
}

export async function proxyTts(request, env) {
  if (!originOk(request)) return json({ error: 'Not allowed from this site' }, 403);
  const b = await request.json().catch(() => ({}));
  const text = String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text) return json({ error: 'No text' }, 400);
  const lang = b.lang === 'ar' || b.lang === 'en' ? b.lang : ''; // the active tab locks the voice (Arabic voice / English voice)
  try {
    const r = await fetch(env.TTS_URL || N8N_TTS, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, lang }), signal: AbortSignal.timeout(35000) });
    if (!r.ok) return json({ error: 'Voice not available' }, 503);
    return new Response(r.body, { headers: { 'Content-Type': r.headers.get('content-type') || 'audio/wav', 'Cache-Control': 'no-store' } });
  } catch {
    return json({ error: 'Voice not available' }, 503);
  }
}

// Public endpoints must stop when the owner switched the agent off (businesses.active = false). Returns a Response when offline, else null.
export async function offlineResponse(env, request) {
  const bid = new URL(request.url).searchParams.get('business_id') || '';
  if (!/^[a-z0-9-]{1,40}$/i.test(bid)) return null; // proxyVoice answers bad ids itself
  try {
    const r = await sql(env, 'SELECT b.active, a.status AS acct_status, (a.subscription_end <= now()) AS expired FROM businesses b LEFT JOIN client_accounts a ON a.business_id = b.id WHERE b.id = $1', [bid]);
    if (r.length && (r[0].active === false || (r[0].acct_status && (r[0].acct_status !== 'active' || r[0].expired)))) return json({ error: 'This voice agent is currently offline.', offline: true }, 403);
  } catch { /* if the lookup fails, do not block */ }
  return null;
}
