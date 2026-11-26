import { sql, json, bad, body } from '../_lib.js';
import * as mk from '../_marketing.js';

// Owner-only (middleware sets data.owner / data.role). GET list or ?video=<id>; POST an action.
export async function onRequestGet({ request, env, data }) {
  if (data.role !== 'owner') return bad('Owners only', 403);
  const id = new URL(request.url).searchParams.get('video');
  if (id) return mk.video(env, request, id);
  const posts = await sql(env, `SELECT id, post, version, status, slot, approved_by, dry_run_at, ig_media_id, error, video_sha IS NOT NULL AS has_video FROM marketing_posts
    ORDER BY array_position(ARRAY['review','failed','publishing','scheduled','rendering','published','declined'], status), slot, created_at, id`);
  const user = await mk.setting(env, 'ig_user');
  return json({ posts, live: (await mk.setting(env, 'live')) === 'true', instagram: user ? JSON.parse(user).name : null });
}
export async function onRequestPost({ request, env, data }) {
  if (data.role !== 'owner') return bad('Owners only', 403);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return bad('Not allowed', 403);
  const b = await body(request), who = String(data.owner?.e || data.owner?.email || data.owner || 'owner').slice(0, 120), id = String(b.id || '');
  let err = '';
  if (b.action === 'approve') err = await mk.approve(env, id, b.version, who);
  else if (b.action === 'decline') err = await mk.decline(env, id, who);
  else if (b.action === 'edit') err = await mk.edit(env, id, b.version, b.post, who);
  else if (b.action === 'connect') {
    try { await mk.connect(env, String(b.token || '').trim(), who); } catch (e) { err = 'Instagram did not accept the token: ' + e.message; }
  } else if (b.action === 'live') {
    if (b.on === true && !(await mk.setting(env, 'ig_token'))) err = 'Connect Instagram first.';
    else { await mk.setSetting(env, 'live', b.on === true ? 'true' : 'false'); await mk.log(env, '-', b.on === true ? 'live_on' : 'live_off', who); }
  } else err = 'Unknown action';
  return err ? bad(err) : json({ ok: true });
}
