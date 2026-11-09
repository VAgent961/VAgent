import { sql, decrypt, encrypt } from './_lib.js';
export const HOOK = 'VAgent: run now';

// ---- n8n helpers (server-side only; API keys never leave the server) ----
export const instances = (env) => sql(env, 'SELECT id, label, base_url, api_key_enc, owner_email FROM vagent_n8n ORDER BY id');
export const instance = async (env, id) => (await sql(env, 'SELECT id, label, base_url, api_key_enc, owner_email FROM vagent_n8n WHERE id = $1', [Number(id)]))[0];

export async function call(env, inst, path, init = {}, key) {
  key = key || (await decrypt(env, inst.api_key_enc));
  const r = await fetch(inst.base_url + '/api/v1' + path, {
    ...init,
    headers: { 'X-N8N-API-KEY': key, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 401 || r.status === 403) throw new Error('n8n refused the API key');
  if (!r.ok) throw new Error('n8n answered ' + r.status);
  return r.status === 204 ? {} : r.json();
}

function triggerOf(nodes) {
  const t = nodes.map((n) => n.type || '');
  const has = (re) => t.some((x) => re.test(x));
  if (has(/\.webhook$/i)) return 'webhook';
  if (has(/chatTrigger/i)) return 'chat';
  if (has(/telegramTrigger/i)) return 'telegram';
  if (has(/scheduleTrigger|\.cron$|\.interval$/i)) return 'schedule';
  if (has(/formTrigger/i)) return 'form';
  if (has(/executeWorkflowTrigger/i)) return 'helper';
  if (has(/errorTrigger/i)) return 'alarm';
  if (has(/Trigger$/i)) return 'app';
  return 'manual';
}

// Compact summary of a workflow: name, trigger, webhook (if runnable) and ordered step names.
export function summarize(wf, base) {
  const nodes = (wf.nodes || []).filter((n) => !/stickyNote/i.test(n.type));
  const wh = nodes.find((n) => /\.webhook$/i.test(n.type) && !n.disabled && n.name !== HOOK), hook = nodes.find((n) => n.name === HOOK && !n.disabled);
  const path = wh && String(wh.parameters?.path || wh.webhookId || '').replace(/^\//, '');
  const webhook = path && !path.includes(':') ? { url: base + '/webhook/' + path, method: wh.parameters?.httpMethod || 'GET' } : null;
  // order steps by walking connections from the triggers
  const conn = wf.connections || {}, seen = new Set(), order = [];
  const queue = nodes.filter((n) => /Trigger$|\.webhook$/i.test(n.type)).map((n) => n.name);
  while (queue.length && order.length < 40) {
    const n = queue.shift(); if (seen.has(n)) continue; seen.add(n); order.push(n);
    for (const outs of Object.values(conn[n] || {})) for (const arr of outs || []) for (const c of arr || []) if (c && !seen.has(c.node)) queue.push(c.node);
  }
  for (const n of nodes) if (!seen.has(n.name) && order.length < 40) order.push(n.name);
  const runHook = hook ? { url: base + '/webhook/' + hook.parameters.path, method: 'POST' } : null;
  return { id: String(wf.id), name: wf.name, active: !!wf.active, trigger: triggerOf(nodes.filter((n) => n.name !== HOOK)), webhook, runHook, steps: order.filter((n) => n !== HOOK), updatedAt: wf.updatedAt };
}

// Workflow summaries per instance, cached in Neon for 2 minutes (keeps CPU and n8n load low).
export async function summaries(env, inst, fresh = false) {
  if (!fresh) {
    const [c] = await sql(env, "SELECT summary FROM vagent_wf_cache WHERE inst_id = $1 AND at > now() - interval '2 minutes'", [inst.id]);
    if (c) return c.summary;
  }
  const key = await decrypt(env, inst.api_key_enc);
  let out = [], cursor = '';
  for (let page = 0; page < 4; page++) {
    const r = await call(env, inst, '/workflows?limit=100&excludePinnedData=true' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), {}, key);
    for (const wf of r.data || []) if (!wf.isArchived) out.push(summarize(wf, inst.base_url));
    if (!r.nextCursor) break; cursor = r.nextCursor;
  }
  if (env.WEBHOOK_SECRET && (await ensureHooks(env, inst, out, key))) return summaries(env, inst, true);
  await sql(env, 'INSERT INTO vagent_wf_cache (inst_id, summary, at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (inst_id) DO UPDATE SET summary = EXCLUDED.summary, at = now()', [inst.id, JSON.stringify(out)]);
  return out;
}

export const forgetCache = (env, instId) => sql(env, 'DELETE FROM vagent_wf_cache WHERE inst_id = $1', [instId]);

// Status of one workflow from its recent executions.
export function statusOf(wf, runs) {
  const running = runs.find((r) => r.status === 'running' || r.status === 'new');
  const last = runs.find((r) => r.stoppedAt);
  const failed = last && /error|crashed/.test(last.status) && Date.now() - Date.parse(last.stoppedAt) < 864e5;
  return { status: running ? 'working' : failed ? 'help' : wf.active ? 'idle' : 'off', running, last };
}

// AI answers sometimes come back as a JSON string: pull out the readable text.
function unwrap(t) {
  const s = String(t || '').trim().replace(/^```(json)?|```$/g, '').trim();
  if (!/^[\[{]/.test(s)) return t;
  try { const j = JSON.parse(s), v = Array.isArray(j) ? j[0] : j; if (typeof v === 'string') return v; const k = ['response', 'answer', 'output', 'text', 'message', 'reply', 'result'].find((x) => typeof v?.[x] === 'string'); return k ? v[k] : Object.values(v || {}).find((x) => typeof x === 'string' && x.length > 20) || t; } catch { return t; }
}

// Send a message/task to an agent through its webhook. Returns { ok, output }.
export async function runWebhook(wh, payload, secret) {
  try {
    const isGet = String(wh.method).toUpperCase() === 'GET';
    const url = isGet ? wh.url + '?' + new URLSearchParams(Object.entries(payload).map(([k, v]) => [k, String(v)])) : wh.url;
    const r = await fetch(url, { method: wh.method || 'POST', headers: { ...(isGet ? {} : { 'Content-Type': 'application/json' }), ...(secret ? { 'X-VAgent-Secret': secret } : {}) }, body: isGet ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(55000) });
    const text = (await r.text()).slice(0, 6000);
    let output = text;
    try { const j = JSON.parse(text); const v = Array.isArray(j) ? j[0] : j; output = typeof v === 'string' ? v : (v && (v.output || v.text || v.reply || v.message || v.answer)) || JSON.stringify(j, null, 1); } catch {}
    output = unwrap(output);
    return { ok: r.ok, output: String(output || (r.ok ? 'Done.' : 'Failed ' + r.status)).slice(0, 3000) };
  } catch (e) {
    return { ok: false, output: /timeout|abort/i.test(String(e)) ? 'Still working after 55s. Check it in n8n.' : 'Could not reach it.' };
  }
}

// Adds a protected "VAgent: run now" webhook to workflows that start on a schedule or by hand,
// so the office can start them. Never touches workflows with other triggers (Telegram, chat, webhook…).
// Each workflow is tried once (vagent_hooks). Returns true if anything changed.
export async function ensureHooks(env, inst, wfs, key) {
  const todo = wfs.filter((w) => (w.trigger === 'schedule' || w.trigger === 'manual') && !w.runHook && !w.webhook);
  if (!todo.length) return false;
  const done = new Set((await sql(env, 'SELECT key FROM vagent_hooks WHERE key LIKE $1', [inst.id + ':%'])).map((r) => r.key));
  const list = todo.filter((w) => !done.has(inst.id + ':' + w.id)).slice(0, 5);
  if (!list.length) return false;
  let cred = (await sql(env, 'SELECT cred_id FROM vagent_n8n WHERE id = $1', [inst.id]))[0]?.cred_id;
  if (!cred) {
    const c = await call(env, inst, '/credentials', { method: 'POST', body: JSON.stringify({ name: 'VAgent office secret', type: 'httpHeaderAuth', data: { name: 'X-VAgent-Secret', value: env.WEBHOOK_SECRET } }) }, key);
    cred = String(c.id); await sql(env, 'UPDATE vagent_n8n SET cred_id = $1 WHERE id = $2', [cred, inst.id]);
  }
  let changed = false;
  for (const w of list) {
    const k = inst.id + ':' + w.id;
    try {
      const wf = await call(env, inst, '/workflows/' + w.id, {}, key);
      const trig = wf.nodes.find((n) => /scheduleTrigger|\.cron$|\.interval$|manualTrigger/i.test(n.type));
      if (!trig) throw new Error('no trigger');
      wf.nodes.push({ id: crypto.randomUUID(), name: HOOK, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [trig.position[0], trig.position[1] + 220], webhookId: crypto.randomUUID(),
        parameters: { httpMethod: 'POST', path: 'vagent-run-' + w.id, authentication: 'headerAuth', responseMode: 'onReceived', options: {} }, credentials: { httpHeaderAuth: { id: cred, name: 'VAgent office secret' } } });
      wf.connections[HOOK] = JSON.parse(JSON.stringify(wf.connections[trig.name] || { main: [[]] }));
      const keep = ['executionOrder', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveManualExecutions', 'saveExecutionProgress', 'executionTimeout', 'errorWorkflow', 'timezone', 'callerPolicy'];
      const settings = Object.fromEntries(Object.entries(wf.settings || {}).filter(([x]) => keep.includes(x)));
      await call(env, inst, '/workflows/' + w.id, { method: 'PUT', body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings }) }, key);
      if (wf.active) { await call(env, inst, '/workflows/' + w.id + '/deactivate', { method: 'POST' }, key); await call(env, inst, '/workflows/' + w.id + '/activate', { method: 'POST' }, key); }
      await sql(env, 'INSERT INTO vagent_hooks (key, status) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET status = EXCLUDED.status, at = now()', [k, 'added']);
      changed = true;
    } catch (e) {
      await sql(env, 'INSERT INTO vagent_hooks (key, status, note) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, at = now()', [k, 'failed', String(e.message).slice(0, 200)]);
    }
  }
  return changed;
}
