import assert from 'node:assert';
import { view, problems } from '../functions/_netlify.js';
const now = Date.parse('2026-11-25T12:00:00Z'), ago = (m) => new Date(now - m * 60000).toISOString();
const acc = (label, x = {}) => ({ label, ok: true, code: 200, state: 'active', usagesExceeded: [], sitesExceeded: 0, creditsIncluded: 300, creditsUsed: 0, periodStart: ago(20000), ...x });
const snap = { checkedAt: ago(3), accounts: [acc('main'), acc('b2'), acc('b4', { ok: false, code: 401, error: 'Netlify answered HTTP 401' }), acc('b5', { usagesExceeded: ['credits'] })] };
const msg = 'Netlify account: b2 - FAILOVER used. Problems: main upload: HTTP 402 Account credit usage exceeded';
assert.equal(problems(msg + '; b2 find: HTTP 429', ago(1), ['main', 'b2']).length, 2);
let v = view(snap, [], [{ step: 'Netlify', message: msg, createdAt: ago(10) }], now);
assert.deepEqual(v.accounts.map((a) => a.status), ['limit', 'available', 'token', 'limit']);
assert.equal(v.accounts[0].creditsUsed, null); assert.equal(v.stale, false);
// a later successful deploy on the account clears the old error
v = view(snap, [{ account: 'main', status: 'ready', updatedAt: ago(2), detail: 'Netlify account: main' }], [{ step: 'Netlify', message: msg, createdAt: ago(10) }], now);
assert.equal(v.accounts[0].status, 'available'); assert.equal(v.accounts[0].lastError.open, false);
// so does a new usage period
v = view({ ...snap, accounts: [acc('main', { periodStart: ago(5) })] }, [], [{ step: 'Netlify', message: msg, createdAt: ago(10) }], now);
assert.equal(v.accounts[0].status, 'available');
assert.equal(view(snap, null, null, now + 3600000).stale, true);
// Netlify's own wording when a build is skipped for lack of credits
const skipped = 'Netlify account: b2 - FAILOVER used. Problems: main build: Skipped due to account credit usage exceeded';
v = view(snap, [{ account: 'b2', status: 'ready', updatedAt: ago(1), detail: skipped }], [{ step: 'Netlify', message: skipped, createdAt: ago(1) }], now);
assert.deepEqual(v.accounts.slice(0, 2).map((a) => a.status), ['limit', 'available']);
// deployed sites: live list joined with records; deleted records hidden; a record newer than the check is added
const listed = { checkedAt: ago(3), accounts: [acc('main', { list: [{ id: 's1', name: 'one', url: 'https://one.netlify.app' }] })] };
const rec = (site_id, m, status = 'ready') => ({ account: 'main', site_id, site_name: site_id, url: '', project_id: 'p-' + site_id, status, updatedAt: ago(m) });
v = view(listed, [rec('s1', 60), rec('s2', 1), rec('s3', 60), rec('s4', 1, 'deleted')], [], now);
assert.deepEqual(v.deployed.map((s) => [s.site_id, s.project, s.live]), [['s2', 'p-s2', false], ['s1', 'p-s1', true]]);
assert.equal(v.accounts[0].poolSites, 3);
console.log('netlify card logic ok');
