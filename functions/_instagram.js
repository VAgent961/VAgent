// Instagram API with Instagram Login (professional accounts): token storage + refresh, checks, Reel publishing calls.
import { encrypt, decrypt } from './_lib.js';
import { setting, setSetting, log } from './_marketing.js';

const HOST = 'https://graph.instagram.com', GRAPH = HOST + '/v23.0';
const DAY = 864e5, LIFETIME = 60 * DAY; // long-lived tokens last 60 days and can be refreshed once a day old
const PRO = ['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'];

// Turns Meta's error into something an owner can act on.
export function explain(e = {}, status) {
  const code = e.code, sub = e.error_subcode, detail = e.error_user_msg || e.message || `HTTP ${status}`;
  if (code === 190) return `Token invalid or expired: connect Instagram again. (${detail})`;
  if (code === 10 || (code >= 200 && code < 300)) return `Missing permission: the token needs instagram_business_basic and instagram_business_content_publish, on a Business or Creator account. (${detail})`;
  if (code === 4 || code === 9 || code === 17 || sub === 2207042) return `Instagram limit reached: try again later. (${detail})`;
  if ([2207003, 2207052, 2207020].includes(sub) || /video_url|media.*(download|fetch)|URI/i.test(detail)) return `Instagram could not fetch the video from its public HTTPS link. (${detail})`;
  if ([2207026, 2207023, 2207004].includes(sub)) return `Instagram rejected the video file. (${detail})`;
  return `Instagram: ${detail}`;
}
export async function graph(token, path, params = {}, method = 'GET', base = GRAPH) {
  const q = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${base}/${path}${method === 'GET' ? '?' + q : ''}`, method === 'GET' ? {} : { method, body: q });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const err = new Error(explain(j.error, r.status)); err.code = j.error?.code; throw err; }
  return j;
}
export const noteError = (env, message) => setSetting(env, 'ig_error', message ? JSON.stringify({ message: String(message).slice(0, 300), at: new Date().toISOString() }) : '');
export const user = async (env) => JSON.parse((await setting(env, 'ig_user')) || 'null');
export const token = async (env) => {
  const saved = await setting(env, 'ig_token'); if (!saved) throw new Error('Instagram is not connected');
  return decrypt(env, saved);
};
const keep = async (env, access, seconds) => {
  await setSetting(env, 'ig_token', await encrypt(env, access));
  await setSetting(env, 'ig_refreshed', new Date().toISOString());
  await setSetting(env, 'ig_expires', new Date(Date.now() + (seconds ? seconds * 1000 : LIFETIME)).toISOString());
};

// Accepts a long-lived token, or a short-lived one plus the app secret (exchanged here; the secret is not stored).
export async function connect(env, input, secret, who) {
  if (!input) throw new Error('Paste an access token.');
  let access = input, seconds;
  if (secret) {
    const j = await graph(input, 'access_token', { grant_type: 'ig_exchange_token', client_secret: secret }, 'GET', HOST);
    access = j.access_token; seconds = j.expires_in;
  }
  const me = await graph(access, 'me', { fields: 'user_id,username,account_type' });
  const type = String(me.account_type || '').toUpperCase();
  if (!PRO.includes(type)) throw new Error(`@${me.username || 'this account'} is ${type ? `a ${type.toLowerCase()}` : 'not a professional'} account. Switch it to Business or Creator in the Instagram app, then connect again.`);
  const id = String(me.user_id || me.id);
  await graph(access, `${id}/content_publishing_limit`, { fields: 'quota_usage' }); // fails without the publish permission
  await keep(env, access, seconds);
  await setSetting(env, 'ig_user', JSON.stringify({ id, name: me.username, type }));
  await noteError(env, ''); await log(env, '-', 'instagram_connected', who);
}
// Runs on every publisher tick, in Dry Run too (refreshing a token publishes nothing): weekly, well inside the 60 days.
export async function maintain(env) {
  if (!(await setting(env, 'ig_token'))) return;
  const age = Date.now() - Date.parse(await setting(env, 'ig_refreshed'));
  const left = Date.parse((await setting(env, 'ig_expires')) || 0) - Date.now();
  if (!(age > 7 * DAY || (age > DAY && !(left > 30 * DAY)))) return;
  try {
    const j = await graph(await token(env), 'refresh_access_token', { grant_type: 'ig_refresh_token' }, 'GET', HOST);
    await keep(env, j.access_token, j.expires_in); await noteError(env, ''); await log(env, '-', 'instagram_token_refreshed');
  } catch (e) { await noteError(env, 'Token refresh failed. ' + e.message); await log(env, '-', 'token_refresh_failed', e.message); }
}
// Read-only: token, account type, publishing permission and today's quota.
export async function check(env) {
  try {
    const access = await token(env), u = await user(env);
    const me = await graph(access, 'me', { fields: 'user_id,username,account_type' });
    const type = String(me.account_type || '').toUpperCase();
    if (!PRO.includes(type)) throw new Error('The account is no longer a Business or Creator account.');
    const q = await graph(access, `${u.id}/content_publishing_limit`, { fields: 'quota_usage' });
    await setSetting(env, 'ig_user', JSON.stringify({ id: u.id, name: me.username, type }));
    await noteError(env, '');
    return { ok: true, message: `Token works. @${me.username} (${type.replace('MEDIA_', '').toLowerCase()}) can publish. Posts used in the last 24 h: ${q.data?.[0]?.quota_usage ?? 0}.` };
  } catch (e) { await noteError(env, e.message); return { ok: false, message: e.message }; }
}
