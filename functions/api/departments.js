import { sql, json, bad, body } from '../_lib.js';

const COLORS = ['#E7B38F', '#A8B8E8', '#8FC79D', '#D9C27A', '#E59A7A', '#9FD0D6', '#C8A8E0'];

export async function onRequestGet({ env }) {
  return json(await sql(env, 'SELECT d.id, d.name, d.color, count(m.key)::int AS agents FROM vagent_departments d LEFT JOIN vagent_agent_meta m ON m.dept_id = d.id GROUP BY d.id ORDER BY d.id'));
}

// POST {name, color} creates · {id, name, color} renames/recolors
export async function onRequestPost({ request, env, data }) {
  const b = await body(request);
  const name = String(b.name || '').trim().slice(0, 40);
  const color = COLORS.includes(b.color) ? b.color : COLORS[Math.floor(Math.random() * COLORS.length)];
  if (!name) return bad('Give the department a name.');
  const rows = b.id
    ? await sql(env, 'UPDATE vagent_departments SET name = $1, color = $2 WHERE id = $3 RETURNING id, name, color', [name, color, Number(b.id)])
    : await sql(env, 'INSERT INTO vagent_departments (name, color, created_by) VALUES ($1, $2, $3) RETURNING id, name, color', [name, color, data.owner]);
  return json(rows[0] || {});
}

export async function onRequestDelete({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return bad('Missing id');
  await sql(env, 'DELETE FROM vagent_departments WHERE id = $1', [id]);
  return json({ ok: true });
}
