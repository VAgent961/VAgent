import { sql, hashPassword, json } from '../_lib.js';

const UPSERT = `INSERT INTO vagent_owners (email, pass_hash, role, access_depts)
  VALUES ($1,$2,'client',$3::int[])
  ON CONFLICT (email) DO UPDATE SET pass_hash=$2, role='client', access_depts=$3::int[]`;
const LIST = `SELECT o.email, o.access_depts,
  (SELECT json_agg(d.name ORDER BY d.id) FROM vagent_departments d WHERE d.id = ANY(o.access_depts)) AS dept_names
  FROM vagent_owners o WHERE o.role='client' ORDER BY o.email`;

export async function onRequestPost({ request, env, data }) {
  if (data.role !== 'owner') return json({ error: 'Not allowed.' }, 403);
  const b = await request.json();
  if (!b.email || !b.password) return json({ error: 'email and password required.' }, 400);
  const depts = Array.isArray(b.access_depts) ? b.access_depts.map(Number).filter(Boolean) : [];
  await sql(env, UPSERT, [b.email.toLowerCase().trim(), await hashPassword(b.password), '{' + depts.join(',') + '}']);
  return json({ ok: true });
}

export async function onRequestGet({ env, data }) {
  if (data.role !== 'owner') return json({ error: 'Not allowed.' }, 403);
  return json(await sql(env, LIST));
}

export async function onRequestDelete({ request, env, data }) {
  if (data.role !== 'owner') return json({ error: 'Not allowed.' }, 403);
  const email = new URL(request.url).searchParams.get('email');
  await sql(env, "DELETE FROM vagent_owners WHERE email=$1 AND role='client'", [email]);
  return json({ ok: true });
}
