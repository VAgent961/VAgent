// Publisher: one approved post -> Instagram and/or TikTok. Each platform keeps its own state in marketing_posts.pub:
// {instagram|tiktok: {state: starting|processing|publishing|published|failed|dry_run, ref, id, error, at}}
// A platform that is not switched live is only simulated. An unclear result is failed, never retried by itself.
import { sql, encrypt, decrypt } from './_lib.js';
import { setting, setSetting, log, digest, dropMedia, mediaSig, SITE } from './_marketing.js';
import * as tiktok from './_tiktok.js';

export const PLATFORMS = ['instagram', 'tiktok'];
export const NAMES = { instagram: 'Instagram', tiktok: 'TikTok' };
const GRAPH = 'https://graph.instagram.com/v23.0';
const LIVE_KEY = { instagram: 'live', tiktok: 'live_tiktok' }, TOKEN_KEY = { instagram: 'ig_token', tiktok: 'tt_token' };

export const connected = async (env) => Object.fromEntries(await Promise.all(PLATFORMS.map(async (p) => [p, !!(await setting(env, TOKEN_KEY[p]))])));
export const liveFlags = async (env) => Object.fromEntries(await Promise.all(PLATFORMS.map(async (p) => [p, (await setting(env, LIVE_KEY[p])) === 'true' && !!(await setting(env, TOKEN_KEY[p]))])));
export const setLive = (env, platform, on) => setSetting(env, LIVE_KEY[platform], on ? 'true' : 'false');
// New posts go to every connected platform; before anything is connected, both are simulated.
export const defaultTargets = (conn) => { const t = PLATFORMS.filter((p) => conn[p]); return t.length ? t : [...PLATFORMS]; };

// The same wording on both, shaped to each platform. The "Comment KEYWORD" line is never cut.
export function captionFor(post, platform) {
  const tags = post.hashtags.slice(0, platform === 'tiktok' ? 5 : 30).join(' ');
  const parts = post.caption.split('\n\n').map((x) => x.trim()).filter(Boolean);
  const join = (p) => [p.join(platform === 'tiktok' ? '\n' : '\n\n'), tags].filter(Boolean).join(platform === 'tiktok' ? '\n' : '\n\n');
  const keep = (x) => post.keyword && x.toLowerCase().includes('comment') && x.toUpperCase().includes(post.keyword);
  const limit = 2200;
  while (join(parts).length > limit) {
    const i = parts.findLastIndex((x, n) => n > 0 && !keep(x));
    if (i < 0) break;
    parts.splice(i, 1);
  }
  return join(parts).slice(0, limit);
}

const videoUrl = async (env, id) => { const exp = Math.floor(Date.now() / 1000) + 3600; return `${SITE}/hook/marketing-media?id=${id}&exp=${exp}&sig=${await mediaSig(env, id, exp)}`; };
const put = (env, id, platform, state) => sql(env, 'UPDATE marketing_posts SET pub = jsonb_set(pub, ARRAY[$2::text], $3::jsonb), updated_at = now() WHERE id = $1', [id, platform, JSON.stringify({ ...state, at: new Date().toISOString() })]);
const failOn = async (env, id, platform, why) => { await put(env, id, platform, { state: 'failed', error: String(why).slice(0, 250) }); await log(env, id, `${platform}_publish_failed`, why); };
const doneOn = async (env, id, platform, mediaId) => { await put(env, id, platform, { state: 'published', id: String(mediaId) }); if (platform === 'instagram') await sql(env, 'UPDATE marketing_posts SET ig_media_id = $2 WHERE id = $1', [id, String(mediaId)]); await log(env, id, `${platform}_published`, mediaId); };

