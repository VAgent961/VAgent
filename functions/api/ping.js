import { sql, json } from '../_lib.js';
// POST /api/ping — heartbeat so we know who's online (called every 60 s by office.js)
export async function onRequestPost({ data, env }) {
  await sql(env, 'UPDATE vagent_owners SET last_seen = now() WHERE email = $1', [data.owner]);
  return json({ ok: true });
}
