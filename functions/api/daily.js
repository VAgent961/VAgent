import { sql, json } from '../_lib.js';

// GET /api/daily — the reports agents posted to /hook/daily, newest first (owner session, middleware).
export async function onRequestGet({ env }) {
  try { return json(await sql(env, 'SELECT id, title, text, source, at FROM vagent_daily ORDER BY id DESC LIMIT 30')); }
  catch (e) { return json({ error: String(e.message || e).slice(0, 200) }, 500); }
}
