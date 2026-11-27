import assert from 'node:assert';
const R = new URL('../functions/', import.meta.url).href;
const { hashPassword, makeSession } = await import(R + '_lib.js'), { onRequest } = await import(R + '_middleware.js'), login = (await import(R + 'api/login.js')).onRequestPost;
globalThis.fetch = async () => new Response(JSON.stringify({ rows: [{ n: 0 }] }));
const env = { SESSION_SECRET: 's', DATABASE_URL: 'postgres://u:p@h.example/db', MARKETING_EMAIL: 'm@x.test', MARKETING_PASS_HASH: await hashPassword('Pw$1%x') };
const r = await login({ env, request: new Request('https://vagent.online/api/login', { method: 'POST', body: JSON.stringify({ email: 'M@x.test', password: 'Pw$1%x' }) }) });
assert.equal(r.status, 200); const ck = r.headers.get('Set-Cookie').split(';')[0];
assert.equal((await login({ env, request: new Request('https://vagent.online/api/login', { method: 'POST', body: JSON.stringify({ email: 'm@x.test', password: 'no' }) }) })).status, 401);
const go = async (path, cookie, e = env) => { const data = {}; const res = await onRequest({ env: e, data, next: async () => new Response('page'), request: new Request('https://vagent.online' + path, { headers: cookie ? { Cookie: cookie } : {} }) }); return [res.status, data.role, res.headers.get('Location')]; };
assert.deepEqual(await go('/marketing'), [200, undefined, null]); assert.equal((await go('/api/marketing'))[0], 401); 
assert.deepEqual(await go('/api/marketing', ck), [200, 'marketing', null]);
for (const p of ['/api/office', '/api/act', '/api/accounts', '/api/marketing/x']) assert.equal((await go(p, ck))[0], 403, p);
const assets = { fetch: async () => new Response('<body>sign-in') };
env.ASSETS = assets;
const view = async (path, cookie) => { const res = await onRequest({ env, data: {}, next: async () => new Response('office-page'), request: new Request('https://vagent.online' + path, { headers: cookie ? { Cookie: cookie } : {} }) }); return [res.status, res.headers.get('Location'), await res.text()]; };
for (const p of ['/office', '/office.html', '/office/', '/']) assert.deepEqual(await view(p, ck), [200, null, '<body data-marketing>sign-in'], p);
assert.deepEqual(await view('/office'), [200, null, '<body>sign-in']);
const out = await (await import(R + 'api/logout.js')).onRequestPost({ request: new Request('https://vagent.online/api/logout', { method: 'POST' }) });
assert.equal(out.headers.get('Location'), '/'); assert.match(out.headers.get('Set-Cookie'), /^va_session=; Path=\/;.*Max-Age=0$/);
const { readFileSync } = await import('node:fs'), html = readFileSync(new URL('../office.html', import.meta.url), 'utf8');
assert.ok(!html.includes('href="/api/logout"'), 'logout must be a POST form'); // a GET link never reaches onRequestPost
assert.equal((await go('/api/marketing', ck, { ...env, MARKETING_EMAIL: 'other@x.test' }))[0], 401);
const owner = 'va_session=' + await makeSession(env, 'o@x.test', 1); assert.equal((await go('/api/office', owner))[0], 200); assert.equal((await go('/', owner))[2], 'https://vagent.online/office');
// End to end: one email that is both an owner and the marketing account.
const ownerHash = await hashPassword('Owner!9');
globalThis.fetch = async (u, o) => { const q = JSON.parse(o.body).query; return new Response(JSON.stringify({ rows: /count\(\*\)/.test(q) ? [{ n: 0 }] : /SELECT email, pass_hash/.test(q) ? [{ email: 'm@x.test', pass_hash: ownerHash }] : /SELECT role/.test(q) ? [{ role: 'owner' }] : [] })); };
const sign = async (password, scope, e = env) => { const res = await login({ env: e, request: new Request('https://vagent.online/api/login', { method: 'POST', body: JSON.stringify({ email: 'm@x.test', password, scope }) }) }); return { status: res.status, cookie: res.headers.get('Set-Cookie')?.split(';')[0], ...(await res.json()) }; };
const opens = async (c) => { assert.deepEqual(await view('/office', c), [200, null, 'office-page']); assert.equal((await go('/api/office', c))[0], 200); };
// (a) signed out -> owner login -> /office stays
const a = await sign('Owner!9', 'owner'); assert.equal(a.next, '/office'); await opens(a.cookie);
assert.equal((await go('/', a.cookie))[2], 'https://vagent.online/office');
// (b) marketing session -> /office -> owner login replaces the cookie (same name, same path)
const mk = await sign('Pw$1%x'); assert.equal(mk.next, '/marketing'); assert.equal((await go('/api/office', mk.cookie))[0], 403);
const wrong = await sign('Pw$1%x', 'owner'); assert.equal(wrong.status, 401); assert.equal(wrong.cookie, undefined); assert.match(wrong.error, /marketing password/);
const b = await sign('Owner!9', 'owner'); assert.equal(b.cookie.split('=')[0], mk.cookie.split('=')[0]); await opens(b.cookie);
// same password on both accounts: the office sign-in still means owner, /marketing still means marketing
const same = { ...env, MARKETING_PASS_HASH: ownerHash };
assert.equal((await sign('Owner!9', 'owner', same)).next, '/office'); assert.equal((await sign('Owner!9', undefined, same)).next, '/marketing');
// (c) logout expires the only session cookie, and the next request is signed out
assert.deepEqual(await view('/office', out.headers.get('Set-Cookie').split(';')[0]), [200, null, '<body>sign-in']);
console.log('auth ok');
