// POST /api/tts {text} -> audio (wav). Proxy to the n8n "Voice TTS" workflow (Groq Orpheus Arabic/English voices, free tier).
// 503 means the voice is not available (e.g. Groq model terms not accepted yet): the browser then falls back to its own voice.
import { json } from '../_lib.js';

const N8N_TTS = 'https://hassan.vagent.online/webhook/voice-tts';

function originOk(request) {
  const src = request.headers.get('origin') || request.headers.get('referer') || '';
  let h; try { h = new URL(src).hostname; } catch { return false; }
  return h === new URL(request.url).hostname || h === 'localhost' || h === '127.0.0.1' || h === 'vagent.online' || h.endsWith('.vagent.online');
}

export async function onRequestPost({ request, env }) {
  if (!originOk(request)) return json({ error: 'Not allowed from this site' }, 403);
  const b = await request.json().catch(() => ({}));
  const text = String(b.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text) return json({ error: 'No text' }, 400);
  try {
    const r = await fetch(env.TTS_URL || N8N_TTS, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(35000) });
    if (!r.ok) return json({ error: 'Voice not available' }, 503);
    return new Response(r.body, { headers: { 'Content-Type': r.headers.get('content-type') || 'audio/wav', 'Cache-Control': 'no-store' } });
  } catch {
    return json({ error: 'Voice not available' }, 503);
  }
}
