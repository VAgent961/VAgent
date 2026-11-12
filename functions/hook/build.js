import { sql, json, body } from '../_lib.js';

// POST /hook/build — n8n tells the office where a website build is, so the Office Helper can act it out.
// Office Helper sends stage "sent" (or "failed") when it hands the brief to PM Tech; Web Build Callback sends "done"/"failed" with the link.
// No session: authorised by the X-VAgent-Secret header (WEBHOOK_SECRET), like /hook/daily.
export async function onRequestPost({ request, env }) {
  const given = request.headers.get('X-VAgent-Secret') || '';
  if (!env.WEBHOOK_SECRET || given !== env.WEBHOOK_SECRET) return json({ error: 'Not allowed' }, 401);
  const b = await body(request);
  const job = String(b.job_id || '').trim().slice(0, 80);
  if (!job) return json({ error: 'No job_id' }, 400);
  const stage = ['sent', 'done', 'failed'].includes(String(b.stage)) ? String(b.stage) : 'sent';
  const s = (v, n) => (v == null || v === '' ? null : String(v).slice(0, n));
  await sql(env, `INSERT INTO vagent_builds (job_id, business, stage, link, error, updated_at) VALUES ($1, $2, $3, $4, $5, now())
    ON CONFLICT (job_id) DO UPDATE SET business = COALESCE(EXCLUDED.business, vagent_builds.business), stage = EXCLUDED.stage,
    link = COALESCE(EXCLUDED.link, vagent_builds.link), error = EXCLUDED.error, updated_at = now()`,
  [job, s(b.business, 160), stage, s(b.link, 500), s(b.error, 300)]);
  return json({ ok: true });
}
