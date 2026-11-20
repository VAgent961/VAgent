import { sql, json } from '../../_lib.js';
import { requireClient, cleanItem } from '../../_client.js';

// The owner's items. business_id comes from the session (g.client.business_id) in EVERY query; ids from the request are always paired with it.
// GET list · POST {name, price, quantity, available, image_url (https link or small data:image upload, optional), custom_fields:{col:value}} · PUT {id, ...same} · DELETE ?id=
const COLS = 'id, name, price, quantity, available, custom_fields, image_url, updated_at';
const fail = () => json({ error: 'Try again in a moment.' }, 500);

export async function onRequestGet(ctx) {
  const g = await requireClient(ctx); if (g.res) return g.res;
  try { return json(await sql(ctx.env, `SELECT ${COLS} FROM items WHERE business_id = $1 ORDER BY lower(name), id LIMIT 500`, [g.client.business_id])); } catch { return fail(); }
}
export async function onRequestPost(ctx) {
  const g = await requireClient(ctx); if (g.res) return g.res;
  const it = cleanItem(await ctx.request.json().catch(() => ({}))); if (it.error) return json({ error: it.error }, 400);
  try {
    const [{ n }] = await sql(ctx.env, 'SELECT count(*)::int AS n FROM items WHERE business_id = $1', [g.client.business_id]);
    if (n >= 500) return json({ error: 'You reached the limit of 500 items.' }, 400);
    const [r] = await sql(ctx.env, `INSERT INTO items (business_id, name, price, quantity, available, custom_fields, image_url) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING ${COLS}`, [g.client.business_id, it.name, it.price, it.quantity, it.available, JSON.stringify(it.custom), it.image]);
    return json(r);
  } catch { return fail(); }
}
export async function onRequestPut(ctx) {
  const g = await requireClient(ctx); if (g.res) return g.res;
  const b = await ctx.request.json().catch(() => ({})), id = Number(b.id); if (!Number.isInteger(id) || id < 1) return json({ error: 'Missing item id.' }, 400);
  const it = cleanItem(b); if (it.error) return json({ error: it.error }, 400);
  try {
    const r = await sql(ctx.env, `UPDATE items SET name = $3, price = $4, quantity = $5, available = $6, custom_fields = $7::jsonb, image_url = $8, updated_at = now() WHERE id = $1 AND business_id = $2 RETURNING ${COLS}`, [id, g.client.business_id, it.name, it.price, it.quantity, it.available, JSON.stringify(it.custom), it.image]);
    return r.length ? json(r[0]) : json({ error: 'Item not found.' }, 404);
  } catch { return fail(); }
}
export async function onRequestDelete(ctx) {
  const g = await requireClient(ctx); if (g.res) return g.res;
  const id = Number(new URL(ctx.request.url).searchParams.get('id')); if (!Number.isInteger(id) || id < 1) return json({ error: 'Missing item id.' }, 400);
  try { const r = await sql(ctx.env, 'DELETE FROM items WHERE id = $1 AND business_id = $2 RETURNING id', [id, g.client.business_id]); return r.length ? json({ ok: true }) : json({ error: 'Item not found.' }, 404); } catch { return fail(); }
}
