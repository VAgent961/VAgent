// Mocked Meta + Neon: which host each token kind uses, account resolution, Reel publishing, error wording.
import assert from 'node:assert';
const R = new URL('../functions/', import.meta.url).href;
const ig = await import(R + '_instagram.js'), pub = await import(R + '_publish.js'), { digest } = await import(R + '_marketing.js');
const env = { SESSION_SECRET: 's', DATABASE_URL: 'postgres://u:p@h.example/db', ENC_KEY: Buffer.alloc(32, 1).toString('base64') };
const settings = {}, calls = []; let row, pages;
const ID = '17841460984287876', reply = (j, status = 200) => new Response(JSON.stringify(j), { status });
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(url);
  if (u.host === 'api.example') {
    const { query: q, params: p = [] } = JSON.parse(o.body); let rows = [];
    if (/FROM marketing_settings/.test(q)) rows = p[0] in settings ? [{ v: settings[p[0]] }] : [];
    else if (/INTO marketing_settings/.test(q)) settings[p[0]] = p[1];
    else if (/jsonb_set\(pub, ARRAY/.test(q)) row.pub[p[1]] = JSON.parse(p[2]);
    else if (/'\{instagram,state\}'/.test(q)) { row.pub.instagram.state = 'publishing'; rows = [row]; }
    else if (/SET status = 'publishing'/.test(q)) { row.status = 'publishing'; rows = [row]; }
    else if (/SET status = 'published'/.test(q)) { row.status = 'published'; row.video_sha = null; }
    else if (/SET dry_run_at/.test(q)) rows = [row];
    else if (/status = 'publishing'/.test(q)) rows = row?.status === 'publishing' ? [row] : [];
    else if (/slot <= now/.test(q)) rows = row?.status === 'scheduled' ? [row] : [];
    return reply({ rows });
  }
  const q = o.body || u.searchParams, path = u.pathname.replace('/v23.0/', ''), fields = q.get('fields') || '';
  calls.push({ host: u.host, path, method: o.method || 'GET', type: q.get('media_type') });
  const fb = u.host === 'graph.facebook.com';
  if (q.get('access_token').startsWith('EAA') !== fb) return reply({ error: { code: 190, message: 'Invalid OAuth access token - Cannot parse access token' } }, 400);
  if (path === 'me') return reply(fb ? { id: '1' } : { user_id: '555', username: 'iguser', account_type: 'BUSINESS' });
  if (path === 'me/accounts') return reply({ data: pages });
  if (path === 'debug_token') return reply({ data: { expires_at: 0 } });
  if (path === ID) return reply({ id: ID, username: 'v_agent961' });
  if (path.endsWith('content_publishing_limit')) return reply({ data: [{ quota_usage: 0 }] });
  if (path.endsWith('/media')) return reply({ id: 'C1' });
  if (path === 'C1') return reply({ status_code: 'FINISHED' });
  if (path.endsWith('/media_publish')) return reply({ id: 'M1' });
  return reply({ error: { code: 100, message: 'unknown ' + path } }, 400);
};
const post = { caption: 'Hi', hashtags: [] };
const fresh = async () => { row = { id: 'p', post, version: 1, status: 'scheduled', slot: new Date().toISOString(), targets: ['instagram'], pub: {}, video_sha: 'x' }; row.approved_hash = await digest(row); };
for (const [tok, host, id] of [['EAAtest', 'graph.facebook.com', ID], ['IGtest', 'graph.instagram.com', '555']]) {
  pages = [{ instagram_business_account: { id: '9', username: 'other' } }, { instagram_business_account: { id: ID, username: 'v_agent961' } }];
  calls.length = 0; await pub.connectInstagram(env, tok, '', 'o');
  assert.equal((await ig.user(env)).id, id); assert.equal((await ig.check(env)).ok, true);
  // Dry Run is on after connecting: nothing is sent
  await fresh(); const n = calls.length; assert.equal((await pub.tick(env)).posts[0].result, 'dry_run'); assert.equal(calls.length, n); assert.equal(row.video_sha, 'x');
  await pub.setDryRun(env, false, 'PUBLISH', 'o'); await fresh(); await pub.tick(env); await pub.tick(env);
  assert.equal(row.status, 'published'); assert.equal(row.video_sha, null);
  assert.ok(calls.every((c) => c.host === host)); assert.ok(calls.some((c) => c.path === `${id}/media` && c.type === 'REELS')); assert.ok(calls.some((c) => c.path === `${id}/media_publish`));
}
pages = []; await ig.connect(env, ' EAAdirect\n', '', 'o'); assert.equal((await ig.user(env)).id, ID); assert.equal(settings.ig_expires, 'never');
await assert.rejects(ig.connect(env, 'abc', '', 'o'), /EAA/);
await assert.rejects(ig.graph('IGx', 'me', {}, 'GET', 'https://graph.facebook.com/v23.0'), /graph\.facebook\.com could not read/);
console.log('instagram ok');
