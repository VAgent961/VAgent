import { sql, json, body } from '../_lib.js';

// POST /hook/daily — agents (Sniper Daily) post their report here instead of Telegram.
// No session: authorised by the same X-VAgent-Secret header the office uses for run-now hooks.
export async function onRequestPost({ request, env }) {
  const given = request.headers.get('X-VAgent-Secret') || '';
  if (!env.WEBHOOK_SECRET || given !== env.WEBHOOK_SECRET) return json({ error: 'Not allowed' }, 401);
  const b = await body(request);
  const text = String(b.text || b.message || '').trim().slice(0, 8000);
  if (!text) return json({ error: 'Nothing to post' }, 400);
  const [row] = await sql(env, 'INSERT INTO vagent_daily (title, text, source) VALUES ($1, $2, $3) RETURNING id, at', [
    String(b.title || 'Daily report').slice(0, 120), text, String(b.source || 'n8n').slice(0, 80),
  ]);
  return json({ ok: true, id: row.id, at: row.at });
}
