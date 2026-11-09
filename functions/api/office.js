import { json } from '../_lib.js';
import { officeData } from '../_office.js';

// In-memory cache: share one Neon round-trip across all requests within a 6s window.
// Cloudflare Pages Functions are single-isolate per colo, so this works as intended.
let _cache = null, _cacheAt = 0;
const CACHE_TTL = 6000; // ms

// GET /api/office -> everything the office screen needs, in one small payload.
export async function onRequestGet({ env, data }) {
  const now = Date.now();
  if (!_cache || now - _cacheAt > CACHE_TTL) {
    _cache = await officeData(env);
    _cacheAt = now;
  }
  return json({ me: data.owner, ..._cache, ai: !!(env.BRAIN_URL || env.GROQ_API_KEY) });
}
