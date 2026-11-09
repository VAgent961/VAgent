import { sql, json, bad, body } from '../_lib.js';
import { officeData, companyText } from '../_office.js';
import { instance, call, summaries, runWebhook } from '../_n8n.js';
import { think, parseJSON, plain } from '../_brain.js';

const ACTIONS = `{"type":"create_department","name":"","mission":""}
{"type":"rename_department","department":"","name":""}
{"type":"set_mission","department":"","mission":""}
{"type":"delete_department","department":""}
{"type":"create_team","department":"","name":""}
{"type":"delete_team","department":"","team":""}
{"type":"move_agent","agent":"","department":"","team":""}   (team optional; department "none" removes it from any department)
{"type":"rename_agent","agent":"","name":""}
{"type":"run_agent","agent":""}
{"type":"turn_on","agent":""}
{"type":"turn_off","agent":""}
{"type":"assign_task","department":"","task":""}   (give a project to a department lead; its team does it after approval)`;

const convo = (history, msg, who) => (history || []).slice(-8).map((h) => (h.me ? 'Owner: ' : who + ': ') + String(h.t || '').slice(0, 600)).concat('Owner: ' + msg).join('\n');

// POST /api/talk {to: 'ceo' | 'lead:<deptId>' | 'agent:<key>', message, history:[{me, t}]}
export async function onRequestPost(ctx) {
  try { return await handle(ctx); } catch (e) { return json({ error: String(e.message || e).slice(0, 300) }, 500); }
}
async function handle({ request, env, data }) {
  const b = await body(request);
  const msg = String(b.message || '').trim().slice(0, 2000), to = String(b.to || 'ceo');
  if (!msg) return bad('Write a message.');
  const me = data.owner.split('@')[0].replace(/^./, (c) => c.toUpperCase());
  const d = await officeData(env);

  if (to === 'ceo') {
    const system = `You are the CEO of VAgent, a Lebanese studio that builds websites, AI agents and n8n automations. Owners: Hassan, Fayez, Boudy. You are talking to ${me}, an owner.
Every employee in the company is an n8n workflow. You see the whole company in COMPANY DATA (live). Answer short, clear and friendly, in the same language the owner writes in (English if unsure). Use only real facts from COMPANY DATA; if you don't know, say so.
You can change the company by proposing actions the owner will approve. Allowed actions, one JSON object each:
${ACTIONS}
Nothing changes until the owner presses Approve, so when you propose actions say they are ready for approval (never say they are done). Use exact names from COMPANY DATA. Only propose what the owner asked for or clearly wants (for "organize everyone", move each employee to the best department and team). When the owner wants work done (build, find, write, check...), propose assign_task to the best department with a complete brief in "task".
If the owner wants something the office website cannot do yet (a new feature, design change, new page, integration), also write "claude_prompt": a complete prompt to paste into Claude Code. It must say: work in the folder Desktop/Projects/VAgent, read CLAUDE.md and TREE.md first and nothing else unless needed, exactly what to build and where, how to check it works, then run ./scripts/deploy.sh and push to GitHub.
Return ONLY JSON: {"reply":"...","actions":[...],"claude_prompt":""}`;
    const t = await think(env, system, 'COMPANY DATA:\n' + companyText(d) + '\n\nCONVERSATION:\n' + convo(b.history, msg, 'CEO'));
    const j = parseJSON(t) || { reply: plain(t), actions: [] };
    return json({ reply: String(j.reply || '').trim() || 'Done.', actions: Array.isArray(j.actions) ? j.actions.slice(0, 40) : [], prompt: String(j.claude_prompt || '').trim(), via: 'ai' });
  }

  if (to.startsWith('lead:')) {
    const dept = d.departments.find((x) => x.id === Number(to.slice(5)));
    if (!dept) return bad('Department not found', 404);
    const team = d.agents.filter((a) => a.dept === dept.id);
    const tasks = await sql(env, 'SELECT text, status, final FROM vagent_tasks WHERE dept_id = $1 ORDER BY id DESC LIMIT 3', [dept.id]);
    const system = `You are the lead of the ${dept.name} department at VAgent (an AI studio). Mission: ${dept.mission || 'not set'}. Teams: ${dept.teams.map((t) => t.name).join(', ') || 'none'}.
Your employees (n8n workflows): ${team.map((a) => `${a.name} (${a.status}, ${a.runs24} runs today, last run ${a.last ? a.last.status : 'never'}, ${a.canRun || a.runnable ? 'can take tasks' : 'runs on its own trigger: ' + a.trigger})`).join('; ') || 'none yet'}.
Recent tasks: ${tasks.map((x) => x.text + ' → ' + x.status).join('; ') || 'none'}.
Talk to ${me} (an owner) as this lead: short, clear, practical, in the same language they write in (English if unsure). You can't change the org chart yourself: for new departments, teams or moving people, tell them to ask the CEO.
This department works like a project team. When the owner gives you work to do (build, make, find, write, check something…), write a clear, complete project brief in "project" (include every detail they gave) and in "reply" say how you will split it across your team: use as many members as possible, but ONLY members marked "can take tasks", and only for what their real job is. Be honest: if nobody can do a part, say so and suggest adding the right employee. The owner then presses Start. If they are only chatting, leave "project" empty.
Return ONLY JSON: {"reply":"...","project":""}`;
    const t = await think(env, system, convo(b.history, msg, 'Lead')), j = parseJSON(t);
    return json({ reply: j && j.reply ? String(j.reply) : plain(t), project: j && j.project ? String(j.project).slice(0, 3000) : '', actions: [], prompt: '', via: 'ai' });
  }

  if (to.startsWith('agent:')) {
    const key = to.slice(6), a = d.agents.find((x) => x.key === key);
    if (!a) return bad('Agent not found', 404);
    const [instId, wfId] = key.split(':');
    const inst = await instance(env, instId), wf = (await summaries(env, inst)).find((w) => w.id === wfId);
    if (wf && wf.webhook) { // a real chat agent: send the message to its own webhook
      const r = await runWebhook(wf.webhook, { message: msg, from: data.owner, source: 'vagent-office' }, env.WEBHOOK_SECRET);
      return json({ reply: r.output, actions: [], prompt: '', via: 'webhook', ok: r.ok });
    }
    const runs = ((await call(env, inst, '/executions?limit=5&workflowId=' + encodeURIComponent(wfId))).data || []).map((r) => r.status + ' ' + (r.stoppedAt || r.startedAt));
    const dept = d.departments.find((x) => x.id === a.dept), team = dept && dept.teams.find((t) => t.id === a.team);
    const system = `You are "${a.name}", an AI employee at VAgent. You are an n8n workflow${dept ? ' in the ' + dept.name + ' department' + (team ? ', ' + team.name + ' team' : '') : ''}.
How you start: ${a.trigger}${a.canRun ? ' (owners can also press "Run now" in the office to start you)' : ''}. You are ${a.active ? 'turned on' : 'turned off'}. Status now: ${a.status}.
Your steps, in order: ${(wf ? wf.steps : []).slice(0, 30).join(' → ')}.
Your last runs: ${runs.join('; ') || 'none'}.
Talk to ${me} (an owner) in first person, short, friendly and honest, in the same language they write in (English if unsure). Explain what you do and how it went, using only the facts above. If they want you to do work now: ${a.canRun ? 'tell them to press Run now.' : 'explain what starts you (your trigger) since you cannot be started from chat.'} Plain text only.`;
    return json({ reply: plain(await think(env, system, convo(b.history, msg, a.name))), actions: [], prompt: '', via: 'ai' });
  }
  return bad('Unknown chat');
}
