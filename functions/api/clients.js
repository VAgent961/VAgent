import { sql, hashPassword, json } from '../_lib.js';

const INSERT = `INSERT INTO vagent_owners (email, pass_hash, role, access_dept) VALUES ($1,$2,'client',$3) ON CONFLICT (email) DO UPDATE SET pass_hash=$2, role='client', access_dept=$3`;
const LIST   = `SELECT o.email, o.access_dept, d.name AS dept_name FROM vagent_owners o LEFT JOIN vagent_departments d ON d.id = o.access_dept WHERE o.role = 'client' ORDER BY o.email`;
const DEL    = `DELETE FROM vagent_owners WHERE email=$1 AND role='client'`;

export async function onRequestPost({ request, env, data }) {
  if (data.role !== 'owner') return json({ error: 'Not allowed.' }, 403);
  const b = await request.json();
  if (!b.email || !b.password || !b.access_dept) return json({ error: 'email, password and access_dept required.' }, 400);
  await sql(env, INSERT, [b.email.toLowerCase().trim(), await hashPassword(b.password), Number(b.access_dept)]);
  return json({ ok: true });
}

export async function onRequestGet({ env, data }) {
  if (data.role !== 'owner') return json({ error: 'Not allowed.' }, 403);
  return json(await sql(env, LIST));
}

export async function onRequestDelete({ request, env, data }) {
  if (data.role !== 'owner') return json({ error: 'Not allowed.' }, 403);
  const email = new URL(request.url).searchParams.get('email');
  await sql(env, DEL, [email]);
  return json({ ok: true });
}
