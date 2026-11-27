// Publisher: one approved post -> Instagram (@v_agent961). Its state is kept in marketing_posts.pub:
// {instagram: {state: starting|processing|publishing|published|failed|dry_run, ref, id, error, at}}
// One Dry Run switch (on unless an owner turned it off): while on, nothing is published and posts are only simulated. An unclear result is failed, never retried by itself.
import { sql } from './_lib.js';
import { setting, setSetting, log, digest, dropMedia, mediaSig, SITE } from './_marketing.js';
import * as ig from './_instagram.js';

export const connected = async (env) => !!(await setting(env, 'ig_token'));
export const dryRun = async (env) => (await setting(env, 'dry_run')) !== 'off';
export const isLive = async (env) => !(await dryRun(env)) && (await connected(env));
// Turning Dry Run off needs the owner's explicit confirmation and a connected Instagram account.
export async function setDryRun(env, on, confirm, who) {
  if (!on) {
    if (confirm !== 'PUBLISH') return 'Confirm that approved posts will really be published.';
    if (!(await connected(env))) return 'Connect Instagram first. Dry Run stays on.';
  }
  await setSetting(env, 'dry_run', on ? 'on' : 'off'); await log(env, '-', on ? 'dry_run_on' : 'dry_run_off', who); return '';
}
export async function connectInstagram(env, token, secret, who) {
  await setDryRun(env, true, '', who); // a new account never goes live by itself
  await ig.connect(env, token, secret, who);
}
// The "Comment KEYWORD" line is never cut.
export function captionFor(post) {
  const tags = post.hashtags.slice(0, 30).join(' ');
  const parts = post.caption.split('\n\n').map((x) => x.trim()).filter(Boolean);
  const join = (p) => [p.join('\n\n'), tags].filter(Boolean).join('\n\n');
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
const put = (env, id, state) => sql(env, 'UPDATE marketing_posts SET pub = jsonb_set(pub, ARRAY[$2::text], $3::jsonb), updated_at = now() WHERE id = $1', [id, 'instagram', JSON.stringify({ ...state, at: new Date().toISOString() })]);
const failOn = async (env, id, why) => { await ig.noteError(env, why); await put(env, id, { state: 'failed', error: String(why).slice(0, 250) }); await log(env, id, 'instagram_publish_failed', why); };
const doneOn = async (env, id, mediaId) => { await put(env, id, { state: 'published', id: String(mediaId) }); await sql(env, 'UPDATE marketing_posts SET ig_media_id = $2 WHERE id = $1', [id, String(mediaId)]); await log(env, id, 'instagram_published', mediaId); };

// Creates the Reels container; nothing is public until publish in poll().
async function start(env, row) {
  const url = await videoUrl(env, row.id);
  if (!url.startsWith('https://') || !row.video_sha) throw new Error('There is no public HTTPS video for this post');
  const c = await ig.graph(await ig.token(env), (await ig.user(env)).id + '/media', { media_type: 'REELS', video_url: url, caption: captionFor(row.post) }, 'POST');
  await put(env, row.id, { state: 'processing', ref: c.id }); await log(env, row.id, 'container_created', c.id);
}
async function poll(env, row, s, old) {
  const access = await ig.token(env);
  const { status_code: code, status } = await ig.graph(access, s.ref, { fields: 'status_code,status' });
  if (code === 'ERROR' || code === 'EXPIRED') return failOn(env, row.id, `Instagram could not process the video (${code}). Check that the public video link works. ${status || ''}`);
  if (code === 'PUBLISHED') return doneOn(env, row.id, s.ref);
  if (code !== 'FINISHED') return old ? failOn(env, row.id, 'Instagram processing timed out') : null;
  if (!(await isLive(env))) return failOn(env, row.id, 'Dry Run was switched on (or Instagram disconnected) before publishing. Nothing was posted');
  // claim before publishing, so it happens exactly once
  const claim = await sql(env, "UPDATE marketing_posts SET publish_started_at = now(), pub = jsonb_set(pub, '{instagram,state}', '\"publishing\"') WHERE id = $1 AND status = 'publishing' AND pub->'instagram'->>'state' = 'processing' RETURNING id", [row.id]);
  if (!claim.length) return null;
  try { const m = await ig.graph(access, (await ig.user(env)).id + '/media_publish', { creation_id: s.ref }, 'POST'); await doneOn(env, row.id, m.id); }
  catch (e) { await failOn(env, row.id, 'Unclear result, check Instagram before retrying: ' + e.message); }
}

async function simulate(env, row) {
  await put(env, row.id, { state: 'dry_run' });
  await log(env, row.id, 'instagram_dry_run', `would publish to Instagram: ${captionFor(row.post)}`);
}

// Once the state is final the post is closed. Published (video deleted) means it really went out.
async function settle(env, id) {
  const [row] = await sql(env, "SELECT * FROM marketing_posts WHERE id = $1 AND status = 'publishing'", [id]);
  if (!row) return null;
  const s = row.pub.instagram;
  if (!['published', 'failed', 'dry_run'].includes(s?.state)) return null;
  if (s.state === 'failed') {
    await sql(env, "UPDATE marketing_posts SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [id, `Instagram: ${s.error}`.slice(0, 300)]);
    return 'failed';
  }
  await sql(env, "UPDATE marketing_posts SET status = 'published', video_sha = NULL, error = NULL, updated_at = now() WHERE id = $1", [id]);
  await dropMedia(env, id); await log(env, id, 'published', `instagram:${s.state}`);
  return 'published';
}

// A claimed post (status 'publishing'): publish it, or simulate if Instagram is not live.
async function launch(env, row, live) {
  if (row.pub.instagram?.state !== 'published') {
    if (row.approved_hash !== await digest(row)) await failOn(env, row.id, 'Approval does not match the post');
    else if (!live) await simulate(env, row);
    else {
      await put(env, row.id, { state: 'starting' });
      try { await start(env, row); } catch (e) { await failOn(env, row.id, e.message); }
    }
  }
  return (await settle(env, row.id)) || 'publishing';
}
// Owner's "Publish now" on an approved post. When not live it only simulates and leaves status and time alone.
export async function publishNow(env, id, version, confirm, who) {
  const gone = { error: 'This post changed. Reload first.' };
  const [row] = await sql(env, "SELECT * FROM marketing_posts WHERE id = $1 AND version = $2 AND status = 'scheduled'", [id, version]);
  if (!row) return gone;
  const live = await isLive(env);
  if (!live || row.pub.instagram?.state === 'published') {
    if (row.approved_hash !== await digest(row)) return { error: 'Approval does not match the post. Edit it and approve again.' };
    if (row.pub.instagram?.state !== 'published') await simulate(env, row);
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
  const out = [], live = await isLive(env);
  // 1) in flight: poll Instagram
  for (const row of await sql(env, "SELECT * FROM marketing_posts WHERE status = 'publishing'")) {
    const s = row.pub.instagram, age = Date.now() - Date.parse(s?.at || row.updated_at);
    if (s?.state === 'processing') {
      try { await poll(env, row, s, age > 36e5); } catch (e) { if (age > 36e5) await failOn(env, row.id, e.message); }
    } else if ((!s || ['starting', 'publishing'].includes(s.state)) && age > 6e5) await failOn(env, row.id, 'Unclear result: check Instagram before retrying');
    const end = await settle(env, row.id); if (end) out.push({ id: row.id, result: end });
  }
  // 2) a live slot that passed more than 6 hours ago is not published late: back to review
  if (live) for (const row of await sql(env, "SELECT id FROM marketing_posts WHERE status = 'scheduled' AND slot < now() - interval '6 hours'")) {
    if ((await sql(env, "UPDATE marketing_posts SET status = 'review', slot = NULL, approved_hash = NULL, dry_run_at = NULL, error = 'Slot missed: approve again', updated_at = now() WHERE id = $1 AND status = 'scheduled' RETURNING id", [row.id])).length) await log(env, row.id, 'slot_missed');
  }
  // 3) due posts
  for (const due of await sql(env, "SELECT * FROM marketing_posts WHERE status = 'scheduled' AND slot <= now()")) {
    if (!live) { // simulated: log it once, keep the post and its video
      const [row] = await sql(env, 'UPDATE marketing_posts SET dry_run_at = now() WHERE id = $1 AND dry_run_at IS NULL RETURNING *', [due.id]);
      if (!row) continue;
      const ok = row.approved_hash === await digest(row);
      if (ok) await simulate(env, row); else await log(env, row.id, 'blocked', 'approval does not match');
      out.push({ id: row.id, result: ok ? 'dry_run' : 'blocked' }); continue;
    }
    const [row] = await sql(env, "UPDATE marketing_posts SET status = 'publishing', updated_at = now() WHERE id = $1 AND status = 'scheduled' RETURNING *", [due.id]);
    if (!row) continue;
    out.push({ id: row.id, result: await launch(env, row, live) });
  }
  return { live, posts: out };
}
