// Instagram publishing (professional accounts): token storage + refresh, checks, Graph calls. Two token kinds, each with its own host:
// EAA… (Meta Unified Login / Facebook Graph API) -> graph.facebook.com · IG… (Instagram Login) -> graph.instagram.com
import { encrypt, decrypt } from './_lib.js';
import { setting, setSetting, log } from './_marketing.js';

const HOST = 'https://graph.instagram.com', GRAPH = HOST + '/v23.0', FB = 'https://graph.facebook.com/v23.0';
const OURS = { id: '17841460984287876', username: 'v_agent961' }; // preferred when a Facebook token reaches several accounts
export const isFacebook = (token) => String(token).startsWith('EAA');
const DAY = 864e5, LIFETIME = 60 * DAY; // long-lived tokens last 60 days and can be refreshed once a day old
const PRO = ['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'];

// Turns Meta's error into something an owner can act on.
export function explain(e = {}, status, fb = false) {
  const code = e.code, sub = e.error_subcode, detail = e.error_user_msg || e.message || `HTTP ${status}`;
  const host = fb ? 'graph.facebook.com' : 'graph.instagram.com';
  if (/cannot parse access token/i.test(detail)) return `${host} could not read this token. Paste the whole token: EAA… (Meta Unified Login) or IG… (Instagram Login). (${detail})`;
  if (code === 190) return `Token invalid or expired: connect Instagram again. (${host}: ${detail})`;
  if (code === 10 || (code >= 200 && code < 300)) return `Missing permission: the token needs ${fb ? 'instagram_basic, instagram_content_publish, pages_show_list and pages_read_engagement' : 'instagram_business_basic and instagram_business_content_publish'}, on a Business or Creator account. (${detail})`;
  if (code === 4 || code === 9 || code === 17 || sub === 2207042) return `Instagram limit reached: try again later. (${detail})`;
  if ([2207003, 2207052, 2207020].includes(sub) || /video_url|media.*(download|fetch)|URI/i.test(detail)) return `Instagram could not fetch the video from its public HTTPS link. (${detail})`;
  if ([2207026, 2207023, 2207004].includes(sub)) return `Instagram rejected the video file. (${detail})`;
  return `Instagram (${host}, HTTP ${status}): ${detail}`;
}
// The host follows the token kind unless a base is given.
export async function graph(token, path, params = {}, method = 'GET', base = isFacebook(token) ? FB : GRAPH) {
  const q = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${base}/${path}${method === 'GET' ? '?' + q : ''}`, method === 'GET' ? {} : { method, body: q });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const err = new Error(explain(j.error, r.status, base.includes('facebook'))); err.code = j.error?.code; throw err; }
  return j;
}
export const noteError = (env, message) => setSetting(env, 'ig_error', message ? JSON.stringify({ message: String(message).slice(0, 300), at: new Date().toISOString() }) : '');
export const user = async (env) => JSON.parse((await setting(env, 'ig_user')) || 'null');
export const token = async (env) => {
  const saved = await setting(env, 'ig_token'); if (!saved) throw new Error('Instagram is not connected');
  return decrypt(env, saved);
};
// expires: ISO date, 'never', or '' when Meta does not tell
const keep = async (env, access, expires) => {
  await setSetting(env, 'ig_token', await encrypt(env, access));
  await setSetting(env, 'ig_refreshed', new Date().toISOString());
  await setSetting(env, 'ig_expires', expires);
};
const after = (seconds) => new Date(Date.now() + (seconds ? seconds * 1000 : LIFETIME)).toISOString();

// Facebook token (user, system user or Page) -> the linked Instagram professional account.
async function findAccount(access) {
  await graph(access, 'me', { fields: 'id' }); // a bad token fails here with Meta's own reason
  const found = [], why = [], fields = 'instagram_business_account{id,username}';
  const attempt = async (path, params, pick) => {
    try { found.push(...pick(await graph(access, path, params)).filter((a) => a?.id)); } catch (e) { why.push(e.message); }
  };
  await attempt('me/accounts', { fields, limit: 100 }, (j) => (j.data || []).map((p) => p.instagram_business_account)); // user token
  if (!found.length) await attempt('me', { fields }, (j) => [j.instagram_business_account]); // Page token
  const ours = (a) => a.id === OURS.id || a.username === OURS.username;
  if (!found.some(ours)) await attempt(OURS.id, { fields: 'id,username' }, (j) => [j]); // Pages not listed, account still granted
  const all = [...new Map(found.map((a) => [a.id, a])).values()];
  const account = all.find(ours) || (all.length === 1 ? all[0] : null);
  if (account) return account;
  if (all.length) throw new Error(`The token is valid but reaches several Instagram accounts and none is @${OURS.username}: ${all.map((a) => '@' + (a.username || a.id)).join(', ')}.`);
  throw new Error(`The token is valid, but no linked Instagram Business or Creator account was found. Link @${OURS.username} to a Facebook Page and grant that Page and account with pages_show_list, instagram_basic and instagram_content_publish.${why.length ? ' ' + why.at(-1) : ''}`);
}
async function facebookExpiry(access) {
  try {
    const at = (await graph(access, 'debug_token', { input_token: access })).data?.expires_at;
    return at === 0 ? 'never' : at ? new Date(at * 1000).toISOString() : '';
  } catch { return ''; } // only app developers may inspect a token
}
async function account(access, id) {
  if (isFacebook(access)) {
    const a = id ? await graph(access, id, { fields: 'id,username' }) : await findAccount(access);
    return { id: String(a.id), name: a.username, type: 'PROFESSIONAL' }; // only professional accounts exist on this API
  }
  const me = await graph(access, 'me', { fields: 'user_id,username,account_type' });
  const type = String(me.account_type || '').toUpperCase();
  if (!PRO.includes(type)) throw new Error(`@${me.username || 'this account'} is ${type ? `a ${type.toLowerCase()}` : 'not a professional'} account. Switch it to Business or Creator in the Instagram app, then connect again.`);
  return { id: String(id || me.user_id || me.id), name: me.username, type };
}

// Accepts a long-lived token, or a short-lived one plus the app secret (exchanged here; the secret is not stored).
export async function connect(env, input, secret, who) {
  input = String(input || '').replace(/[\s"']/g, '');
  if (!input) throw new Error('Paste an access token.');
  if (!/^(EAA|IG)/.test(input)) throw new Error('This is not a Meta access token: it should start with EAA (Meta Unified Login) or IG (Instagram Login).');
  const fb = isFacebook(input);
  let access = input, seconds;
  if (secret) {
    const j = fb
      ? await graph(input, 'oauth/access_token', { grant_type: 'fb_exchange_token', client_id: (await graph(input, 'app')).id, client_secret: secret, fb_exchange_token: input })
      : await graph(input, 'access_token', { grant_type: 'ig_exchange_token', client_secret: secret }, 'GET', HOST);
    access = j.access_token; seconds = j.expires_in;
  }
  const me = await account(access);
  await graph(access, `${me.id}/content_publishing_limit`, { fields: 'quota_usage' }); // fails without the publish permission
  await keep(env, access, fb ? (seconds ? after(seconds) : await facebookExpiry(access)) : after(seconds));
  await setSetting(env, 'ig_user', JSON.stringify(me));
  await noteError(env, ''); await log(env, '-', 'instagram_connected', who);
}
// Runs on every publisher tick, in Dry Run too (refreshing a token publishes nothing): weekly, well inside the 60 days.
export async function maintain(env) {
  if (!(await setting(env, 'ig_token'))) return;
  const age = Date.now() - Date.parse(await setting(env, 'ig_refreshed'));
  const left = Date.parse((await setting(env, 'ig_expires')) || 0) - Date.now();
  if (!(age > 7 * DAY || (age > DAY && !(left > 30 * DAY)))) return;
  try {
    const access = await token(env);
    if (isFacebook(access)) return; // cannot be refreshed without the app secret, which is not stored
    const j = await graph(access, 'refresh_access_token', { grant_type: 'ig_refresh_token' }, 'GET', HOST);
    await keep(env, j.access_token, after(j.expires_in)); await noteError(env, ''); await log(env, '-', 'instagram_token_refreshed');
  } catch (e) { await noteError(env, 'Token refresh failed. ' + e.message); await log(env, '-', 'token_refresh_failed', e.message); }
}
// Read-only: token, account type, publishing permission and today's quota.
export async function check(env) {
  try {
    const access = await token(env), u = await user(env);
    const me = await account(access, u.id);
    const q = await graph(access, `${me.id}/content_publishing_limit`, { fields: 'quota_usage' });
    await setSetting(env, 'ig_user', JSON.stringify(me));
    await noteError(env, '');
    return { ok: true, message: `Token works. @${me.name} (${me.type.replace('MEDIA_', '').toLowerCase()}) can publish. Posts used in the last 24 h: ${q.data?.[0]?.quota_usage ?? 0}.` };
  } catch (e) { await noteError(env, e.message); return { ok: false, message: e.message }; }
}
