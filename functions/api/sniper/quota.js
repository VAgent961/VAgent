import { json } from '../../_lib.js';
import { poolStatus } from '../../_serp.js';

// GET /api/sniper/quota — live SerpApi quota of every configured key (owner session, middleware). Used by the quota bar in the Sniper Client chat header.
// Numbers come from SerpApi's free account.json (0 credits); if SerpApi cannot be reached the answer says so (ok:false), it never invents numbers.
export async function onRequestGet({ env, data }) {
  if (data.role !== 'owner') return json({ error: 'Not allowed.' }, 403);
  return json(await poolStatus(env, true));
}
