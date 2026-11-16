import { sql, json } from '../_lib.js';

// Voice AI clients (table `businesses`). Owners only (clients get 403). Session check is in _middleware.js.
// GET -> list with order counts · POST {name, profile_context} · PUT {id, name, profile_context} · DELETE ?id= (also deletes its orders)
const guard = (data) => (data.role !== 'owner' ? json({ error: 'Not allowed.' }, 403) : null);
const fail = (e) => json({ error: String(e.message || e).slice(0, 200) }, 500);
const clean = (b) => ({ name: String(b.name || '').trim().slice(0, 80), profile: String(b.profile_context || '').trim().slice(0, 8000) });
const slug = (name) => (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'biz');

export async function onRequestGet({ env, data }) {
  const g = guard(data); if (g) return g;
  try {
    return json(await sql(env, `SELECT b.id, b.name, b.profile_context, b.created_at,
      (SELECT count(*)::int FROM voice_orders o WHERE o.business_id = b.id) AS orders FROM businesses b ORDER BY b.created_at DESC`));
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env, data }) {
  const g = guard(data); if (g) return g;
  const { name, profile } = clean(await request.json().catch(() => ({})));
  if (!name) return json({ error: 'Give the business a name.' }, 400);
  if (!profile) return json({ error: 'Add its menu, prices and rules.' }, 400);
  try {
    for (let i = 0; i < 5; i++) {
      const id = slug(name) + (i ? '-' + Math.random().toString(36).slice(2, 6) : '');
      const r = await sql(env, 'INSERT INTO businesses (id, name, profile_context) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id', [id, name, profile]);
      if (r.length) return json({ id: r[0].id });
    }
    return json({ error: 'Could not make a unique id, try another name.' }, 409);
  } catch (e) { return fail(e); }
}

export async function onRequestPut({ request, env, data }) {
  const g = guard(data); if (g) return g;
  const b = await request.json().catch(() => ({}));
  const { name, profile } = clean(b);
  if (!b.id || !name || !profile) return json({ error: 'Name and profile are needed.' }, 400);
  try {
    const r = await sql(env, 'UPDATE businesses SET name = $2, profile_context = $3 WHERE id = $1 RETURNING id', [String(b.id), name, profile]);
    return r.length ? json({ ok: true }) : json({ error: 'Business not found.' }, 404);
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env, data }) {
  const g = guard(data); if (g) return g;
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) return json({ error: 'Missing id.' }, 400);
  try { await sql(env, 'DELETE FROM businesses WHERE id = $1', [id]); return json({ ok: true }); } catch (e) { return fail(e); }
}
