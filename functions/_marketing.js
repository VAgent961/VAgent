// Marketing queue: rendering -> review -> scheduled -> publishing -> published (or declined / failed).
// "scheduled" is the approved state. Publishing to Instagram lives in _publish.js.
// Video lives in marketing_media (base64 chunks) and is deleted on publish, decline and re-render.
import { sql, encrypt, decrypt } from './_lib.js';

export const CHUNK = 400000;
export const SHOTS = ['hook', 'phone', 'flow', 'browser', 'list', 'approve', 'alert', 'cta'];
export const SITE = 'https://city.vagent.online';
// Publishing columns are added on first use (also in scripts/migrate.mjs). `targets` is legacy: only old approval hashes include it.
// Posts left over from the removed second platform are settled here: never approved for Instagram = approval cleared;
// already on Instagram = published and the video deleted.
const NOT_IG = "targets IS NOT NULL AND NOT targets ? 'instagram'";
const UPGRADE = [
  "ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS targets jsonb, ADD COLUMN IF NOT EXISTS pub jsonb NOT NULL DEFAULT '{}'::jsonb",
  `UPDATE marketing_posts SET status = 'review', targets = NULL, slot = NULL, approved_hash = NULL, approved_by = NULL, dry_run_at = NULL, updated_at = now() WHERE status = 'scheduled' AND ${NOT_IG}`,
  `UPDATE marketing_posts SET status = 'failed', targets = NULL, error = 'Not approved for Instagram: approve again', updated_at = now() WHERE status = 'publishing' AND ${NOT_IG}`,
  "UPDATE marketing_posts SET status = 'published', video_sha = NULL, error = NULL, updated_at = now() WHERE status IN ('failed', 'review', 'scheduled') AND pub->'instagram'->>'state' = 'published'",
  "ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS auto_day date", // set on posts the autopilot wrote
  "DELETE FROM marketing_media WHERE post_id IN (SELECT id FROM marketing_posts WHERE status = 'published')",
  "DELETE FROM marketing_settings WHERE left(k, 3) = 'tt_'", // its saved keys, tokens and options
];
let ready;
export const schema = (env) => (ready ||= (async () => { for (const q of UPGRADE) await sql(env, q); })().catch((e) => { ready = null; throw e; }));
// A publish that succeeded stays recorded, so a post is never sent twice.
export const KEEP = `pub = COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each(pub) WHERE value->>'state' = 'published'), '{}'::jsonb)`;
export const BANNED = /whats\s?app|wa\.me|\bfree(ly)?\b|\bcosts?\b|\bpric(e|es|ed|ing)\b|[$€£]|\bpaid\b|\bcheap|\bdiscount|\bsubscri|\bfees?\b|\bafford|واتس|مجان|سعر|أسعار|كلفة|تكلفة/i;
const str = (v, n) => typeof v === 'string' && v.trim().length > 0 && v.length <= n;

