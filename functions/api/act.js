import { sql, json, bad, body } from '../_lib.js';
import { officeData } from '../_office.js';
import { instance, call, summaries, runWebhook, forgetCache } from '../_n8n.js';

const COLORS = ['#E7B38F', '#A8B8E8', '#8FC79D', '#D9C27A', '#E59A7A', '#9FD0D6', '#C8A8E0'];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const find = (list, name, f = (x) => x.name) => { const n = norm(name); return list.find((x) => norm(f(x)) === n) || list.find((x) => norm(f(x)).includes(n) || (n && n.includes(norm(f(x))))); };

// POST /api/act {actions:[...]} -> runs the CEO actions the owner approved. Returns one line per action.
export async function onRequestPost(ctx) {
  try { return await handle(ctx); } catch (e) { return json({ error: String(e.message || e).slice(0, 300) }, 500); }
}
async function handle({ request, env, data }) {
  const b = await body(request);
  const actions = Array.isArray(b.actions) ? b.actions.slice(0, 40) : [];
  if (!actions.length) return bad('Nothing to do.');
  let d = await officeData(env);
  const out = [];
  const dept = (n) => find(d.departments, n), agent = (n) => find(d.agents, n, (a) => a.name) || find(d.agents, n, (a) => a.realName);
  for (const a of actions) {
    try {
      const t = a.type;
      if (t === 'create_department') {
        if (dept(a.name) && norm(dept(a.name).name) === norm(a.name)) { out.push('• ' + a.name + ' already exists'); continue; }
        const [x] = await sql(env, 'INSERT INTO vagent_departments (name, color, mission, created_by) VALUES ($1, $2, $3, $4) RETURNING id', [String(a.name).slice(0, 40), COLORS[d.departments.length % COLORS.length], String(a.mission || '').slice(0, 200) || null, data.owner]);
        d.departments.push({ id: x.id, name: a.name, teams: [] }); out.push('✓ Created department ' + a.name);
      } else if (t === 'rename_department' || t === 'set_mission' || t === 'delete_department') {
        const x = dept(a.department); if (!x) { out.push('✗ No department called ' + a.department); continue; }
        if (t === 'rename_department') await sql(env, 'UPDATE vagent_departments SET name = $1 WHERE id = $2', [String(a.name).slice(0, 40), x.id]);
        if (t === 'set_mission') await sql(env, 'UPDATE vagent_departments SET mission = $1 WHERE id = $2', [String(a.mission).slice(0, 200), x.id]);
        if (t === 'delete_department') await sql(env, 'DELETE FROM vagent_departments WHERE id = $1', [x.id]);
        out.push('✓ ' + { rename_department: 'Renamed ' + x.name + ' to ' + a.name, set_mission: 'New mission for ' + x.name, delete_department: 'Deleted ' + x.name }[t]);
      } else if (t === 'create_team' || t === 'delete_team') {
        const x = dept(a.department); if (!x) { out.push('✗ No department called ' + a.department); continue; }
        if (t === 'create_team') { const [tm] = await sql(env, 'INSERT INTO vagent_teams (dept_id, name) VALUES ($1, $2) RETURNING id', [x.id, String(a.name).slice(0, 40)]); x.teams.push({ id: tm.id, name: a.name }); out.push('✓ New team ' + a.name + ' in ' + x.name); }
        else { const tm = find(x.teams, a.team); if (!tm) { out.push('✗ No team ' + a.team); continue; } await sql(env, 'DELETE FROM vagent_teams WHERE id = $1', [tm.id]); out.push('✓ Removed team ' + tm.name); }
      } else {
        const ag = agent(a.agent); if (!ag) { out.push('✗ No employee called ' + a.agent); continue; }
        if (t === 'move_agent') {
          const none = /^(none|no department|unassigned)$/i.test(String(a.department || ''));
          const x = none ? null : dept(a.department); if (!none && !x) { out.push('✗ No department called ' + a.department); continue; }
          const tm = x && a.team ? find(x.teams, a.team) : null;
          await sql(env, 'INSERT INTO vagent_agent_meta (key, dept_id, team_id) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET dept_id = EXCLUDED.dept_id, team_id = EXCLUDED.team_id', [ag.key, x ? x.id : null, tm ? tm.id : null]);
          out.push('✓ ' + ag.name + ' → ' + (x ? x.name + (tm ? ' / ' + tm.name : '') : 'no department'));
        } else if (t === 'rename_agent') {
          await sql(env, 'INSERT INTO vagent_agent_meta (key, nickname) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET nickname = EXCLUDED.nickname', [ag.key, String(a.name).slice(0, 40)]);
          out.push('✓ ' + ag.name + ' is now called ' + a.name);
        } else if (t === 'run_agent' || t === 'turn_on' || t === 'turn_off') {
          const [instId, wfId] = ag.key.split(':'), inst = await instance(env, instId);
          if (t === 'run_agent') {
            const w = (await summaries(env, inst)).find((x) => x.id === wfId), hook = w && (w.webhook || (w.runHook && w.active ? w.runHook : null));
            if (!hook) { out.push('✗ ' + ag.name + ' can only start from its own trigger (' + ag.trigger + ')'); continue; }
            const r = await runWebhook(hook, { message: 'Run requested by the CEO for ' + data.owner, from: data.owner, source: 'vagent-office' }, env.WEBHOOK_SECRET);
            out.push((r.ok ? '✓ Started ' : '✗ Could not start ') + ag.name);
          } else {
            await call(env, inst, '/workflows/' + encodeURIComponent(wfId) + '/' + (t === 'turn_on' ? 'activate' : 'deactivate'), { method: 'POST' }); await forgetCache(env, inst.id);
            out.push('✓ ' + ag.name + ' turned ' + (t === 'turn_on' ? 'on' : 'off'));
          }
        } else out.push('✗ Unknown action ' + t);
      }
    } catch (e) { out.push('✗ ' + (a.type || 'action') + ' failed: ' + String(e.message).slice(0, 80)); }
  }
  return json({ ok: true, done: out });
}
