// Marketing queue: rendering -> review -> scheduled -> publishing -> published (or declined / failed).
// Video lives in marketing_media (base64 chunks) and is deleted on publish, decline and re-render.
import { sql, encrypt, decrypt } from './_lib.js';

export const CHUNK = 400000;
export const SHOTS = ['hook', 'phone', 'flow', 'browser', 'list', 'approve', 'alert', 'cta'];
const SITE = 'https://vagent.online', GRAPH = 'https://graph.instagram.com/v23.0';
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
  if (!str(p.caption, 1800) || !Array.isArray(p.hashtags) || p.hashtags.length > 30 || !p.hashtags.every((h) => /^#[\p{L}\p{N}_]{1,50}$/u.test(h))) return 'Check the caption and hashtags';
  const hit = JSON.stringify({ s: p.scenes, c: p.caption, h: p.hashtags }).match(BANNED);
  return hit ? `Content rule: "${hit[0]}" is not allowed in a post` : '';
}
const clean = (p) => ({ id: p.id, scenes: p.scenes.map((s) => ({ say: s.say, title: s.title, mood: s.mood === 'think' ? 'think' : 'talk', ...(s.chat ? { chat: [s.chat[0], s.chat[1]] } : {}), ...(s.end ? { end: true } : {}), ...(s.shot ? { shot: s.shot } : {}), ...(s.items?.length ? { items: [...s.items] } : {}) })), caption: p.caption, hashtags: p.hashtags });

export async function digest(row) {
  const raw = new TextEncoder().encode(JSON.stringify([row.id, row.version, row.post, row.video_sha]));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const log = (env, id, event, detail = '') => sql(env, 'INSERT INTO marketing_events (post_id, event, detail) VALUES ($1, $2, $3)', [id, event, String(detail).slice(0, 300)]);
const dropMedia = (env, id) => sql(env, 'DELETE FROM marketing_media WHERE post_id = $1', [id]);
const one = async (env, id) => (await sql(env, 'SELECT * FROM marketing_posts WHERE id = $1', [id]))[0];

export async function setting(env, k) { return (await sql(env, 'SELECT v FROM marketing_settings WHERE k = $1', [k]))[0]?.v ?? null; }
export const setSetting = (env, k, v) => sql(env, 'INSERT INTO marketing_settings (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = $2', [k, v]);

// ── owner actions ──
export async function approve(env, id, version, who) {
  const row = await one(env, id);
  if (!row || row.status !== 'review' || Number(row.version) !== Number(version)) return 'This post changed. Reload and review it again.';
  const err = lint(row.post); if (err) return err;
  // next free Tue/Thu/Sat 19:00 Beirut, computed by Postgres so daylight saving is right
  const done = await sql(env, `UPDATE marketing_posts SET status = 'scheduled', approved_hash = $3, approved_by = $4, error = NULL, dry_run_at = NULL, updated_at = now(), slot = (
      SELECT s FROM (SELECT (d::date + time '19:00') AT TIME ZONE 'Asia/Beirut' AS s FROM generate_series((now() AT TIME ZONE 'Asia/Beirut')::date::timestamp, (now() AT TIME ZONE 'Asia/Beirut')::date::timestamp + interval '365 days', interval '1 day') d
        WHERE extract(isodow FROM d) IN (2, 4, 6)) c
      WHERE s > now() AND NOT EXISTS (SELECT 1 FROM marketing_posts p WHERE p.slot = s AND p.status IN ('scheduled', 'publishing', 'published')) ORDER BY s LIMIT 1)
    WHERE id = $1 AND version = $2 AND status = 'review' RETURNING slot`, [id, row.version, await digest(row), who]);
  if (!done.length) return 'This post changed. Reload and review it again.';
  await log(env, id, 'approved', who); return '';
}
export async function decline(env, id, who) {
  const r = await sql(env, `UPDATE marketing_posts SET status = 'declined', slot = NULL, approved_hash = NULL, video_sha = NULL, updated_at = now() WHERE id = $1 AND status IN ('rendering', 'review', 'scheduled', 'failed') RETURNING id`, [id]);
  if (!r.length) return 'This post cannot be declined now.';
  await dropMedia(env, id); await log(env, id, 'declined', who); return '';
}
// Any edit clears the approval. Changing a scene renders a new video; caption/hashtags only go back to review.
export async function edit(env, id, version, input, who) {
  const row = await one(env, id);
  if (!row || !['rendering', 'review', 'scheduled', 'failed'].includes(row.status) || Number(row.version) !== Number(version)) return 'This post changed. Reload first.';
  const err = lint({ ...input, id }); if (err) return err;
  const post = clean({ ...input, id });
  const redo = !row.video_sha || row.status === 'failed' || JSON.stringify(post.scenes) !== JSON.stringify(clean(row.post).scenes);
  if (!redo && JSON.stringify(post) === JSON.stringify(clean(row.post))) return '';
  const r = await sql(env, `UPDATE marketing_posts SET post = $3, version = version + 1, status = $4, slot = NULL, approved_hash = NULL, approved_by = NULL, dry_run_at = NULL, ig_container_id = NULL, publish_started_at = NULL, error = NULL, attempts = 0,
      video_sha = CASE WHEN $5 THEN NULL ELSE video_sha END, updated_at = now() WHERE id = $1 AND version = $2 AND status = $6 RETURNING version`,
  [id, row.version, JSON.stringify(post), redo ? 'rendering' : 'review', redo, row.status]);
  if (!r.length) return 'This post changed. Reload first.';
  if (redo) await dropMedia(env, id); else await sql(env, 'UPDATE marketing_media SET version = $2 WHERE post_id = $1', [id, r[0].version]);
  await log(env, id, 'edited', who); return '';
}

// ── renderer (GitHub Actions) ──
export async function seed(env, posts) {
  for (const p of posts) {
    const err = lint(p);
    if (err) { await log(env, String(p?.id), 'rejected_seed', err); continue; }
    await sql(env, 'INSERT INTO marketing_posts (id, post) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [p.id, JSON.stringify(clean(p))]);
  }
}
export const queue = (env) => sql(env, "SELECT id, version, post FROM marketing_posts WHERE status = 'rendering' ORDER BY created_at, id LIMIT 10");
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

// ── Instagram ──
async function graph(token, path, params, method = 'GET') {
  const q = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${GRAPH}/${path}${method === 'GET' ? '?' + q : ''}`, method === 'GET' ? {} : { method, body: q });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.message || 'Instagram error ' + r.status);
  return j;
}
export async function connect(env, token, who) {
  const me = await graph(token, 'me', { fields: 'user_id,username' });
  await setSetting(env, 'ig_token', await encrypt(env, token));
  await setSetting(env, 'ig_user', JSON.stringify({ id: String(me.user_id || me.id), name: me.username }));
  await setSetting(env, 'ig_refreshed', new Date().toISOString());
  await log(env, '-', 'instagram_connected', who);
}
const fail = async (env, id, why) => {
  await sql(env, "UPDATE marketing_posts SET status = 'failed', error = $2, updated_at = now() WHERE id = $1 AND status = 'publishing'", [id, String(why).slice(0, 300)]);
  await log(env, id, 'publish_failed', why);
};
async function published(env, id, mediaId) {
  await sql(env, "UPDATE marketing_posts SET status = 'published', ig_media_id = $2, video_sha = NULL, error = NULL, updated_at = now() WHERE id = $1 AND status = 'publishing'", [id, mediaId]);
  await dropMedia(env, id); await log(env, id, 'published', mediaId);
}

// Called every few minutes by n8n. Dry run unless an owner switched "live" on.
export async function tick(env) {
  const out = [];
  const token = await setting(env, 'ig_token'), live = (await setting(env, 'live')) === 'true' && !!token;
  if (!live) {
    const due = await sql(env, "UPDATE marketing_posts SET dry_run_at = now() WHERE status = 'scheduled' AND slot <= now() AND dry_run_at IS NULL RETURNING *");
    for (const row of due) {
      const ok = row.approved_hash === await digest(row);
      await log(env, row.id, ok ? 'dry_run' : 'blocked', ok ? 'would publish to Instagram' : 'approval does not match');
      out.push({ id: row.id, result: ok ? 'dry_run' : 'blocked' });
    }
    return { live, posts: out };
  }
  const ig = JSON.parse(await setting(env, 'ig_user'));
  let access = await decrypt(env, token);
  if (Date.now() - Date.parse(await setting(env, 'ig_refreshed')) > 7 * 864e5) {
    try {
      const r = await fetch('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' + encodeURIComponent(access));
      const j = await r.json();
      if (j.access_token) { access = j.access_token; await setSetting(env, 'ig_token', await encrypt(env, access)); await setSetting(env, 'ig_refreshed', new Date().toISOString()); }
    } catch { await log(env, '-', 'token_refresh_failed'); }
  }
  // 1) containers already created: poll until FINISHED, then publish exactly once
  for (const row of await sql(env, "SELECT *, updated_at < now() - interval '1 hour' AS old, updated_at < now() - interval '10 minutes' AS stuck FROM marketing_posts WHERE status = 'publishing'")) {
    if (row.publish_started_at) { if (row.stuck) await fail(env, row.id, 'Unclear result: check Instagram before retrying'); continue; }
    if (!row.ig_container_id) { if (row.stuck) await fail(env, row.id, 'Container was not created'); continue; }
    try {
      const { status_code: code } = await graph(access, row.ig_container_id, { fields: 'status_code' });
      out.push({ id: row.id, result: code });
      if (code === 'ERROR' || code === 'EXPIRED') await fail(env, row.id, 'Instagram container ' + code);
      else if (code === 'PUBLISHED') await published(env, row.id, row.ig_container_id);
      else if (code !== 'FINISHED') { if (row.old) await fail(env, row.id, 'Instagram processing timed out'); }
      else if ((await sql(env, "UPDATE marketing_posts SET publish_started_at = now(), updated_at = now() WHERE id = $1 AND status = 'publishing' AND publish_started_at IS NULL RETURNING id", [row.id])).length) {
        try { const m = await graph(access, ig.id + '/media_publish', { creation_id: row.ig_container_id }, 'POST'); await published(env, row.id, m.id); }
        catch (e) { await fail(env, row.id, 'Unclear result, check Instagram before retrying: ' + e.message); }
      }
    } catch (e) { if (row.old) await fail(env, row.id, e.message); }
  }
  // 2) a slot that passed more than 6 hours ago is not published late: back to review
  for (const m of await sql(env, "UPDATE marketing_posts SET status = 'review', slot = NULL, approved_hash = NULL, dry_run_at = NULL, error = 'Slot missed: approve again', updated_at = now() WHERE status = 'scheduled' AND slot < now() - interval '6 hours' RETURNING id")) await log(env, m.id, 'slot_missed');
  // 3) claim due posts and create the Reels container
  for (const row of await sql(env, "UPDATE marketing_posts SET status = 'publishing', updated_at = now() WHERE status = 'scheduled' AND slot <= now() RETURNING *")) {
    try {
      if (row.approved_hash !== await digest(row)) throw new Error('Approval does not match the post');
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const url = `${SITE}/hook/marketing-media?id=${row.id}&exp=${exp}&sig=${await mediaSig(env, row.id, exp)}`;
      const c = await graph(access, ig.id + '/media', { media_type: 'REELS', video_url: url, caption: row.post.caption + '\n\n' + row.post.hashtags.join(' ') }, 'POST');
      await sql(env, 'UPDATE marketing_posts SET ig_container_id = $2, updated_at = now() WHERE id = $1', [row.id, c.id]);
      await log(env, row.id, 'container_created', c.id); out.push({ id: row.id, result: 'container' });
    } catch (e) { await fail(env, row.id, e.message); }
  }
  return { live, posts: out };
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
