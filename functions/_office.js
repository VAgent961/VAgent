import { sql } from './_lib.js';
import { instances, call, summaries, statusOf } from './_n8n.js';

// Everything about the company in one object (used by /api/office and by the AI personas).
export async function officeData(env) {
  const [insts, depts, teams, meta] = await Promise.all([
    instances(env),
    sql(env, 'SELECT id, name, color, mission, lead_key, last_talk FROM vagent_departments ORDER BY id'),
    sql(env, 'SELECT id, dept_id, name FROM vagent_teams ORDER BY id'),
    sql(env, 'SELECT key, dept_id, team_id, nickname FROM vagent_agent_meta'),
  ]);
  const metaBy = Object.fromEntries(meta.map((m) => [m.key, m]));
  const departments = depts.map((d) => ({ ...d, teams: teams.filter((t) => t.dept_id === d.id).map((t) => ({ id: t.id, name: t.name })) }));
  const agents = [], activity = [], errors = [];
  await Promise.all(insts.map(async (inst) => {
    try {
      const [wfs, ex] = await Promise.all([summaries(env, inst), call(env, inst, '/executions?limit=80')]);
      const byWf = {}, names = {};
      for (const e of ex.data || []) (byWf[e.workflowId] ||= []).push(e);
      for (const w of wfs) {
        names[w.id] = w.name;
        if (/^VAgent Brain/i.test(w.name)) continue; // the office AI itself, not an employee
        const runs = byWf[w.id] || [], st = statusOf(w, runs), key = inst.id + ':' + w.id, m = metaBy[key] || {};
        agents.push({
          key, name: m.nickname || w.name, realName: w.name, inst: inst.label, instId: inst.id, owner: inst.owner_email, link: inst.base_url + '/workflow/' + w.id,
          active: w.active, status: st.status, trigger: w.trigger, runnable: !!w.webhook, canRun: !!(w.runHook && w.active), startedAt: st.running?.startedAt || null,
          last: st.last ? { status: st.last.status, at: st.last.stoppedAt, ms: Date.parse(st.last.stoppedAt) - Date.parse(st.last.startedAt) } : null,
          runs24: runs.filter((r) => Date.now() - Date.parse(r.startedAt) < 864e5).length, dept: m.dept_id ?? null, team: m.team_id ?? null,
        });
      }
      for (const e of (ex.data || []).slice(0, 25)) activity.push({ at: e.stoppedAt || e.startedAt, status: e.status, name: (metaBy[inst.id + ':' + e.workflowId] || {}).nickname || names[e.workflowId] || 'An agent', key: inst.id + ':' + e.workflowId });
    } catch (e) {
      errors.push({ id: inst.id, inst: inst.label, error: String(e.message || e).slice(0, 120) });
    }
  }));
  activity.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  agents.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  for (const a of agents) a.isLead = departments.some((d) => d.lead_key === a.key);
  // A department whose lead was spoken to in the last 15 minutes is at its desks; after that the team drifts back to the lounge.
  const BUSY_MS = 15 * 60 * 1000;
  const busy = new Set(depts.filter((x) => x.last_talk && Date.now() - Date.parse(x.last_talk) < BUSY_MS).map((x) => x.id));
  for (const a of agents) if (a.dept != null && busy.has(a.dept) && a.active && a.status === 'idle') a.status = 'working';
  // website builds from the last 30 minutes (written by /hook/build) — the office acts them out with the Office Helper
  const builds = await sql(env, "SELECT job_id, business, stage, link, updated_at FROM vagent_builds WHERE updated_at > now() - interval '30 minutes' ORDER BY updated_at").catch(() => []);
  return { agents, departments, builds, activity: activity.slice(0, 25), errors, instances: insts.map((i) => ({ id: i.id, label: i.label, url: i.base_url, owner: i.owner_email })) };
}

// Short text version of the company for the AI (keeps prompts small = fewer tokens).
export function companyText(d) {
  const deptName = (id) => (d.departments.find((x) => x.id === id) || {}).name || 'no department';
  const teamName = (id) => { for (const x of d.departments) { const t = x.teams.find((y) => y.id === id); if (t) return t.name; } return ''; };
  const lines = ['DEPARTMENTS:'];
  for (const x of d.departments) lines.push(`- ${x.name} (${x.mission || 'no mission'}) · teams: ${x.teams.map((t) => t.name).join(', ') || 'none'} · ${d.agents.filter((a) => a.dept === x.id).length} employees`);
  lines.push('EMPLOYEES (n8n workflows):');
  for (const a of d.agents) lines.push(`- ${a.name} | ${a.status} | ${deptName(a.dept)}${a.team ? ' / ' + teamName(a.team) : ''} | trigger ${a.trigger} | ${a.runs24} runs today | last run ${a.last ? a.last.status : 'never'} | owner ${a.inst}`);
  if (!d.agents.length) lines.push('- none yet (no n8n connected)');
  if (d.errors.length) lines.push('PROBLEMS: ' + d.errors.map((e) => e.inst + ': ' + e.error).join('; '));
  lines.push('RECENT ACTIVITY: ' + d.activity.slice(0, 10).map((e) => e.name + ' ' + e.status).join('; '));
  return lines.join('\n');
}
