import { sql } from './_lib.js';

// Sniper hunt runs (table sniper_runs): the office creates one, n8n reports steps + the result to /hook/progress.
export const STAGES = ['maps', 'ig', 'photos', 'briefs'];
export const RUN_ID = /^[A-Za-z0-9-]{8,64}$/;
const STALE_S = 300; // no news for this long = the hunt is not coming back

export const createRun = (env, id, owner, district, niche) => sql(env,
  'INSERT INTO sniper_runs (id, owner_email, district, niche) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING RETURNING id',
  [id, owner, district.slice(0, 80), niche.slice(0, 80)]);

// The first final result wins; late progress or a second result never overwrites it.
export const finishRun = (env, id, status, reply, buttons, counts = {}) => sql(env,
  `UPDATE sniper_runs SET status = $2, reply = $3, buttons = $4::jsonb, counts = counts || $5::jsonb, updated_at = now(), finished_at = now()
   WHERE id = $1 AND finished_at IS NULL`,
  [id, status, String(reply).slice(0, 12000), JSON.stringify(buttons || []), JSON.stringify(counts)]);

// one run by id, or (id null) the newest one of the last 24 h; owner limits it to that account
export async function readRun(env, id, owner) {
  const [r] = await sql(env, `SELECT id, district, niche, stage, counts, status, reply, buttons,
      extract(epoch FROM coalesce(finished_at, now()) - started_at)::int AS elapsed, extract(epoch FROM now() - updated_at)::int AS quiet
    FROM sniper_runs WHERE ${id ? 'id = $1' : "$1::text IS NULL AND started_at > now() - interval '24 hours'"}
      AND ($2::text IS NULL OR owner_email = $2) ORDER BY started_at DESC LIMIT 1`, [id, owner]);
  if (!r) return null;
  const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  const run = { id: r.id, district: r.district, niche: r.niche, stage: r.stage, counts: parse(r.counts) || {}, status: r.status, reply: r.reply, buttons: parse(r.buttons) || [], elapsed: Number(r.elapsed) };
  if (run.status === 'running' && Number(r.quiet) > STALE_S) Object.assign(run, { status: 'source_down',
    reply: 'This hunt stopped reporting and no result arrived. Tap Retry to run it again.', buttons: [{ label: '↻ Retry', value: r.district + ' | ' + r.niche }] });
  return run;
}
