import { json, bad, body } from '../_lib.js';
import { instances, call } from '../_n8n.js';

// PM Tech approvals. The ONLY record is the n8n data table `web_projects` on the website builder's n8n; Telegram, the review
// page and this API all read it and all decide through the same `review-decision` webhook (which lets exactly one answer win).
const HOST = 'https://boudy.vagent.online', REQUESTS = 'kqzri6hM0ft9MH9Q', PROGRESS = 'H3Co95uEWFribCFS';
const NAMES = { brief: 'Project brief', design: 'Page designs', site: 'Finished website', golive: 'Go live' };

async function builder(env) {
  const inst = (await instances(env)).find((i) => i.base_url.replace(/\/$/, '') === HOST);
  if (!inst) throw new Error('The website builder n8n is not connected (Settings).');
  return inst;
}
async function load(env, inst) {
  inst = inst || await builder(env);
  const rows = (t, n) => call(env, inst, `/data-tables/${t}/rows?limit=${n}&sortBy=createdAt:desc`).then((r) => r.data || []);
  const [reqs, log] = await Promise.all([rows(REQUESTS, 250), rows(PROGRESS, 250).catch(() => [])]);
  const live = progress(log);
  // newest request per project + stage; waiting ones count for 14 days (same rule as the PM inbox)
  const newest = new Map();
  for (const r of reqs.sort((a, b) => b.id - a.id)) if (r.token && NAMES[r.stage] && !/(^|-)test(-|$)/.test(r.project_id) && !newest.has(r.project_id + '|' + r.stage)) newest.set(r.project_id + '|' + r.stage, r);
  const cutoff = Date.now() - 14 * 86400000;
  const list = [...newest.values()].map((r) => {
    const link = HOST + '/webhook/review?p=' + encodeURIComponent(r.project_id) + '&t=' + r.token;
    // the exact text Telegram got (the request workflow logs it); rebuilt only when that log row is gone
    const sent = log.find((l) => String(l.message || '').includes(r.token) && /APPROVAL NEEDED/.test(l.message));
    const message = sent ? sent.message : `CLIENT APPROVAL NEEDED: ${NAMES[r.stage]} (${r.project_id})\n\nSend this link to the client:\n${link}\n\nMessage the client will see:\n${String(r.summary || '').slice(0, 1500) || '(none)'}`;
    const status = r.status === 'changes' ? 'changes_requested' : r.status === 'waiting' ? (new Date(r.createdAt).getTime() > cutoff ? 'pending' : 'expired') : r.status;
    return { id: r.id, project: r.project_id, stage: r.stage, stageName: NAMES[r.stage], status, message, link, note: r.feedback || '', decidedBy: r.decided_by || '', createdAt: r.createdAt, updatedAt: r.updatedAt, token: r.token };
  }).filter((r) => r.status !== 'expired');
  return Object.assign(list, { live });
}
// the steps of the project that moved last (only if within 2 h): every team member logs start/finish to project_progress
function progress(log) {
  const recent = log.filter((l) => l.project_id && Date.now() - new Date(l.createdAt).getTime() < 7200000).sort((a, b) => b.id - a.id);
  if (!recent.length) return null;
  const project = recent[0].project_id;
  return { project, steps: recent.filter((l) => l.project_id === project).slice(0, 10).reverse().map((l) => ({ id: l.id, step: String(l.step || '').replace(/ \(.*\)$/, ''), text: String(l.message || '').slice(0, 1500), at: l.createdAt })) };
}
const view = (list) => {
  const clean = list.map(({ token, ...r }) => r);
  return { progress: list.live || null, pending: clean.filter((r) => r.status === 'pending'), recent: clean.filter((r) => r.status !== 'pending').sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 6) };
};

// Server-Sent Events: n8n cannot push, so this connection reads the table and sends the list only when it changes.
// It ends itself after ~45 s (Workers allow 50 subrequests per invocation; 2 per tick here) and the browser reconnects.
const TICK = 5000, TICKS = 9;
function stream(env) {
  const enc = new TextEncoder();
  let n = 0, last = '', inst, closed = false, timer, wake;
  const body = new ReadableStream({
    async pull(c) {
      if (n) await new Promise((done) => { wake = done; timer = setTimeout(done, TICK); });
      if (closed) return;
      if (n++ >= TICKS) { closed = true; return c.close(); }
      let out;
      try {
        inst = inst || await builder(env);
        const next = JSON.stringify(view(await load(env, inst)));
        out = next === last ? 'event: ping\ndata: {}\n\n' : `data: ${next}\n\n`;
        last = next;
      } catch (e) { last = ''; out = `event: problem\ndata: ${JSON.stringify({ error: e.message })}\n\n`; }
      if (!closed) c.enqueue(enc.encode((n === 1 ? 'retry: 1000\n\n' : '') + out));
    },
    cancel() { closed = true; clearTimeout(timer); wake?.(); },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// GET /api/approvals -> {pending[], recent[]}  ·  GET /api/approvals?stream=1 -> the same, as an event stream
export async function onRequestGet({ request, env, data }) {
  if (data.role === 'client') return bad('Not allowed', 403);
  if (new URL(request.url).searchParams.has('stream')) return stream(env);
  try { return json(view(await load(env))); } catch (e) { return bad(e.message, 502); }
}

// POST /api/approvals {id, decision: approve|changes|reject, note}
export async function onRequestPost({ request, env, data }) {
  if (data.role === 'client') return bad('Not allowed', 403);
  const b = await body(request), decision = String(b.decision || ''), note = String(b.note || '').trim().slice(0, 3000);
  if (!['approve', 'changes', 'reject'].includes(decision)) return bad('Choose approve, send feedback or reject.');
  if (decision === 'changes' && !note) return bad('Write what to change first.');
  try {
    const item = (await load(env)).find((r) => r.id === Number(b.id));
    if (!item) return bad('That request no longer exists or was replaced by a newer one.', 409);
    if (item.status !== 'pending') return bad('Already answered' + (item.decidedBy ? ' by ' + item.decidedBy : '') + '.', 409);
    const who = String(data.owner).split('@')[0];
    const r = await fetch(HOST + '/webhook/review-decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p: item.project, t: item.token, decision, feedback: note, name: who + ' (website)', via: 'website' }), signal: AbortSignal.timeout(25000) });
    if (r.status === 400) return bad('Already answered somewhere else. The list is refreshed.', 409);
    if (!r.ok) return bad('The approval workflow answered ' + r.status + '. Nothing was confirmed.', 502);
    return json({ ok: true, ...view(await load(env)) });
  } catch (e) { return bad(e.message, 502); }
}
