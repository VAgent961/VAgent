// POST /api/voice?business_id=demo-cafe  (multipart: audio + history JSON string, or JSON {text, history})
// Proxy to the n8n Voice Receptionist so the n8n URL stays hidden and only our own pages can use it.
// The owner-session check is done by _middleware.js (all /api/* routes).
import { json } from '../_lib.js';

const N8N_VOICE = 'https://hassan.vagent.online/webhook/voice-receptionist';
const MAX_BYTES = 3 * 1024 * 1024; // ~3 MB of audio is minutes of speech

function originOk(request) {
  const src = request.headers.get('origin') || request.headers.get('referer') || '';
  if (!src) return false;
  let h; try { h = new URL(src).hostname; } catch { return false; }
  return h === new URL(request.url).hostname || h === 'localhost' || h === '127.0.0.1' || h === 'vagent.online' || h.endsWith('.vagent.online');
}

export async function onRequestPost({ request, env }) {
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
    return json({ reply: j.reply, transcript: j.transcript || '', order_saved: !!j.order_saved });
  } catch {
    return json({ error: 'The receptionist took too long. Try again.' }, 504);
  }
}
