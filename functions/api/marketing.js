import { sql, json, bad, body } from '../_lib.js';
import * as mk from '../_marketing.js';
import * as pub from '../_publish.js';
import * as ig from '../_instagram.js';

// Owners and the marketing account (middleware sets data.owner / data.role). GET list or ?video=<id>; POST an action.
const allowed = (data) => data.role === 'owner' || data.role === 'marketing';
const parse = async (env, k) => JSON.parse((await mk.setting(env, k)) || 'null');

export async function onRequestGet({ request, env, data }) {
  if (!allowed(data)) return bad('Not allowed', 403);
  await mk.schema(env);
  const q = new URL(request.url).searchParams, id = q.get('video');
  if (id) return mk.video(env, request, id);
  const posts = await sql(env, `SELECT id, post, version, status, slot, approved_by, dry_run_at, pub, error, attempts, video_sha IS NOT NULL AS has_video FROM marketing_posts
    ORDER BY array_position(ARRAY['review','failed','publishing','scheduled','rendering','published','declined'], status), slot, created_at, id`);
  for (const p of posts) p.caption = pub.captionFor(p.post);
  const account = await ig.user(env);
  return json({ posts, role: data.role, me: data.owner, dryRun: await pub.dryRun(env), lastTick: await mk.setting(env, 'last_tick'),
    instagram: { connected: await pub.connected(env), live: await pub.isLive(env), name: account?.name || null, type: account?.type || null, expires: await mk.setting(env, 'ig_expires'), refreshed: await mk.setting(env, 'ig_refreshed'), error: await parse(env, 'ig_error') } });
}

export async function onRequestPost({ request, env, data }) {
  if (!allowed(data)) return bad('Not allowed', 403);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return bad('Not allowed', 403);
  await mk.schema(env);
  const b = await body(request), who = String(data.owner || 'owner').slice(0, 120), id = String(b.id || '');
  let err = '', notice;
  try {
    if (b.action === 'approve') { err = await mk.approve(env, id, b.version, who); if (!err) notice = 'Approved. The post is now in the Approved tab.'; }
    else if (b.action === 'decline') err = await mk.decline(env, id, who);
    else if (b.action === 'edit') err = await mk.edit(env, id, b.version, b.post, who);
    else if (b.action === 'retry') err = await mk.retry(env, id, b.version, who);
    else if (b.action === 'reschedule') { err = await mk.reschedule(env, id, b.version, String(b.at || ''), who); if (!err) notice = 'Time changed.'; }
    else if (b.action === 'publish_now') { const r = await pub.publishNow(env, id, b.version, b.confirm, who); if (r.error) err = r.error; else notice = r.notice; }
    else if (b.action === 'republish') err = await mk.republish(env, id, b.version, who);
    else if (b.action === 'connect') {
      try { await pub.connectInstagram(env, String(b.token || '').trim(), String(b.secret || '').trim(), who); }
      catch (e) { await ig.noteError(env, e.message); throw e; }
    } else if (b.action === 'check') {
      const r = await ig.check(env); if (r.ok) notice = r.message; else err = r.message;
    } else if (b.action === 'video_link') { // a signed link for the browser to try, exactly like the one Instagram receives
      const [row] = await sql(env, 'SELECT id FROM marketing_posts WHERE video_sha IS NOT NULL LIMIT 1');
      if (!row) err = 'No stored video to test.';
      else { const exp = Math.floor(Date.now() / 1000) + 300; return json({ ok: true, url: `/hook/marketing-media?id=${row.id}&exp=${exp}&sig=${await mk.mediaSig(env, row.id, exp)}` }); }
    }
    else if (b.action === 'dry_run') err = await pub.setDryRun(env, b.on !== false, b.confirm, who);
    else err = 'Unknown action';
  } catch (e) { err = e.message; }
  return err ? bad(err) : json({ ok: true, notice });
}
