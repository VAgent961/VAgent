import { sql, json } from '../_lib.js';

// GET /api/me -> signed-in owner + all owners with online status
export async function onRequestGet({ data, env }) {
  const me = { email: data.owner, name: data.owner.split('@')[0].replace(/^./, (c) => c.toUpperCase()) };
  const rows = await sql(env, "SELECT email, last_seen FROM vagent_owners ORDER BY email");
  me.owners = rows.map((r) => ({
    email: r.email,
    name: r.email.split('@')[0].replace(/^./, (c) => c.toUpperCase()),
    online: r.last_seen && (Date.now() - new Date(r.last_seen).getTime()) < 5 * 60 * 1000,
  }));
  return json(me);
}
