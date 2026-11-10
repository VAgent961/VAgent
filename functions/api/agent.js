import { sql, json, bad, body } from '../_lib.js';
import { instance, call, summaries, statusOf, runWebhook, forgetCache } from '../_n8n.js';

async function load(env, key) {
  const [instId, wfId] = String(key || '').split(':');
  const inst = instId && wfId ? await instance(env, instId) : null;
  if (!inst) return {};
  const wf = (await summaries(env, inst)).find((w) => w.id === wfId);
  return { inst, wf, wfId };
}

// GET /api/agent?key=  -> details: steps, recent runs, department
export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get('key');
  const { inst, wf, wfId } = await load(env, key);
  if (!wf) return bad('Agent not found', 404);
  const ex = await call(env, inst, '/executions?limit=10&workflowId=' + encodeURIComponent(wfId));
  const runs = (ex.data || []).map((r) => ({ id: r.id, status: r.status, mode: r.mode, startedAt: r.startedAt, stoppedAt: r.stoppedAt }));
  const [m] = await sql(env, 'SELECT dept_id, team_id FROM vagent_agent_meta WHERE key = $1', [key]);
  const [nm] = await sql(env, 'SELECT nickname FROM vagent_agent_meta WHERE key = $1', [key]);
  return json({ key, name: (nm && nm.nickname) || wf.name, realName: wf.name, trigger: wf.trigger, active: wf.active, runnable: !!wf.webhook, method: wf.webhook?.method || null, steps: wf.steps, runs, status: statusOf(wf, ex.data || []).status, dept: m ? m.dept_id : null, team: m ? m.team_id : null, canRun: !!(wf.runHook && wf.active), hasHook: !!wf.runHook, link: inst.base_url + '/workflow/' + wfId, inst: inst.label });
}

// POST /api/agent {key, action: run|activate|deactivate|assign, message?, deptId?}
export async function onRequestPost({ request, env, data }) {
  const b = await body(request);
  if (b.action === 'assign') {
    const dept = b.deptId ? Number(b.deptId) : null, team = dept && b.teamId ? Number(b.teamId) : null;
    // One agent (key) or many at once (keys) — moving a whole set into a department is a single query.
    const keys = [...new Set((Array.isArray(b.keys) ? b.keys : [b.key]).map((k) => String(k || '').trim()).filter(Boolean))].slice(0, 200);
    if (!keys.length) return bad('No agent given.');
    const rows = keys.map((_, i) => `($${i + 1}, $${keys.length + 1}, $${keys.length + 2})`).join(', ');
    await sql(env, `INSERT INTO vagent_agent_meta (key, dept_id, team_id) VALUES ${rows} ON CONFLICT (key) DO UPDATE SET dept_id = EXCLUDED.dept_id, team_id = EXCLUDED.team_id`, [...keys, dept, team]);
    return json({ ok: true, moved: keys.length });
  }
  if (b.action === 'rename') {
    const nick = String(b.name || '').trim().slice(0, 40) || null;
    await sql(env, 'INSERT INTO vagent_agent_meta (key, nickname) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET nickname = EXCLUDED.nickname', [String(b.key), nick]);
    return json({ ok: true });
  }
  const { inst, wf, wfId } = await load(env, b.key);
  if (!wf) return bad('Agent not found', 404);
  if (b.action === 'run') {
    const hook = wf.webhook || (wf.runHook && wf.active ? wf.runHook : null);
    if (!hook) return bad(wf.runHook ? 'Turn this agent on first, then it can run from here.' : 'This agent starts from ' + wf.trigger + ', so it runs on its own. Talk to it instead.');
    const r = await runWebhook(hook, { message: String(b.message || '').slice(0, 2000), from: data.owner, source: 'vagent-office' }, env.WEBHOOK_SECRET);
    if (!wf.webhook && r.ok) r.output = 'Started ✓ It is running now. You will see it at its desk.';
    return json(r);
  }
  if (b.action === 'activate' || b.action === 'deactivate') {
    await call(env, inst, '/workflows/' + encodeURIComponent(wfId) + '/' + b.action, { method: 'POST' });
    await forgetCache(env, inst.id);
    return json({ ok: true });
  }
  return bad('Unknown action');
}
