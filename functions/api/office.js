import { sql, json } from '../_lib.js';
import { instances, call, summaries, statusOf } from '../_n8n.js';

// GET /api/office -> everything the office screen needs, in one small payload.
export async function onRequestGet({ env, data }) {
  const [insts, departments, meta] = await Promise.all([
    instances(env),
    sql(env, 'SELECT id, name, color FROM vagent_departments ORDER BY id'),
    sql(env, 'SELECT key, dept_id, nickname FROM vagent_agent_meta'),
  ]);
  const metaBy = Object.fromEntries(meta.map((m) => [m.key, m]));
  const agents = [], activity = [], errors = [];
  await Promise.all(insts.map(async (inst) => {
    try {
      const [wfs, ex] = await Promise.all([summaries(env, inst), call(env, inst, '/executions?limit=80')]);
      const byWf = {}, names = {};
      for (const e of ex.data || []) (byWf[e.workflowId] ||= []).push(e);
      for (const w of wfs) {
        names[w.id] = w.name;
        const runs = byWf[w.id] || [], st = statusOf(w, runs), key = inst.id + ':' + w.id, m = metaBy[key] || {};
        agents.push({
          key, name: m.nickname || w.name, inst: inst.label, instId: inst.id, owner: inst.owner_email, link: inst.base_url + '/workflow/' + w.id,
          active: w.active, status: st.status, trigger: w.trigger, runnable: !!w.webhook, startedAt: st.running?.startedAt || null,
          last: st.last ? { status: st.last.status, at: st.last.stoppedAt, ms: Date.parse(st.last.stoppedAt) - Date.parse(st.last.startedAt) } : null,
          runs24: runs.filter((r) => Date.now() - Date.parse(r.startedAt) < 864e5).length, dept: m.dept_id ?? null,
        });
      }
      for (const e of (ex.data || []).slice(0, 25)) activity.push({ at: e.stoppedAt || e.startedAt, status: e.status, name: (metaBy[inst.id + ':' + e.workflowId] || {}).nickname || names[e.workflowId] || 'An agent', key: inst.id + ':' + e.workflowId });
    } catch (e) {
      errors.push({ id: inst.id, inst: inst.label, error: String(e.message || e).slice(0, 120) });
    }
  }));
  activity.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  agents.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  return json({
    me: data.owner, agents, departments, activity: activity.slice(0, 25), errors,
    instances: insts.map((i) => ({ id: i.id, label: i.label, url: i.base_url, owner: i.owner_email })), ai: !!env.GROQ_API_KEY,
  });
}
