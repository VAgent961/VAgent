import { sql, json } from '../../_lib.js';
import { requireClient } from '../../_client.js';

// Orders placed through this owner's Voice AI. business_id from the session only. GET ?status=pending|done|canceled (optional) · PUT {id, status: 'done'|'canceled'}
const COLS = 'id, customer_name, customer_phone, delivery_address, items_summary, notes, status, created_at';
export async function onRequestGet(ctx) {
  const g = await requireClient(ctx); if (g.res) return g.res;
  const st = new URL(ctx.request.url).searchParams.get('status') || '';
  try {
    return json(st && ['pending', 'done', 'canceled'].includes(st)
      ? await sql(ctx.env, `SELECT ${COLS} FROM orders WHERE business_id = $1 AND status = $2 ORDER BY created_at DESC, id DESC LIMIT 300`, [g.client.business_id, st])
      : await sql(ctx.env, `SELECT ${COLS} FROM orders WHERE business_id = $1 ORDER BY created_at DESC, id DESC LIMIT 300`, [g.client.business_id]));
  } catch { return json({ error: 'Try again in a moment.' }, 500); }
}
export async function onRequestPut(ctx) {
  const g = await requireClient(ctx); if (g.res) return g.res;
  const b = await ctx.request.json().catch(() => ({})), id = Number(b.id), status = String(b.status || '');
  if (!Number.isInteger(id) || id < 1 || !['done', 'canceled'].includes(status)) return json({ error: 'Bad request.' }, 400);
  try {
    const r = await sql(ctx.env, `UPDATE orders SET status = $3 WHERE id = $1 AND business_id = $2 RETURNING ${COLS}`, [id, g.client.business_id, status]);
    return r.length ? json(r[0]) : json({ error: 'Order not found.' }, 404);
  } catch { return json({ error: 'Try again in a moment.' }, 500); }
}
