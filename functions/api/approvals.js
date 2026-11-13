import { sql, json, body } from '../_lib.js';
import { instance, call } from '../_n8n.js';

// Website builder approvals from the office instead of only from Telegram.
// PM Tech (lead of the department named like "website", on Boudy's n8n) asks for client approvals through its
// "Request Client Approval" workflow: a `waiting` row in the n8n data table `web_projects` (project_id, stage, token, summary).
// GET  /api/approvals            → waiting requests (last 3 days), newest first.
// POST /api/approvals {id, decision: approve|changes, feedback?} → posts to that n8n's /webhook/review-decision, exactly
//      like the client review page does (it checks the token, saves the decision and wakes PM Tech up).
// Nothing is changed on Boudy's n8n: read via the office's stored API key, decide via its public review webhook.
const NAMES = { brief: 'Project brief', design: 'Page designs', site: 'Finished website', golive: 'Go live' };

async function builder(env) {
  const d = (await sql(env, "SELECT lead_key FROM vagent_departments WHERE name ILIKE '%website%' AND lead_key IS NOT NULL ORDER BY id LIMIT 1"))[0];
  if (!d) throw new Error('No Website builder lead');
  const inst = await instance(env, String(d.lead_key).split(':')[0]);
  if (!inst) throw new Error('The Website builder n8n is not connected');
  const tables = await call(env, inst, '/data-tables?limit=100');
  const t = (tables.data || []).find((x) => x.name === 'web_projects');
  if (!t) throw new Error('No web_projects table on that n8n');
  return { inst, table: t.id };
}
const rowsOf = async (env, b, filters) => (await call(env, b.inst, '/data-tables/' + b.table + '/rows?limit=50&sortBy=id:desc&filter=' +
  encodeURIComponent(JSON.stringify({ type: 'and', filters })))).data || [];

export async function onRequestGet({ env, data }) {
  if (data.role === 'client') return json({ error: 'Owners only' }, 403);
  try {
    const b = await builder(env);
    const since = Date.now() - 3 * 864e5;
    const list = (await rowsOf(env, b, [{ columnName: 'status', condition: 'eq', value: 'waiting' }]))
      .filter((r) => NAMES[r.stage] && Date.parse(r.createdAt) > since)
      .filter((r, i, all) => all.findIndex((y) => y.project_id === r.project_id && y.stage === r.stage) === i) // newest request per project + stage
      .map((r) => ({ id: r.id, project: r.project_id, stage: r.stage, stageName: NAMES[r.stage], summary: String(r.summary || '').slice(0, 1200), at: r.createdAt,
        review: b.inst.base_url + '/webhook/review?p=' + encodeURIComponent(r.project_id) + '&t=' + encodeURIComponent(r.token || '') }));
    return json({ ok: true, list });
  } catch (e) { return json({ ok: false, list: [], error: String(e.message || e).slice(0, 200) }); }
}

export async function onRequestPost({ request, env, data }) {
  if (data.role === 'client') return json({ error: 'Owners only' }, 403);
  const p = await body(request);
  const decision = p.decision === 'approve' ? 'approve' : p.decision === 'changes' ? 'changes' : '';
  const feedback = String(p.feedback || '').trim().slice(0, 3000);
  if (!decision || !Number(p.id)) return json({ error: 'Pick Approve or Ask for changes' }, 400);
  if (decision === 'changes' && !feedback) return json({ error: 'Say what should change' }, 400);
  try {
    const b = await builder(env);
    const r = (await rowsOf(env, b, [{ columnName: 'id', condition: 'eq', value: Number(p.id) }]))[0];
    if (!r || r.status !== 'waiting') return json({ error: 'Already decided' }, 409);
    const who = String(data.owner || '').split('@')[0].replace(/^./, (c) => c.toUpperCase()) + ' (VAgent office)';
    const res = await fetch(b.inst.base_url + '/webhook/review-decision', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: r.project_id, t: r.token, decision, feedback, name: who }), signal: AbortSignal.timeout(30000) });
    if (!res.ok) return json({ error: 'PM Tech did not take it (' + res.status + ')' }, 502);
    const after = (await rowsOf(env, b, [{ columnName: 'id', condition: 'eq', value: Number(p.id) }]))[0];
    const ok = after && after.status !== 'waiting';
    return json({ ok, status: after && after.status, error: ok ? undefined : 'The review page did not accept it' });
  } catch (e) { return json({ error: String(e.message || e).slice(0, 200) }, 500); }
}
