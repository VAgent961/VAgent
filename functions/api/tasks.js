import { sql, json, bad, body } from '../_lib.js';
import { instances, summaries, runWebhook } from '../_n8n.js';
import { think, parseJSON } from '../_brain.js';

// GET /api/tasks?deptId= -> last 10 projects of a department
export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('deptId'));
  if (!id) return json(await sql(env, 'SELECT t.id, t.dept_id, d.name AS dept, d.color, t.text, t.status, t.final, t.created_by, t.created_at, t.done_at FROM vagent_tasks t LEFT JOIN vagent_departments d ON d.id = t.dept_id ORDER BY t.id DESC LIMIT 20'));
  return json(await sql(env, 'SELECT id, text, status, results, final, created_by, created_at, done_at FROM vagent_tasks WHERE dept_id = $1 ORDER BY id DESC LIMIT 10', [id]));
}

export async function onRequestPost(ctx) {
  try { return await handle(ctx); } catch (e) { return json({ error: String(e.message || e).slice(0, 300) }, 500); }
}

// POST /api/tasks {deptId, text}: the department lead runs a project.
// 1) plans: splits the project so as MANY team members as possible work in parallel (1 AI call)
// 2) sends each member its part (own webhook gets the text; run-now members are just started)
// 3) combines everything into one final result (1 AI call)
async function handle({ request, env, data }) {
  const b = await body(request);
  const text = String(b.text || '').trim().slice(0, 3000);
  const [dept] = await sql(env, 'SELECT id, name, mission FROM vagent_departments WHERE id = $1', [Number(b.deptId)]);
  if (!dept || !text) return bad('Pick a department and describe the project.');
  const metas = await sql(env, 'SELECT key, nickname FROM vagent_agent_meta WHERE dept_id = $1', [dept.id]);
  const team = [];
  for (const inst of await instances(env)) {
    const mine = metas.filter((m) => m.key.startsWith(inst.id + ':'));
    if (!mine.length) continue;
    const wfs = await summaries(env, inst);
    for (const m of mine) {
      const w = wfs.find((x) => inst.id + ':' + x.id === m.key); if (!w) continue;
      const hook = w.webhook || (w.runHook && w.active ? w.runHook : null);
      team.push({ key: m.key, name: m.nickname || w.name, hook, takesText: !!w.webhook, does: w.steps.slice(0, 14).join(' → '), trigger: w.trigger });
    }
  }
  const workers = team.filter((t) => t.hook);
  if (!workers.length) return bad(team.length ? 'Nobody in this department can be started from here yet (they need a webhook, or a schedule/manual trigger and to be turned on).' : 'This department has no employees yet. Ask the CEO to move some here.');

  // 1) plan: give every possible member a part
  let plan = [];
  try {
    const t = await think(env, `You are the lead of the ${dept.name} department at VAgent (an AI studio). Mission: ${dept.mission || 'not set'}.
Split the owner's project between your team members so that AS MANY OF THEM AS POSSIBLE work in parallel and the result is as good as possible. Every member below should get a useful part if it fits their job.
Members that "take text" receive your instructions; members that "start only" just run their normal job (give them a short reason).
Return ONLY JSON: {"assignments":[{"agent":"exact member name","task":"what this member must do for the project"}],"note":"one line about the plan"}`,
      'PROJECT: ' + text + '\n\nTEAM:\n' + workers.map((w) => `- ${w.name} (${w.takesText ? 'takes text' : 'start only'}; trigger ${w.trigger}; steps: ${w.does})`).join('\n'));
    const j = parseJSON(t); plan = (j && Array.isArray(j.assignments) ? j.assignments : []);
  } catch {}
  const jobs = workers.map((w) => ({ w, task: (plan.find((p) => String(p.agent || '').toLowerCase() === w.name.toLowerCase()) || {}).task || text }));

  // 2) run everyone in parallel
  const [row] = await sql(env, 'INSERT INTO vagent_tasks (dept_id, text, created_by) VALUES ($1, $2, $3) RETURNING id', [dept.id, text, data.owner]);
  const results = await Promise.all(jobs.map(async ({ w, task }) => {
    const r = await runWebhook(w.hook, { task, project: text, department: dept.name, from: data.owner, source: 'vagent-office' }, env.WEBHOOK_SECRET);
    return { key: w.key, name: w.name, task, ok: r.ok, output: w.takesText ? r.output : (r.ok ? 'Started its job ✓' : r.output) };
  }));

  // 3) one final answer
  let final = results.map((r) => (r.ok ? '✓ ' : '✗ ') + r.name + ': ' + r.output.slice(0, 500)).join('\n\n');
  if (results.some((r) => r.ok)) {
    try { final = (await think(env, `You are the ${dept.name} department lead at VAgent. Combine your team's work into ONE clear final result for the owner: what was done, the key results (include the useful content itself), and anything they must decide next. Plain text, max 200 words.`, 'PROJECT: ' + text + '\n\nTEAM RESULTS:\n' + results.map((r) => `${r.name} (asked: ${r.task}) → ${r.ok ? r.output : 'failed: ' + r.output}`).join('\n\n').slice(0, 9000))).trim(); } catch {}
  }
  const status = results.every((r) => r.ok) ? 'done' : results.some((r) => r.ok) ? 'partial' : 'failed';
  await sql(env, 'UPDATE vagent_tasks SET status = $1, results = $2::jsonb, final = $3, done_at = now() WHERE id = $4', [status, JSON.stringify(results), final, row.id]);
  return json({ id: row.id, status, results, final, used: results.length, team: team.length });
}
