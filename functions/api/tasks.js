import { sql, json, bad, body } from '../_lib.js';
import { instances, summaries, runWebhook } from '../_n8n.js';
import { think } from '../_brain.js';

// GET /api/tasks?deptId= -> last 10 tasks of a department
export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('deptId'));
  return json(await sql(env, 'SELECT id, text, status, results, final, created_by, created_at, done_at FROM vagent_tasks WHERE dept_id = $1 ORDER BY id DESC LIMIT 10', [id]));
}

// POST /api/tasks {deptId, text}: the lead sends the task to every runnable agent in the department,
// waits for them, then combines one final result (1 cheap AI call if GROQ_API_KEY is set, else a plain list).
export async function onRequestPost({ request, env, data }) {
  const b = await body(request);
  const text = String(b.text || '').trim().slice(0, 2000);
  const [dept] = await sql(env, 'SELECT id, name FROM vagent_departments WHERE id = $1', [Number(b.deptId)]);
  if (!dept || !text) return bad('Pick a department and write the task.');
  const keys = (await sql(env, 'SELECT key FROM vagent_agent_meta WHERE dept_id = $1', [dept.id])).map((r) => r.key);
  const insts = await instances(env), team = [];
  for (const inst of insts) {
    const mine = keys.filter((k) => k.startsWith(inst.id + ':'));
    if (!mine.length) continue;
    const wfs = await summaries(env, inst);
    for (const k of mine) { const w = wfs.find((x) => inst.id + ':' + x.id === k); if (w) team.push({ key: k, name: w.name, webhook: w.webhook || (w.runHook && w.active ? w.runHook : null) }); }
  }
  const workers = team.filter((t) => t.webhook);
  if (!workers.length) return bad(team.length ? 'None of these agents can take tasks yet. Give one a Webhook trigger in n8n.' : 'This department has no agents yet. Open an agent and add it here.');
  const [task] = await sql(env, 'INSERT INTO vagent_tasks (dept_id, text, created_by) VALUES ($1, $2, $3) RETURNING id', [dept.id, text, data.owner]);
  const results = await Promise.all(workers.map(async (w) => ({ key: w.key, name: w.name, ...(await runWebhook(w.webhook, { task: text, department: dept.name, from: data.owner, source: 'vagent-office' }, env.WEBHOOK_SECRET)) })));
  let final = results.map((r) => (r.ok ? '✓ ' : '✗ ') + r.name + ': ' + r.output.slice(0, 600)).join('\n\n');
  if (results.some((r) => r.ok)) { try { final = (await think(env, 'You are the ' + dept.name + ' department lead at VAgent. Combine your agents\' results into ONE short final answer for the company owner: what was done, key results, anything they must decide. Plain text, max 120 words.', 'Task: ' + text + '\n\nResults:\n' + final.slice(0, 6000))).trim(); } catch {} }
  if (false) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + env.GROQ_API_KEY, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', max_tokens: 400, temperature: 0.3, messages: [
          { role: 'system', content: 'You are the ' + dept.name + ' department lead. Combine your agents\' results into ONE short final answer for the company owner: what was done, key results, anything they must decide. Plain text, max 120 words.' },
          { role: 'user', content: 'Task: ' + text + '\n\nResults:\n' + final.slice(0, 6000) } ] }),
      });
      const j = await r.json(); const t = j.choices?.[0]?.message?.content; if (t) final = t.trim();
    } catch {}
  }
  const status = results.every((r) => r.ok) ? 'done' : results.some((r) => r.ok) ? 'partial' : 'failed';
  await sql(env, 'UPDATE vagent_tasks SET status = $1, results = $2::jsonb, final = $3, done_at = now() WHERE id = $4', [status, JSON.stringify(results), final, task.id]);
  return json({ id: task.id, status, results, final, skipped: team.length - workers.length });
}
