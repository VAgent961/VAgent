import { sql, hashPassword, json } from '../_lib.js';

// access_depts stored as comma-separated text e.g. "1,3,5" (Neon HTTP API doesn't support arrays)
const toTxt = (arr) => arr.join(',');
const fromTxt = (txt) => txt ? txt.split(',').map(Number).filter(Boolean) : [];

const LIST = `SELECT o.email, o.access_depts,
  (SELECT string_agg(d.name, ', ' ORDER BY d.name) FROM vagent_departments d
   WHERE d.id::text = ANY(string_to_array(NULLIF(o.access_depts,''),','))) AS dept_names
  FROM vagent_owners o WHERE o.role='client' ORDER BY o.email`;

export async function onRequestPost({ request, env, data }) {
  if (data.role !== 'owner') return json({ error: 'Not allowed.' }, 403);
  const b = await request.json();
  if (!b.email) return json({ error: 'email required.' }, 400);
  const depts = toTxt(Array.isArray(b.access_depts) ? b.access_depts.map(Number).filter(Boolean) : []);
  const email = b.email.toLowerCase().trim();
  if (b.password && b.password !== '__keep__') {
    await sql(env, `INSERT INTO vagent_owners (email, pass_hash, role, access_depts)
      VALUES ($1,$2,'client',$3)
      ON CONFLICT (email) DO UPDATE SET pass_hash=$2, role='client', access_depts=$3`,
      [email, await hashPassword(b.password), depts]);
  } else {
    await sql(env, `UPDATE vagent_owners SET access_depts=$1, role='client' WHERE email=$2`, [depts, email]);
  }
  return json({ ok: true });
}

export async function onRequestGet({ env, data }) {
  if (data.role !== 'owner') return json({ error: 'Not allowed.' }, 403);
  const rows = await sql(env, LIST);
  return json(rows.map((r) => ({ ...r, access_depts: fromTxt(r.access_depts) })));
}

export async function onRequestDelete({ request, env, data }) {
  if (data.role !== 'owner') return json({ error: 'Not allowed.' }, 403);
  const email = new URL(request.url).searchParams.get('email');
  await sql(env, "DELETE FROM vagent_owners WHERE email=$1 AND role='client'", [email]);
  return json({ ok: true });
}
