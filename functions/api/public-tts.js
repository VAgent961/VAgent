// PUBLIC (no login): POST /api/public-tts {text} — the voice for /call.html. Origin allow-list + per-IP limit (80 / 10 min).
import { proxyTts, limited, withCors, preflight } from '../_voice.js';
export const onRequestOptions = ({ request }) => preflight(request);
export async function onRequestPost({ request, env }) {
  if (await limited(env, request, 'tts', 80, 600)) return withCors(request, new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { 'Content-Type': 'application/json' } }));
  return withCors(request, await proxyTts(request, env));
}
