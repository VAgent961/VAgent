import { sql, json } from '../_lib.js';
import { withCors, preflight, limited } from '../_voice.js';

// PUBLIC (no login): GET /api/public-business?id=<business id>  or  ?host=<client subdomain, e.g. voice1.vagent.online>  -> {id, name, active}.
// Only the name is ever exposed (never the menu/items). active is false when the owner switched the agent off OR the client's subscription is canceled/expired.
export const onRequestOptions = ({ request }) => preflight(request);
export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams, id = q.get('id') || '', host = (q.get('host') || '').toLowerCase();
  if (id ? !/^[a-z0-9-]{1,40}$/i.test(id) : !/^[a-z0-9-]{1,40}\.vagent\.online$/.test(host)) return withCors(request, json({ error: 'Bad id' }, 400));
  if (await limited(env, request, 'biz', 120, 600)) return withCors(request, json({ error: 'Too many requests' }, 429));
  try {
    const r = id
      ? await sql(env, `SELECT b.id, b.name, b.active, a.status AS acct_status, (a.subscription_end <= now()) AS expired FROM businesses b LEFT JOIN client_accounts a ON a.business_id = b.id WHERE b.id = $1`, [id])
      : await sql(env, `SELECT b.id, b.name, b.active, a.status AS acct_status, (a.subscription_end <= now()) AS expired FROM client_accounts a JOIN businesses b ON b.id = a.business_id WHERE a.custom_subdomain = $1`, [host]);
    if (!r.length) return withCors(request, json({ error: 'Not found' }, 404));
    const x = r[0], active = x.active !== false && !(x.acct_status && (x.acct_status !== 'active' || x.expired));
    return withCors(request, json({ id: x.id, name: x.name, active }, 200, { 'Cache-Control': 'no-store' }));
  } catch { return withCors(request, json({ error: 'Try again later' }, 500)); }
}
