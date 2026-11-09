import { sql, json, bad, body, encrypt } from '../_lib.js';
import { call, summaries } from '../_n8n.js';

// GET /api/n8n -> connected n8n instances (never the keys)
export async function onRequestGet({ env }) {
  return json(await sql(env, 'SELECT id, label, base_url AS url, owner_email AS owner, created_at FROM vagent_n8n ORDER BY id'));
}

// POST /api/n8n {label, url, key} -> checks the key works, then stores it encrypted
export async function onRequestPost({ request, env, data }) {
  if (!env.ENC_KEY) return bad('Server is missing ENC_KEY.', 500);
  const b = await body(request);
  const label = String(b.label || '').trim().slice(0, 40);
  let url = String(b.url || '').trim().replace(/\/+$/, '').replace(/\/(api\/v1|home\/workflows|workflows?)$/i, '');
  const key = String(b.key || '').trim();
  if (!label || !url || !key) return bad('Fill in the name, the n8n address and the API key.');
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url)) return bad('The n8n address must look like https://name.vagent.online');
  try { await call(env, { base_url: url }, '/workflows?limit=1', {}, key); } catch (e) { return bad('Could not connect: ' + e.message); }
  const [row] = await sql(env, 'INSERT INTO vagent_n8n (label, base_url, api_key_enc, owner_email) VALUES ($1, $2, $3, $4) ON CONFLICT (base_url) DO UPDATE SET label = EXCLUDED.label, api_key_enc = EXCLUDED.api_key_enc, owner_email = EXCLUDED.owner_email RETURNING id, label, base_url AS url, owner_email AS owner, api_key_enc', [label, url, await encrypt(env, key), data.owner]);
  const count = (await summaries(env, { id: row.id, base_url: url, api_key_enc: row.api_key_enc }, true)).length;
  delete row.api_key_enc;
  return json({ ok: true, ...row, workflows: count });
}

// DELETE /api/n8n?id=
export async function onRequestDelete({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return bad('Missing id');
  await sql(env, 'DELETE FROM vagent_n8n WHERE id = $1', [id]);
  await sql(env, "DELETE FROM vagent_agent_meta WHERE key LIKE $1", [id + ':%']);
  return json({ ok: true });
}