// Returns an error text, or '' when the post is fine.
export function lint(p) {
  if (!p || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(p.id || '')) return 'Bad post id';
  if (!Array.isArray(p.scenes) || !p.scenes.length || p.scenes.length > 10) return 'A post needs 1 to 10 scenes';
  for (const s of p.scenes) {
    if (!str(s.say, 200) || !str(s.title, 60)) return 'Each scene needs a spoken line and a title (keep them short)';
    if (s.chat && !(Array.isArray(s.chat) && ['you', 'agent'].includes(s.chat[0]) && str(s.chat[1], 140))) return 'Bad demo message';
    if (s.shot !== undefined && !SHOTS.includes(s.shot)) return 'Unknown scene type';
    if (s.items !== undefined && !(Array.isArray(s.items) && s.items.length <= 4 && s.items.every((x) => str(x, 60)))) return 'A scene takes up to 4 short on-screen lines';
  }
  // every video: its own direction, and a 1-2 word comment keyword with the info an auto-reply will send
  const key = p.keyword;
  if (typeof key !== 'string' || key.length > 24 || !/^[\p{Lu}\p{N}]+( [\p{Lu}\p{N}]+)?$/u.test(key)) return 'Add a comment keyword of 1 or 2 words, in capitals';
  if (!p.info || !str(p.info.title, 80) || !str(p.info.summary, 600)) return 'Add the keyword info (title and summary)';
  if (!p.direction || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(p.direction.world || '') || !str(p.direction.concept, 200)) return 'Add a direction (own world and concept) for this video';
  const asks = new RegExp(`comment\\b[^\\n]{0,24}\\b${key}\\b`, 'iu');
  if (!asks.test(String(p.caption))) return `The caption must ask people to comment ${key}`;
  if (!asks.test(`${p.scenes.at(-1).say}\n${p.scenes.at(-1).title}`)) return `The last scene must ask people to comment ${key}`;
  if (!str(p.caption, 1800) || !Array.isArray(p.hashtags) || p.hashtags.length > 30 || !p.hashtags.every((h) => /^#[\p{L}\p{N}_]{1,50}$/u.test(h))) return 'Check the caption and hashtags';
  const hit = JSON.stringify({ s: p.scenes, c: p.caption, h: p.hashtags, k: p.keyword, i: p.info, d: p.direction }).match(BANNED);
  return hit ? `Content rule: "${hit[0]}" is not allowed in a post` : '';
}
const clean = (p) => ({ id: p.id, keyword: p.keyword, info: p.info && { title: p.info.title, summary: p.info.summary }, direction: p.direction && { world: p.direction.world, concept: p.direction.concept }, scenes: p.scenes.map((s) => ({ say: s.say, title: s.title, mood: s.mood === 'think' ? 'think' : 'talk', ...(s.chat ? { chat: [s.chat[0], s.chat[1]] } : {}), ...(s.end ? { end: true } : {}), ...(s.shot ? { shot: s.shot } : {}), ...(s.items?.length ? { items: [...s.items] } : {}) })), caption: p.caption, hashtags: p.hashtags });

export async function digest(row) {
  const raw = new TextEncoder().encode(JSON.stringify([row.id, row.version, row.post, row.video_sha, ...(row.targets ? [row.targets] : [])]));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const log = (env, id, event, detail = '') => sql(env, 'INSERT INTO marketing_events (post_id, event, detail) VALUES ($1, $2, $3)', [id, event, String(detail).slice(0, 300)]);
export const dropMedia = (env, id) => sql(env, 'DELETE FROM marketing_media WHERE post_id = $1', [id]);
// Safety net for a delete that was interrupted: a closed post never keeps video.
export const sweepMedia = (env) => sql(env, "DELETE FROM marketing_media WHERE post_id IN (SELECT id FROM marketing_posts WHERE status IN ('published', 'declined'))");
// Ids and states only (the ids are public in the repo): used by the repo skills for dedup and local cleanup.
export const states = (env) => sql(env, 'SELECT id, status FROM marketing_posts ORDER BY id');
const one = async (env, id) => (await sql(env, 'SELECT * FROM marketing_posts WHERE id = $1', [id]))[0];

export async function setting(env, k) { return (await sql(env, 'SELECT v FROM marketing_settings WHERE k = $1', [k]))[0]?.v ?? null; }
export const setSetting = (env, k, v) => sql(env, 'INSERT INTO marketing_settings (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = $2', [k, v]);

// ── owner actions ──
export async function approve(env, id, version, who) {
  const row = await one(env, id);
  if (!row || row.status !== 'review' || Number(row.version) !== Number(version)) return 'This post changed. Reload and review it again.';
  const err = lint(row.post); if (err) return err;
  if (row.pub?.instagram?.state === 'published') return 'Already published.';
  // next free Tue/Thu/Sat 19:00 Beirut, computed by Postgres so daylight saving is right
  const done = await sql(env, `UPDATE marketing_posts SET status = 'scheduled', approved_hash = $3, approved_by = $4, targets = NULL, ${KEEP}, error = NULL, dry_run_at = NULL, updated_at = now(), slot = (
      SELECT s FROM (SELECT (d::date + time '19:00') AT TIME ZONE 'Asia/Beirut' AS s FROM generate_series((now() AT TIME ZONE 'Asia/Beirut')::date::timestamp, (now() AT TIME ZONE 'Asia/Beirut')::date::timestamp + interval '365 days', interval '1 day') d
        WHERE extract(isodow FROM d) IN (2, 4, 6)) c
      WHERE s > now() AND NOT EXISTS (SELECT 1 FROM marketing_posts p WHERE p.slot = s AND p.status IN ('scheduled', 'publishing', 'published')) ORDER BY s LIMIT 1)
    WHERE id = $1 AND version = $2 AND status = 'review' RETURNING slot`, [id, row.version, await digest({ ...row, targets: null }), who]);
  if (!done.length) return 'This post changed. Reload and review it again.';
  await log(env, id, 'approved', who); return '';
}
export async function decline(env, id, who) {
  const r = await sql(env, `UPDATE marketing_posts SET status = 'declined', slot = NULL, approved_hash = NULL, video_sha = NULL, updated_at = now() WHERE id = $1 AND status IN ('rendering', 'review', 'scheduled', 'failed') RETURNING id`, [id]);
  if (!r.length) return 'This post cannot be declined now.';
  await dropMedia(env, id); await log(env, id, 'declined', who); return '';
}
// Moving an approved post in time keeps the approval (the content is unchanged). `at` is Beirut local time, YYYY-MM-DDTHH:mm.
export async function reschedule(env, id, version, at, who) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/.test(at || '')) return 'Choose a date and time.';
  let r;
  try {
    r = await sql(env, `UPDATE marketing_posts SET slot = $3::timestamp AT TIME ZONE 'Asia/Beirut', dry_run_at = NULL, ${KEEP}, updated_at = now()
      WHERE id = $1 AND version = $2 AND status = 'scheduled' AND $3::timestamp AT TIME ZONE 'Asia/Beirut' > now() AND extract(isodow FROM $3::timestamp) IN (2, 4, 6) RETURNING id`, [id, version, at]);
  } catch (e) {
    if (e.message.includes('marketing_slot')) return 'Another post already has that time.';
    if (/out of range/.test(e.message)) return 'That date does not exist.';
    throw e;
  }
  if (!r.length) return 'Choose a future Tuesday, Thursday or Saturday. If it is one, this post changed: reload first.';
  await log(env, id, 'rescheduled', `${at} ${who}`); return '';
}
// After a failed publish: back to review with the video kept. Needs a new approval.
export async function republish(env, id, version, who) {
  const r = await sql(env, `UPDATE marketing_posts SET status = 'review', slot = NULL, approved_hash = NULL, approved_by = NULL, dry_run_at = NULL, publish_started_at = NULL, error = NULL, ${KEEP}, updated_at = now()
    WHERE id = $1 AND version = $2 AND status = 'failed' AND video_sha IS NOT NULL RETURNING id`, [id, version]);
  if (!r.length) return 'This post cannot be tried again. Reload first.';
  await log(env, id, 'republish', who); return '';
}
// Any edit clears the approval. Changing a scene renders a new video; caption/hashtags only go back to review.
export async function edit(env, id, version, input, who) {
  const row = await one(env, id);
  if (!row || !['rendering', 'review', 'scheduled', 'failed'].includes(row.status) || Number(row.version) !== Number(version)) return 'This post changed. Reload first.';
  const next = { ...row.post, ...input, id, direction: row.post.direction || autoDirection({ ...row.post, id }) }; // the direction belongs to the repo
  const err = lint(next) || await taken(env, next); if (err) return err;
  const post = clean(next);
  const redo = !row.video_sha || row.status === 'failed' || JSON.stringify(post.scenes) !== JSON.stringify(clean(row.post).scenes);
  if (!redo && JSON.stringify(post) === JSON.stringify(clean(row.post))) return '';
  const r = await sql(env, `UPDATE marketing_posts SET post = $3, version = version + 1, status = $4, slot = NULL, approved_hash = NULL, approved_by = NULL, dry_run_at = NULL, ig_container_id = NULL, publish_started_at = NULL, error = NULL, attempts = 0, auto_day = NULL, ${KEEP},
      video_sha = CASE WHEN $5 THEN NULL ELSE video_sha END, updated_at = now() WHERE id = $1 AND version = $2 AND status = $6 RETURNING version`,
  [id, row.version, JSON.stringify(post), redo ? 'rendering' : 'review', redo, row.status]);
  if (!r.length) return 'This post changed. Reload first.';
  if (redo) await dropMedia(env, id); else await sql(env, 'UPDATE marketing_media SET version = $2 WHERE post_id = $1', [id, r[0].version]);
  await log(env, id, 'edited', who); return '';
}

// ── duplicates (text check). `used` holds earlier posts, and page posts as {page: true, caption}. ──
const STOP = new Set('a an the and or of to in on is it you your we our for with that this who are be can no not never one get just here want comment words word agent agents vagent send details'.split(' '));
const words = (s) => new Set(String(s || '').toLowerCase().match(/[a-z]{3,}/g)?.filter((w) => !STOP.has(w)).map((w) => w.replace(/s$/, '')) || []);
export const alike = (a, b) => { const x = words(a), y = words(b), both = [...x].filter((w) => y.has(w)).length; return both / (x.size + y.size - both || 1); };
const said = (p) => (p.scenes || []).map((s) => s.say).join(' ');
const body = (c) => String(c || '').split('\n').filter((l) => !/^\s*(#|comment\b)/i.test(l)).join('\n');
// Why the post repeats an earlier one, or ''.
export function repeats(p, used) {
  const first = p.scenes[0].say;
  for (const o of used) {
    if (o.id && o.id === p.id) continue;
    const name = `"${o.info?.title || body(o.caption).split('\n')[0].slice(0, 80)}"`;
    if (o.page) {
      if (new RegExp(`comment\\b[^\\n]{0,24}\\b${p.keyword}\\b`, 'iu').test(o.caption)) return `The keyword ${p.keyword} is already used on the Instagram page`;
      if (alike(first, body(o.caption).split('\n')[0]) >= .4 || alike(body(p.caption), body(o.caption)) >= .3) return `It repeats the page post ${name}`;
      continue;
    }
    if (o.keyword === p.keyword) return `The keyword ${p.keyword} is already used`;
    if (alike(first, o.scenes?.[0]?.say) >= .4) return `The first line is too close to the one in ${name}`;
    if (alike(p.info.title, o.info?.title) >= .5 || alike(`${p.info.title} ${p.info.summary}`, `${o.info?.title || ''} ${o.info?.summary || ''}`) >= .35) return `The topic repeats ${name}`;
    if (alike(said(p), said(o)) >= .3) return `The script repeats ${name}`;
    if (alike(body(p.caption), body(o.caption)) >= .35) return `The caption repeats ${name}`;
  }
  return '';
}

// No two videos share a world, and no two live ones share a keyword (the auto-reply maps keyword -> video).
async function taken(env, p) {
  const [hit] = await sql(env, `SELECT id FROM marketing_posts WHERE id <> $1 AND (post->'direction'->>'world' = $2 OR (status <> 'declined' AND post->>'keyword' = $3)) LIMIT 1`, [p.id, p.direction.world, p.keyword]);
  return hit ? `The world or keyword is already used by ${hit.id}` : '';
}

// ── renderer (GitHub Actions) ──
// A post without its own direction gets one named after it; the renderer generates the world files.
const autoDirection = (p) => ({ world: `auto-${p.id}`.slice(0, 41), concept: String(p.scenes?.[0]?.title || p.id).slice(0, 200) });
// Fills what an older row is missing from the repo draft. A post the owner edited keeps their wording.
function heal(row, draft) {
  const old = row.post;
  if (old.keyword && old.info && old.direction) return old;
  if (!draft || lint(draft)) return { ...old, direction: old.direction || autoDirection({ ...old, id: row.id }) };
  const next = clean(draft);
  if (!row.edited) return next;
  const ask = draft.caption.split('\n\n').at(-1);
  return { ...next, scenes: [...old.scenes.slice(0, -1), next.scenes.at(-1)], caption: `${old.caption}\n\n${ask}`, hashtags: old.hashtags };
}
// Unpublished: waiting, or failed while rendering (a failed publish is never retried by itself).
const OPEN = "(status IN ('rendering', 'review', 'scheduled') OR (status = 'failed' AND video_sha IS NULL AND publish_started_at IS NULL))";
const RESET = "version = version + 1, status = 'rendering', slot = NULL, approved_hash = NULL, approved_by = NULL, dry_run_at = NULL, ig_container_id = NULL, publish_started_at = NULL, error = NULL, attempts = 0, video_sha = NULL, updated_at = now(), pub = COALESCE((SELECT jsonb_object_agg(key, value) FROM jsonb_each(pub) WHERE value->>'state' = 'published'), '{}'::jsonb)";
export async function retry(env, id, version, who) {
  const r = await sql(env, `UPDATE marketing_posts SET ${RESET}, auto_day = NULL WHERE id = $1 AND version = $2 AND status = 'failed' AND ${OPEN} RETURNING id`, [id, version]);
  if (!r.length) return 'This post cannot be rendered again. Reload first.';
  await dropMedia(env, id); await log(env, id, 'retry', who); return '';
}
export async function seed(env, posts) {
  // one lookup for all known ids: a request has a limited number of database calls and drafts keep piling up
  const rows = await sql(env, 'SELECT id, post FROM marketing_posts');
  const have = new Set(rows.map((r) => r.id)), used = rows.map((r) => r.post).filter(Boolean);
  for (let p of posts) {
    if (p?.id && p.scenes && !p.direction) p = { ...p, direction: autoDirection(p) };
    if (p?.id && have.has(String(p.id))) continue;
    const err = lint(p) || repeats(p, used) || await taken(env, p);
    if (!err) used.push(p);
    if (err) { await log(env, String(p?.id), 'rejected_seed', err); continue; }
    await sql(env, 'INSERT INTO marketing_posts (id, post) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [p.id, JSON.stringify(clean(p))]);
  }
}
// Runs on every renderer check. Re-renders (clearing approval, like any edit) when the look changed, or when a row
// was missing its keyword or direction and could be completed.
export async function relook(env, look, drafts = []) {
  if (!/^[a-z0-9-]{1,40}$/.test(look || '')) return;
  const changed = (await setting(env, 'look')) !== look;
  const rows = await sql(env, `SELECT id, post, EXISTS (SELECT 1 FROM marketing_events e WHERE e.post_id = p.id AND e.event = 'edited') AS edited FROM marketing_posts p WHERE ${OPEN}`);
  const todo = rows.map((r) => ({ ...r, next: heal(r, drafts.find((d) => d?.id === r.id)) })).filter((r) => changed || JSON.stringify(r.next) !== JSON.stringify(r.post));
  if (todo.length) await setSetting(env, `backup:${look}:${Date.now()}`, JSON.stringify(todo.map(({ id, post }) => ({ id, post })))); // the posts as they were
  for (const r of todo) {
    const done = await sql(env, `UPDATE marketing_posts SET post = $2, ${RESET} WHERE id = $1 AND ${OPEN} RETURNING id`, [r.id, JSON.stringify(r.next)]);
    if (done.length) { await dropMedia(env, r.id); await log(env, r.id, changed ? 'new_look' : 'healed', look); }
  }
  if (changed) await setSetting(env, 'look', look);
}
export const queue = (env) => sql(env, "SELECT id, version, post FROM marketing_posts WHERE status = 'rendering' AND (auto_day IS NULL OR now() < (auto_day + time '19:00') AT TIME ZONE 'Asia/Beirut') ORDER BY created_at, id LIMIT 10");
export async function putChunk(env, id, version, n, bytes) {
  if (!bytes.length || bytes.length > CHUNK || !(n >= 0 && n < 40)) return 'Bad chunk';
  let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  const r = await sql(env, `INSERT INTO marketing_media (post_id, version, n, data) SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM marketing_posts WHERE id = $1 AND version = $2 AND status = 'rendering')
    ON CONFLICT (post_id, version, n) DO UPDATE SET data = $4 RETURNING n`, [id, version, n, btoa(s)]);
  return r.length ? '' : 'Post changed';
}
export async function complete(env, id, version, sha, size) {
  const [m] = await sql(env, "SELECT count(*)::int AS c, coalesce(sum(length(decode(data, 'base64'))), 0)::int AS b FROM marketing_media WHERE post_id = $1 AND version = $2", [id, version]);
  if (!/^[a-f0-9]{64}$/.test(sha) || m.b !== size || m.c !== Math.ceil(size / CHUNK)) return 'Upload incomplete';
  const r = await sql(env, "UPDATE marketing_posts SET status = 'review', video_sha = $3, video_size = $4, error = NULL, updated_at = now() WHERE id = $1 AND version = $2 AND status = 'rendering' RETURNING id", [id, version, sha, size]);
  if (!r.length) return 'Post changed';
  await log(env, id, 'rendered'); return '';
}
export async function renderFailed(env, id, version, why) {
  const r = await sql(env, "UPDATE marketing_posts SET attempts = attempts + 1, status = CASE WHEN attempts >= 2 THEN 'failed' ELSE status END, error = $3, updated_at = now() WHERE id = $1 AND version = $2 AND status = 'rendering' RETURNING id", [id, version, String(why).slice(0, 300)]);
  if (r.length) { await dropMedia(env, id); await log(env, id, 'render_failed', why); }
}

// ── video streaming (supports Range) ──
export async function video(env, request, id) {
  const row = await one(env, id);
  if (!row?.video_sha) return new Response('Not found', { status: 404 });
  const size = row.video_size; let a = 0, b = size - 1;
  const r = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('Range') || '');
  if (r) { a = Number(r[1]); if (r[2]) b = Math.min(Number(r[2]), b); if (a > b) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } }); }
  let n = Math.floor(a / CHUNK);
  const stream = new ReadableStream({
    async pull(c) {
      const [m] = await sql(env, 'SELECT data FROM marketing_media WHERE post_id = $1 AND version = $2 AND n = $3', [id, row.version, n]);
      if (!m) return c.error(new Error('media gone'));
      const raw = atob(m.data), bytes = new Uint8Array(raw.length); // plain loop: stays inside the Worker CPU limit
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      c.enqueue(bytes.subarray(Math.max(0, a - n * CHUNK), Math.min(bytes.length, b + 1 - n * CHUNK)));
      if (++n > Math.floor(b / CHUNK)) c.close();
    },
  });
  const { readable, writable } = new FixedLengthStream(b - a + 1);
  stream.pipeTo(writable).catch(() => {});
  return new Response(readable, { status: r ? 206 : 200, headers: { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', ...(r ? { 'Content-Range': `bytes ${a}-${b}/${size}` } : {}) } });
}
// Short-lived public link that Instagram downloads the video from.
export async function mediaSig(env, id, exp) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`mk:${id}:${exp}`)))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// ── GitHub Actions identity (OIDC): no stored secret; only our workflow on main is accepted ──
const REPO = 'VAgent961/VAgent';
export async function isRenderer(request) {
  try {
    const [h, p, s] = (request.headers.get('Authorization') || '').replace(/^Bearer /, '').split('.');
    const dec = (x) => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const head = JSON.parse(new TextDecoder().decode(dec(h))), c = JSON.parse(new TextDecoder().decode(dec(p))), now = Date.now() / 1000;
    if (head.alg !== 'RS256' || c.iss !== 'https://token.actions.githubusercontent.com' || c.aud !== 'vagent-marketing' || c.exp < now || c.nbf > now + 60
      || c.repository !== REPO || c.ref !== 'refs/heads/main' || c.job_workflow_ref !== `${REPO}/.github/workflows/marketing-render.yml@refs/heads/main`) return false;
    const { keys } = await (await fetch('https://token.actions.githubusercontent.com/.well-known/jwks')).json();
    const jwk = keys.find((k) => k.kid === head.kid); if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, dec(s), new TextEncoder().encode(h + '.' + p));
  } catch { return false; }
}
