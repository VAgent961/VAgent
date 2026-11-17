// PUBLIC (no login): POST /api/public-voice?business_id=...  — used by /call.html. Same as /api/voice plus an Origin allow-list,
// CORS only for our own origin and a per-IP limit (30 calls / 10 min) so strangers cannot burn the Groq quota.
import { proxyVoice, limited, withCors, preflight, offlineResponse } from '../_voice.js';
export const onRequestOptions = ({ request }) => preflight(request);
export async function onRequestPost({ request, env }) {
  if (await limited(env, request, 'voice', 30, 600)) return withCors(request, new Response(JSON.stringify({ error: 'Too many calls from your connection. Please wait a few minutes.' }), { status: 429, headers: { 'Content-Type': 'application/json' } }));
  const off = await offlineResponse(env, request); if (off) return withCors(request, off);
  return withCors(request, await proxyVoice(request, env));
}
