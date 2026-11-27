// Publisher: one approved post -> Instagram and/or TikTok. Each platform keeps its own state in marketing_posts.pub:
// {instagram|tiktok: {state: starting|processing|publishing|published|failed|dry_run, ref, id, error, at}}
// One Dry Run switch (on unless an owner turned it off): while on, nothing is published and posts are only simulated. An unclear result is failed, never retried by itself.
import { sql } from './_lib.js';
import { setting, setSetting, log, digest, dropMedia, mediaSig, SITE } from './_marketing.js';
import * as tiktok from './_tiktok.js';
import * as ig from './_instagram.js';

export const PLATFORMS = ['instagram', 'tiktok'];
export const NAMES = { instagram: 'Instagram', tiktok: 'TikTok' };
const TOKEN_KEY = { instagram: 'ig_token', tiktok: 'tt_token' };

export const connected = async (env) => Object.fromEntries(await Promise.all(PLATFORMS.map(async (p) => [p, !!(await setting(env, TOKEN_KEY[p]))])));
export const dryRun = async (env) => (await setting(env, 'dry_run')) !== 'off';
// Ready = could really publish. TikTok also needs the video.publish permission and a privacy level.
export async function readiness(env) {
  const c = await connected(env);
  return { instagram: c.instagram, tiktok: c.tiktok && (await tiktok.canPublish(env)) && !!(await tiktok.options(env)).privacy };
}
export async function liveFlags(env) {
  const off = !(await dryRun(env)), r = await readiness(env);
  return Object.fromEntries(PLATFORMS.map((p) => [p, off && r[p]]));
}
// Turning Dry Run off needs the owner's explicit confirmation and at least one platform that can publish.
export async function setDryRun(env, on, confirm, who) {
  if (!on) {
    if (confirm !== 'PUBLISH') return 'Confirm that approved posts will really be published.';
    if (!Object.values(await readiness(env)).some(Boolean)) return 'Connect Instagram (or TikTok) first. Dry Run stays on.';
  }
  await setSetting(env, 'dry_run', on ? 'on' : 'off'); await log(env, '-', on ? 'dry_run_on' : 'dry_run_off', who); return '';
}
export async function connectInstagram(env, token, secret, who) {
  await setDryRun(env, true, '', who); // a new account never goes live by itself
  await ig.connect(env, token, secret, who);
}
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
const failOn = async (env, id, platform, why) => { if (platform === 'instagram') await ig.noteError(env, why); await put(env, id, platform, { state: 'failed', error: String(why).slice(0, 250) }); await log(env, id, `${platform}_publish_failed`, why); };
const doneOn = async (env, id, platform, mediaId) => { await put(env, id, platform, { state: 'published', id: String(mediaId) }); if (platform === 'instagram') await sql(env, 'UPDATE marketing_posts SET ig_media_id = $2 WHERE id = $1', [id, String(mediaId)]); await log(env, id, `${platform}_published`, mediaId); };

// ── platform adapters ──
const adapters = {
  instagram: {
    // creates the Reels container; nothing is public until publish below
    async start(env, row) {
      const url = await videoUrl(env, row.id);
      if (!url.startsWith('https://') || !row.video_sha) throw new Error('There is no public HTTPS video for this post');
      const c = await ig.graph(await ig.token(env), (await ig.user(env)).id + '/media', { media_type: 'REELS', video_url: url, caption: captionFor(row.post, 'instagram') }, 'POST');
      await put(env, row.id, 'instagram', { state: 'processing', ref: c.id }); await log(env, row.id, 'container_created', c.id);
    },
    async poll(env, row, s, old) {
      const access = await ig.token(env);
      const { status_code: code, status } = await ig.graph(access, s.ref, { fields: 'status_code,status' });
      if (code === 'ERROR' || code === 'EXPIRED') return failOn(env, row.id, 'instagram', `Instagram could not process the video (${code}). Check that the public video link works. ${status || ''}`);
      if (code === 'PUBLISHED') return doneOn(env, row.id, 'instagram', s.ref);
      if (code !== 'FINISHED') return old ? failOn(env, row.id, 'instagram', 'Instagram processing timed out') : null;
      if (!(await liveFlags(env)).instagram) return failOn(env, row.id, 'instagram', 'Dry Run was switched on (or Instagram disconnected) before publishing. Nothing was posted');
      // claim before publishing, so it happens exactly once
      const claim = await sql(env, "UPDATE marketing_posts SET publish_started_at = now(), pub = jsonb_set(pub, '{instagram,state}', '\"publishing\"') WHERE id = $1 AND status = 'publishing' AND pub->'instagram'->>'state' = 'processing' RETURNING id", [row.id]);
      if (!claim.length) return null;
      try { const m = await ig.graph(access, (await ig.user(env)).id + '/media_publish', { creation_id: s.ref }, 'POST'); await doneOn(env, row.id, 'instagram', m.id); }
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

// A claimed post (status 'publishing'): start every live platform, simulate the rest.
async function launch(env, row, live) {
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
  return (await settle(env, row.id)) || 'publishing';
}
// Owner's "Publish now" on an approved post. With nothing live it only simulates and leaves status and time alone.
export async function publishNow(env, id, version, confirm, who) {
  const gone = { error: 'This post changed. Reload first.' };
  const [row] = await sql(env, "SELECT * FROM marketing_posts WHERE id = $1 AND version = $2 AND status = 'scheduled'", [id, version]);
  if (!row) return gone;
  const live = await liveFlags(env);
  if (!targetsOf(row).some((p) => live[p] && row.pub[p]?.state !== 'published')) {
    if (row.approved_hash !== await digest(row)) return { error: 'Approval does not match the post. Edit it and approve again.' };
    for (const p of targetsOf(row)) if (row.pub[p]?.state !== 'published') await simulate(env, row, p);
    return { notice: 'Dry run: nothing was posted. The post stays approved for its time.' };
  }
  if (confirm !== 'PUBLISH') return { error: 'Dry Run is off: confirm that this post will really be published.' };
  const [claimed] = await sql(env, "UPDATE marketing_posts SET status = 'publishing', slot = now(), updated_at = now() WHERE id = $1 AND version = $2 AND status = 'scheduled' RETURNING *", [id, version]);
  if (!claimed) return gone;
  await log(env, id, 'publish_now', who);
  const result = await launch(env, claimed, live);
  if (result === 'failed') return { error: 'Publishing failed: see the error on the post.' };
  return { notice: result === 'published' ? 'Published.' : 'Publishing started. It goes live once the video is processed, usually within 5 to 10 minutes.' };
}

// Called every few minutes by n8n.
export async function tick(env) {
  await setSetting(env, 'last_tick', new Date().toISOString());
  await ig.maintain(env);
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
    out.push({ id: row.id, result: await launch(env, row, live) });
  }
  return { live, posts: out };
}
