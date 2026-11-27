// Mocked TikTok + Neon: requested scopes, login with and without video.publish, simulation without it.
import assert from 'node:assert';
const R = new URL('../functions/', import.meta.url).href;
const tt = await import(R + '_tiktok.js'), pub = await import(R + '_publish.js');
const env = { DATABASE_URL: 'postgres://u:p@h.example/db', ENC_KEY: Buffer.alloc(32, 1).toString('base64'), TIKTOK_CLIENT_KEY: 'k', TIKTOK_CLIENT_SECRET: 's' };
const settings = {}, paths = []; let scope;
const reply = (j) => new Response(JSON.stringify(j));
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(url);
  if (u.host === 'api.example') {
    const { query: q, params: p = [] } = JSON.parse(o.body); let rows = [];
    if (/FROM marketing_settings/.test(q)) rows = p[0] in settings ? [{ v: settings[p[0]] }] : [];
    else if (/INTO marketing_settings/.test(q)) settings[p[0]] = p[1];
    return reply({ rows });
  }
  paths.push(u.pathname);
  if (u.pathname.endsWith('/oauth/token/')) return reply({ access_token: 'a', refresh_token: 'r', expires_in: 86400, refresh_expires_in: 9e6, scope, open_id: 'o' });
  if (u.pathname.endsWith('/user/info/')) return reply({ data: { user: { display_name: 'Basic Name' } }, error: { code: 'ok' } });
  return reply({ data: { creator_username: 'poster', privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } });
};
const login = async (granted, publish) => {
  scope = granted; const url = new URL(await tt.authorizeUrl(env, publish));
  await tt.finishConnect(env, 'c', url.searchParams.get('state'), 'o'); return url.searchParams.get('scope');
};
settings.tt_options = JSON.stringify({ privacy: 'SELF_ONLY' }); settings.dry_run = 'off';
assert.equal(await login('user.info.basic', false), 'user.info.basic');
assert.equal(settings.dry_run, 'on'); assert.equal(JSON.parse(settings.tt_user).name, 'Basic Name');
assert.equal(await tt.canPublish(env), false); assert.equal((await pub.readiness(env)).tiktok, false);
assert.ok(!paths.some((p) => p.includes('/post/')));
await assert.rejects(tt.creatorInfo(env), /video\.publish/);
assert.match(await pub.setDryRun(env, false, 'PUBLISH', 'o'), /Dry Run stays on/);
await pub.setDryRun(env, false, 'PUBLISH', 'o'); assert.equal((await pub.liveFlags(env)).tiktok, false);
assert.equal(await login('user.info.basic,video.publish', true), 'user.info.basic,video.publish');
assert.equal(await tt.canPublish(env), true); assert.equal((await pub.readiness(env)).tiktok, true); assert.equal(JSON.parse(settings.tt_user).name, 'poster'); assert.equal(settings.dry_run, 'on');
console.log('tiktok ok');