// ── Instagram ──
async function graph(token, path, params, method = 'GET') {
  const q = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${GRAPH}/${path}${method === 'GET' ? '?' + q : ''}`, method === 'GET' ? {} : { method, body: q });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.message || 'Instagram error ' + r.status);
  return j;
}
export async function connectInstagram(env, token, who) {
  const me = await graph(token, 'me', { fields: 'user_id,username' });
  await setSetting(env, 'ig_token', await encrypt(env, token));
  await setSetting(env, 'ig_user', JSON.stringify({ id: String(me.user_id || me.id), name: me.username }));
  await setSetting(env, 'ig_refreshed', new Date().toISOString());
  await log(env, '-', 'instagram_connected', who);
}
async function igToken(env) {
  let access = await decrypt(env, await setting(env, 'ig_token'));
  if (Date.now() - Date.parse(await setting(env, 'ig_refreshed')) > 7 * 864e5) {
    try {
      const j = await (await fetch('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' + encodeURIComponent(access))).json();
      if (j.access_token) { access = j.access_token; await setSetting(env, 'ig_token', await encrypt(env, access)); await setSetting(env, 'ig_refreshed', new Date().toISOString()); }
    } catch { await log(env, '-', 'token_refresh_failed'); }
  }
  return access;
}
const igUser = async (env) => JSON.parse(await setting(env, 'ig_user'));

const adapters = {
  instagram: {
    // creates the Reels container; nothing is public until publish below
    async start(env, row) {
      const c = await graph(await igToken(env), (await igUser(env)).id + '/media', { media_type: 'REELS', video_url: await videoUrl(env, row.id), caption: captionFor(row.post, 'instagram') }, 'POST');
      await put(env, row.id, 'instagram', { state: 'processing', ref: c.id }); await log(env, row.id, 'container_created', c.id);
    },
    async poll(env, row, s, old) {
      const access = await igToken(env);
      const { status_code: code } = await graph(access, s.ref, { fields: 'status_code' });
      if (code === 'ERROR' || code === 'EXPIRED') return failOn(env, row.id, 'instagram', 'Instagram container ' + code);
      if (code === 'PUBLISHED') return doneOn(env, row.id, 'instagram', s.ref);
      if (code !== 'FINISHED') return old ? failOn(env, row.id, 'instagram', 'Instagram processing timed out') : null;
      // claim before publishing, so it happens exactly once
      const claim = await sql(env, "UPDATE marketing_posts SET publish_started_at = now(), pub = jsonb_set(pub, '{instagram,state}', '\"publishing\"') WHERE id = $1 AND status = 'publishing' AND pub->'instagram'->>'state' = 'processing' RETURNING id", [row.id]);
      if (!claim.length) return null;
      try { const m = await graph(access, (await igUser(env)).id + '/media_publish', { creation_id: s.ref }, 'POST'); await doneOn(env, row.id, 'instagram', m.id); }
      catch (e) { await failOn(env, row.id, 'instagram', 'Unclear result, check Instagram before retrying: ' + e.message); }
    },
  },
  tiktok: {
    async start(env, row) {
      await sql(env, 'UPDATE marketing_posts SET publish_started_at = now() WHERE id = $1', [row.id]);
      const ref = await tiktok.directPost(env, row, captionFor(row.post, 'tiktok'), await videoUrl(env, row.id));
      await put(env, row.id, 'tiktok', { state: 'processing', ref }); await log(env, row.id, 'tiktok_upload_started', ref);
    },
    async poll(env, row, s, old) {
      const r = await tiktok.status(env, s.ref);
      if (r.failed) return failOn(env, row.id, 'tiktok', r.failed);
      if (r.done) return doneOn(env, row.id, 'tiktok', r.id);
      if (old) return failOn(env, row.id, 'tiktok', 'TikTok processing timed out: check TikTok before retrying');
      return null;
    },
  },
};

const targetsOf = (row) => row.targets || ['instagram']; // posts approved before TikTok existed were approved for Instagram
async function simulate(env, row, platform) {
  const o = platform === 'tiktok' ? await tiktok.options(env) : null;
  const how = o ? ` (${o.source === 'file' ? 'file upload' : 'pull from URL'}, privacy ${o.privacy || 'not chosen'})` : '';
  await put(env, row.id, platform, { state: 'dry_run' });
  await log(env, row.id, `${platform}_dry_run`, `would publish to ${NAMES[platform]}${how}: ${captionFor(row.post, platform)}`);
}

// Once every target has a final state the post is closed. Published (video deleted) means every live target succeeded.
async function settle(env, id) {
  const [row] = await sql(env, "SELECT * FROM marketing_posts WHERE id = $1 AND status = 'publishing'", [id]);
  if (!row) return null;
  const states = targetsOf(row).map((p) => [p, row.pub[p]?.state]);
  if (!states.every(([, s]) => ['published', 'failed', 'dry_run'].includes(s))) return null;
  const failed = states.filter(([, s]) => s === 'failed');
  if (failed.length) {
    await sql(env, "UPDATE marketing_posts SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [id, failed.map(([p]) => `${NAMES[p]}: ${row.pub[p].error}`).join(' | ').slice(0, 300)]);
    return 'failed';
  }
  await sql(env, "UPDATE marketing_posts SET status = 'published', video_sha = NULL, error = NULL, updated_at = now() WHERE id = $1", [id]);
  await dropMedia(env, id); await log(env, id, 'published', states.map((x) => x.join(':')).join(' '));
  return 'published';
}

// Called every few minutes by n8n.
export async function tick(env) {
  const out = [], live = await liveFlags(env), isLive = (row) => targetsOf(row).some((p) => live[p]);
  // 1) in flight: poll each platform
  for (const row of await sql(env, "SELECT * FROM marketing_posts WHERE status = 'publishing'")) {
    for (const p of targetsOf(row)) {
      const s = row.pub[p], age = Date.now() - Date.parse(s?.at || row.updated_at);
      if (s?.state === 'processing') {
        try { await adapters[p].poll(env, row, s, age > 36e5); } catch (e) { if (age > 36e5) await failOn(env, row.id, p, e.message); }
      } else if ((!s || ['starting', 'publishing'].includes(s.state)) && age > 6e5) await failOn(env, row.id, p, `Unclear result: check ${NAMES[p]} before retrying`);
    }
    const end = await settle(env, row.id); if (end) out.push({ id: row.id, result: end });
  }
  // 2) a live slot that passed more than 6 hours ago is not published late: back to review
  for (const row of await sql(env, "SELECT id, targets FROM marketing_posts WHERE status = 'scheduled' AND slot < now() - interval '6 hours'")) {
    if (!isLive(row)) continue;
    if ((await sql(env, "UPDATE marketing_posts SET status = 'review', slot = NULL, approved_hash = NULL, dry_run_at = NULL, error = 'Slot missed: approve again', updated_at = now() WHERE id = $1 AND status = 'scheduled' RETURNING id", [row.id])).length) await log(env, row.id, 'slot_missed');
  }
  // 3) due posts
  for (const due of await sql(env, "SELECT * FROM marketing_posts WHERE status = 'scheduled' AND slot <= now()")) {
    if (!isLive(due)) { // everything simulated: log it once, keep the post and its video
      const [row] = await sql(env, 'UPDATE marketing_posts SET dry_run_at = now() WHERE id = $1 AND dry_run_at IS NULL RETURNING *', [due.id]);
      if (!row) continue;
      const ok = row.approved_hash === await digest(row);
      if (ok) for (const p of targetsOf(row)) await simulate(env, row, p); else await log(env, row.id, 'blocked', 'approval does not match');
      out.push({ id: row.id, result: ok ? 'dry_run' : 'blocked' }); continue;
    }
    const [row] = await sql(env, "UPDATE marketing_posts SET status = 'publishing', updated_at = now() WHERE id = $1 AND status = 'scheduled' RETURNING *", [due.id]);
    if (!row) continue;
    const ok = row.approved_hash === await digest(row);
    for (const p of targetsOf(row)) {
      if (row.pub[p]?.state === 'published') continue;
      if (!ok) await failOn(env, row.id, p, 'Approval does not match the post');
      else if (!live[p]) await simulate(env, row, p);
      else {
        await put(env, row.id, p, { state: 'starting' });
        try { await adapters[p].start(env, row); } catch (e) { await failOn(env, row.id, p, e.message); }
      }
    }
    out.push({ id: row.id, result: (await settle(env, row.id)) || 'publishing' });
  }
  return { live, posts: out };
}
