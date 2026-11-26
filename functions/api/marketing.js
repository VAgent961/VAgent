import { sql, json, bad, body } from '../_lib.js';
import * as mk from '../_marketing.js';
import * as pub from '../_publish.js';
import * as tiktok from '../_tiktok.js';
import * as ig from '../_instagram.js';

// Owners and the marketing account (middleware sets data.owner / data.role). GET list, ?video=<id> or ?tiktok=authorize; POST an action.
const allowed = (data) => data.role === 'owner' || data.role === 'marketing';
const parse = async (env, k) => JSON.parse((await mk.setting(env, k)) || 'null');

export async function onRequestGet({ request, env, data }) {
  if (!allowed(data)) return bad('Not allowed', 403);
  await mk.schema(env);
  const q = new URL(request.url).searchParams, id = q.get('video');
  if (id) return mk.video(env, request, id);
  if (q.get('tiktok') === 'authorize') {
    const url = await tiktok.authorizeUrl(env);
    return url ? Response.redirect(url, 302) : bad('Save the TikTok app keys first.');
  }
  const posts = await sql(env, `SELECT id, post, version, status, slot, approved_by, dry_run_at, targets, pub, error, attempts, video_sha IS NOT NULL AS has_video FROM marketing_posts
    ORDER BY array_position(ARRAY['review','failed','publishing','scheduled','rendering','published','declined'], status), slot, created_at, id`);
  const conn = await pub.connected(env), live = await pub.liveFlags(env), defaults = pub.defaultTargets(conn);
  for (const p of posts) {
    p.effective = p.targets || (['review', 'rendering', 'failed'].includes(p.status) ? defaults : ['instagram']);
    p.captions = Object.fromEntries(pub.PLATFORMS.map((n) => [n, pub.captionFor(p.post, n)]));
  }
  const account = await ig.user(env);
  return json({ posts, role: data.role, me: data.owner, dryRun: await pub.dryRun(env), lastTick: await mk.setting(env, 'last_tick'), platforms: {
    instagram: { connected: conn.instagram, live: live.instagram, name: account?.name || null, type: account?.type || null, expires: await mk.setting(env, 'ig_expires'), refreshed: await mk.setting(env, 'ig_refreshed'), error: await parse(env, 'ig_error') },
    tiktok: { connected: conn.tiktok, live: live.tiktok, name: (await parse(env, 'tt_user'))?.name || null, app: !!(await tiktok.app(env)), options: await tiktok.options(env),
      privacyChoices: (await parse(env, 'tt_creator'))?.privacy_level_options || [], redirect: tiktok.redirectUri(), verify: (await parse(env, 'tt_verify'))?.file || null } } });
}

export async function onRequestPost({ request, env, data }) {
  if (!allowed(data)) return bad('Not allowed', 403);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return bad('Not allowed', 403);
  await mk.schema(env);
  const b = await body(request), who = String(data.owner || 'owner').slice(0, 120), id = String(b.id || '');
  const platform = pub.PLATFORMS.includes(b.platform) ? b.platform : 'instagram';
  let err = '', notice;
  try {
    if (b.action === 'approve') { err = await mk.approve(env, id, b.version, who, pub.defaultTargets(await pub.connected(env))); if (!err) notice = 'Approved. The post is now in the Approved tab.'; }
    else if (b.action === 'decline') err = await mk.decline(env, id, who);
    else if (b.action === 'edit') err = await mk.edit(env, id, b.version, b.post, who);
    else if (b.action === 'retry') err = await mk.retry(env, id, b.version, who);
    else if (b.action === 'targets') err = await mk.setTargets(env, id, b.version, b.targets, who);
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
    else if (b.action === 'tiktok_app') err = await tiktok.saveApp(env, String(b.key || '').trim(), String(b.secret || '').trim(), who);
    else if (b.action === 'tiktok_creator') await tiktok.creatorInfo(env);
    else if (b.action === 'tiktok_options') {
      const o = b.options || {}, choices = (await parse(env, 'tt_creator'))?.privacy_level_options || [];
      if (o.privacy && !choices.includes(o.privacy)) err = 'That privacy level is not offered for this account.';
      else await mk.setSetting(env, 'tt_options', JSON.stringify({ privacy: o.privacy || '', comment: !!o.comment, duet: !!o.duet, stitch: !!o.stitch, source: o.source === 'file' ? 'file' : 'url' }));
    } else if (b.action === 'tiktok_verify') {
      // URL-prefix verification file TikTok asks for, served at https://vagent.online/hook/<file>
      const file = String(b.file || '').trim(), content = String(b.content || '').trim();
      if (!/^tiktok[A-Za-z0-9_-]{4,80}\.txt$/.test(file) || !/^tiktok-developers-site-verification=[A-Za-z0-9_-]{4,120}$/.test(content)) err = 'Paste the file name and its one line exactly as TikTok shows them.';
      else await mk.setSetting(env, 'tt_verify', JSON.stringify({ file, content }));
    } else err = 'Unknown action';
  } catch (e) { err = e.message; }
  return err ? bad(err) : json({ ok: true, notice });
}
