import { sql, json, body } from '../_lib.js';
import { STAGES, RUN_ID, finishRun } from '../_runs.js';

// POST /hook/progress — Sniper Hunt / Sniper Client Chat report a hunt (header X-VAgent-Secret, like /hook/build).
// Step: {run_id, stage, counts:{places,passed,leads}, add:{handles,checked}}. Result: {run_id, final:true, status, reply, buttons, counts}.
export async function onRequestPost({ request, env }) {
  const given = request.headers.get('X-VAgent-Secret') || '';
  if (!env.WEBHOOK_SECRET || given !== env.WEBHOOK_SECRET) return json({ error: 'Not allowed' }, 401);
  const b = await body(request);
  const id = String(b.run_id || '');
  if (!RUN_ID.test(id)) return json({ ok: true, skipped: true }); // a hunt nobody is watching
  const nums = (o) => Object.fromEntries(['places', 'handles', 'checked', 'passed', 'leads', 'briefs']
    .filter((k) => o && o[k] != null && Number.isFinite(Number(o[k]))).map((k) => [k, Number(o[k])]));
  if (b.final) {
    const status = /^(ok|quota_out|source_down|partial)$/.test(b.status) ? b.status : 'ok';
    const buttons = (Array.isArray(b.buttons) ? b.buttons : []).slice(0, 40).map((x) => ({ label: String(x?.label ?? '').slice(0, 40), value: String(x?.value ?? '').slice(0, 160) })).filter((x) => x.label && x.value);
    await finishRun(env, id, status, b.reply || 'Done.', buttons, nums(b.counts));
    return json({ ok: true });
  }
  if (!STAGES.includes(b.stage)) return json({ error: 'Unknown stage' }, 400);
  // counts replace; add accumulates over the hunt's rounds
  await sql(env, `UPDATE sniper_runs SET stage = $2, updated_at = now(), counts = counts || $3::jsonb || coalesce((
      SELECT jsonb_object_agg(a.key, coalesce((counts->>a.key)::int, 0) + a.value::int) FROM jsonb_each_text($4::jsonb) a), '{}'::jsonb)
    WHERE id = $1 AND finished_at IS NULL`, [id, b.stage, JSON.stringify(nums(b.counts)), JSON.stringify(nums(b.add))]);
  return json({ ok: true });
}
