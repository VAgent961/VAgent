import { sql, json } from '../_lib.js';
import { withCors, preflight, limited } from '../_voice.js';

// PUBLIC (no login): GET /api/public-business?id=hassan-s-mobile -> {id, name, active}. Only the name is ever exposed (never the profile/menu).
export const onRequestOptions = ({ request }) => preflight(request);
export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[a-z0-9-]{1,40}$/i.test(id)) return withCors(request, json({ error: 'Bad id' }, 400));
  if (await limited(env, request, 'biz', 120, 600)) return withCors(request, json({ error: 'Too many requests' }, 429));
  try {
    const r = await sql(env, 'SELECT id, name, active FROM businesses WHERE id = $1', [id]);
    return withCors(request, r.length ? json({ id: r[0].id, name: r[0].name, active: r[0].active !== false }, 200, { 'Cache-Control': 'no-store' }) : json({ error: 'Not found' }, 404));
  } catch { return withCors(request, json({ error: 'Try again later' }, 500)); }
}
