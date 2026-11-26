// TikTok Login Kit (OAuth) + Content Posting API (Direct Post). Official endpoints only, no paid services.
// App keys come from Cloudflare env TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET, or are saved (encrypted) on /marketing.
import { sql, encrypt, decrypt } from './_lib.js';
import { setting, setSetting, log, CHUNK, SITE } from './_marketing.js';

const API = 'https://open.tiktokapis.com/v2';
export const SCOPES = 'user.info.basic,video.publish';
export const redirectUri = () => `${SITE}/api/tiktok-callback`;
const DEFAULTS = { privacy: '', comment: true, duet: false, stitch: false, source: 'url' };
export const options = async (env) => ({ ...DEFAULTS, ...JSON.parse((await setting(env, 'tt_options')) || '{}') });

export async function app(env) {
  if (env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET) return { key: env.TIKTOK_CLIENT_KEY, secret: env.TIKTOK_CLIENT_SECRET };
  const saved = await setting(env, 'tt_app');
  return saved ? JSON.parse(await decrypt(env, saved)) : null;
}
export async function saveApp(env, key, secret, who) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key) || !/^[A-Za-z0-9_-]{8,120}$/.test(secret)) return 'Check the client key and secret';
  await setSetting(env, 'tt_app', await encrypt(env, JSON.stringify({ key, secret }))); await log(env, '-', 'tiktok_app_saved', who); return '';
}
export async function authorizeUrl(env) {
  const a = await app(env); if (!a) return null;
  const state = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
  await setSetting(env, 'tt_state', JSON.stringify({ state, until: Date.now() + 600000 }));
  return 'https://www.tiktok.com/v2/auth/authorize/?' + new URLSearchParams({ client_key: a.key, scope: SCOPES, response_type: 'code', redirect_uri: redirectUri(), state });
}
async function tokenCall(env, params) {
  const a = await app(env); if (!a) throw new Error('TikTok app keys are missing');
  const r = await fetch(`${API}/oauth/token/`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: a.key, client_secret: a.secret, ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || 'TikTok token error ' + r.status);
  return j;
}
const store = (env, j) => encrypt(env, JSON.stringify({ access: j.access_token, refresh: j.refresh_token, until: Date.now() + j.expires_in * 1000, refreshUntil: Date.now() + j.refresh_expires_in * 1000, scope: j.scope, openId: j.open_id }))
  .then((v) => setSetting(env, 'tt_token', v));
export async function finishConnect(env, code, state, who) {
  const saved = JSON.parse((await setting(env, 'tt_state')) || 'null');
  if (!saved || !state || saved.state !== state || saved.until < Date.now()) throw new Error('Login link expired. Start again.');
  await setSetting(env, 'tt_state', 'null'); // single use
  const j = await tokenCall(env, { code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
  if (!String(j.scope).includes('video.publish')) throw new Error('The video.publish permission was not granted');
  await setSetting(env, 'dry_run', 'on'); // a new account never goes live by itself
  await store(env, j);
  let name = 'account';
  try { const c = await creatorInfo(env); name = c.creator_username || c.creator_nickname || name; } catch (e) { await log(env, '-', 'tiktok_creator_info_failed', e.message); }
  await setSetting(env, 'tt_user', JSON.stringify({ name })); await log(env, '-', 'tiktok_connected', who);
}
// Access tokens last a day: refresh when under an hour is left. The refresh token can rotate, so both are stored.
export async function accessToken(env) {
  const saved = await setting(env, 'tt_token'); if (!saved) throw new Error('TikTok is not connected');
  const t = JSON.parse(await decrypt(env, saved));
  if (t.until - Date.now() > 3600000) return t.access;
  if (t.refreshUntil < Date.now()) throw new Error('TikTok login expired: connect again');
  const j = await tokenCall(env, { grant_type: 'refresh_token', refresh_token: t.refresh });
  await store(env, j); await log(env, '-', 'tiktok_token_refreshed'); return j.access_token;
}
async function call(token, path, body = {}) {
  const r = await fetch(API + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.error?.code && j.error.code !== 'ok')) throw new Error(`TikTok ${j.error?.code || r.status}: ${j.error?.message || 'request failed'}`);
  return j.data || {};
}
export async function creatorInfo(env) {
  const info = await call(await accessToken(env), '/post/publish/creator_info/query/');
  await setSetting(env, 'tt_creator', JSON.stringify(info)); return info;
}
async function videoBytes(env, row) {
  const out = new Uint8Array(row.video_size); let at = 0;
  for (let n = 0; n < Math.ceil(row.video_size / CHUNK); n++) {
    const [m] = await sql(env, 'SELECT data FROM marketing_media WHERE post_id = $1 AND version = $2 AND n = $3', [row.id, row.version, n]);
    if (!m) throw new Error('Video data is missing');
    const raw = atob(m.data); for (let i = 0; i < raw.length; i++) out[at++] = raw.charCodeAt(i);
  }
  return out;
}
// Direct Post: TikTok publishes as soon as it has the file. Returns the publish_id to poll.
export async function directPost(env, row, caption, videoUrl) {
  const token = await accessToken(env), o = await options(env), info = await creatorInfo(env);
  if (!o.privacy || !(info.privacy_level_options || []).includes(o.privacy)) throw new Error('Choose a TikTok privacy level on /marketing');
  const post_info = { title: caption, privacy_level: o.privacy, disable_comment: !o.comment || !!info.comment_disabled, disable_duet: !o.duet || !!info.duet_disabled, disable_stitch: !o.stitch || !!info.stitch_disabled, is_aigc: true, brand_organic_toggle: true };
  const size = row.video_size;
  const source_info = o.source === 'file' ? { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 } : { source: 'PULL_FROM_URL', video_url: videoUrl };
  const bytes = o.source === 'file' ? await videoBytes(env, row) : null; // read first: init starts the publish
  const data = await call(token, '/post/publish/video/init/', { post_info, source_info });
  if (!data.publish_id) throw new Error('TikTok gave no publish id');
  if (bytes) {
    const r = await fetch(data.upload_url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes 0-${size - 1}/${size}` }, body: bytes });
    if (!r.ok) throw new Error('TikTok upload failed: ' + r.status);
  }
  return data.publish_id;
}
// -> { done, failed, id }
export async function status(env, publishId) {
  const d = await call(await accessToken(env), '/post/publish/status/fetch/', { publish_id: publishId });
  if (d.status === 'FAILED') return { failed: d.fail_reason || 'TikTok rejected the video' };
  if (d.status === 'PUBLISH_COMPLETE') return { done: true, id: String(d.publicaly_available_post_id?.[0] || publishId) };
  return { status: d.status };
}
