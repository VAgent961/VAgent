import { sql, json } from '../_lib.js';

// Orders/bookings the Voice Receptionist saved (table `voice_orders`). Owners only.
// GET ?business_id= (newest 200) · POST {business_id, customer_details, order_summary} · PUT {id, customer_details, order_summary} · DELETE ?id=
const guard = (data) => (data.role !== 'owner' ? json({ error: 'Not allowed.' }, 403) : null);
const fail = (e) => json({ error: String(e.message || e).slice(0, 200) }, 500);
const txt = (v, n) => String(v || '').trim().slice(0, n);

export async function onRequestGet({ request, env, data }) {
  const g = guard(data); if (g) return g;
  const bid = new URL(request.url).searchParams.get('business_id') || '';
  if (!bid) return json({ error: 'Missing business_id.' }, 400);
  try { return json(await sql(env, 'SELECT id, business_id, customer_details, order_summary, at FROM voice_orders WHERE business_id = $1 ORDER BY id DESC LIMIT 200', [bid])); }
  catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env, data }) {
  const g = guard(data); if (g) return g;
  const b = await request.json().catch(() => ({}));
  if (!b.business_id || !txt(b.order_summary, 1000)) return json({ error: 'business_id and order_summary are needed.' }, 400);
  try {
    const r = await sql(env, 'INSERT INTO voice_orders (business_id, customer_details, order_summary) VALUES ($1, $2, $3) RETURNING id', [String(b.business_id), txt(b.customer_details, 500), txt(b.order_summary, 1000)]);
    return json({ id: r[0].id });
  } catch (e) { return fail(e); }
}

export async function onRequestPut({ request, env, data }) {
  const g = guard(data); if (g) return g;
  const b = await request.json().catch(() => ({}));
  if (!b.id) return json({ error: 'Missing id.' }, 400);
  try {
    const r = await sql(env, 'UPDATE voice_orders SET customer_details = $2, order_summary = $3 WHERE id = $1 RETURNING id', [Number(b.id), txt(b.customer_details, 500), txt(b.order_summary, 1000)]);
    return r.length ? json({ ok: true }) : json({ error: 'Order not found.' }, 404);
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env, data }) {
  const g = guard(data); if (g) return g;
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: 'Missing id.' }, 400);
  try { await sql(env, 'DELETE FROM voice_orders WHERE id = $1', [id]); return json({ ok: true }); } catch (e) { return fail(e); }
}
