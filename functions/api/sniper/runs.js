import { json, bad } from '../../_lib.js';
import { readRun, RUN_ID } from '../../_runs.js';

// GET /api/sniper/runs (newest of 24 h) · ?id=<run> · ?id=<run>&stream=1 (event stream). Client accounts see only their own.
export async function onRequestGet({ request, env, data }) {
  const q = new URL(request.url).searchParams, id = q.get('id');
  if (id && !RUN_ID.test(id)) return bad('Bad run id');
  const owner = data.role === 'client' ? data.owner : null;
  if (id && q.has('stream')) return stream(env, id, owner);
  return json({ run: await readRun(env, id, owner) });
}

// Ends itself after ~44 s (Workers allow 50 subrequests per invocation) and the browser reconnects.
const TICK = 2000, TICKS = 22;
function stream(env, id, owner) {
  const enc = new TextEncoder();
  let n = 0, closed = false, timer, wake;
  const out = new ReadableStream({
    async pull(c) {
      if (n) await new Promise((done) => { wake = done; timer = setTimeout(done, TICK); });
      if (closed) return;
      if (n++ >= TICKS) { closed = true; return c.close(); }
      let msg, over = false;
      try { const run = await readRun(env, id, owner); over = !!run && run.status !== 'running'; msg = `data: ${JSON.stringify({ run })}\n\n`; }
      catch (e) { msg = `event: problem\ndata: ${JSON.stringify({ error: e.message })}\n\n`; }
      if (closed) return;
      c.enqueue(enc.encode((n === 1 ? 'retry: 1000\n\n' : '') + msg));
      if (over) { closed = true; c.close(); }
    },
    cancel() { closed = true; clearTimeout(timer); wake?.(); },
  });
  return new Response(out, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' } });
}
