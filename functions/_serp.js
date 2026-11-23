// SerpApi key pool: many free accounts behind one door. Keys live ONLY in Cloudflare env vars (never in git, never sent to the browser or n8n):
//   SERPAPI_API_KEYS (comma list) + SERPAPI_API_KEY + SERPAPI_API_KEY_2 ... _20, in that order, de-duplicated.
// Quota numbers come from SerpApi's free Account API (account.json: 0 credits) - nothing is hardcoded.

export function serpKeys(env) {
  const out = [], add = (k) => { k = String(k || '').trim(); if (k && !out.includes(k)) out.push(k); };
  String(env.SERPAPI_API_KEYS || '').split(',').forEach(add);
  add(env.SERPAPI_API_KEY);
  for (let i = 2; i <= 20; i++) add(env['SERPAPI_API_KEY_' + i]);
  return out;
}

const cache = { at: 0, accounts: null, dead: new Set() };   // per-isolate cache (20 s) + keys marked exhausted by a 429 (until the next account check says otherwise)
const num = (v) => (v == null || v === '' ? null : Number(v));

async function account(key, i) {
  const base = { index: i + 1, label: 'Account ' + (i + 1), last4: key.slice(-4) };
  try {
    const r = await fetch('https://serpapi.com/account.json?api_key=' + encodeURIComponent(key), { signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) return { ...base, ok: false, error: String(j.error || 'HTTP ' + r.status).slice(0, 120) };
    const limit = num(j.searches_per_month), used = num(j.this_month_usage), left = num(j.plan_searches_left != null ? j.plan_searches_left : j.total_searches_left);
    return { ...base, ok: true, used, limit, left, extra: num(j.extra_credits), pct: limit ? Math.round((used / limit) * 1000) / 10 : null, plan: j.plan_name || '', renewal: j.plan_renewal_date || '' };
  } catch (e) { return { ...base, ok: false, error: 'SerpApi unreachable' }; }
}

// Live status of every configured key. `fresh` skips the 20 s cache.
export async function poolStatus(env, fresh) {
  const keys = serpKeys(env);
  if (!keys.length) return { ok: false, configured: 0, accounts: [], error: 'No SerpApi key is configured. Add SERPAPI_API_KEY (and SERPAPI_API_KEY_2 ...) in Cloudflare.' };
  if (!fresh && cache.accounts && Date.now() - cache.at < 20000 && cache.accounts.length === keys.length) return summarize(cache.accounts, keys.length);
  const accounts = await Promise.all(keys.map((k, i) => account(k, i)));
  cache.accounts = accounts; cache.at = Date.now(); cache.dead.clear();
  return summarize(accounts, keys.length);
}
function summarize(accounts, configured) {
  const good = accounts.filter((a) => a.ok);
  const totalUsed = good.reduce((t, a) => t + (a.used || 0), 0), totalLimit = good.reduce((t, a) => t + (a.limit || 0), 0), totalLeft = good.reduce((t, a) => t + (a.left || 0), 0);
  const act = accounts.find((a) => a.ok && a.left > 0 && !cache.dead.has(a.index));
  return { ok: good.length > 0, configured, accounts, totalUsed, totalLimit, totalLeft, pct: totalLimit ? Math.round((totalUsed / totalLimit) * 1000) / 10 : null, activeIndex: act ? act.index : null,
    error: good.length ? undefined : 'Could not reach SerpApi to read the quota.', checkedAt: new Date().toISOString() };
}

const exhausted = (status, j) => status === 429 || /run out of searches|out of searches|exceed|quota|limit/i.test(String((j && j.error) || ''));
const badKey = (status, j) => status === 401 || status === 403 || /invalid api key|api key/i.test(String((j && j.error) || ''));

// One search with automatic failover: first key with searches left; on 429 / "out of searches" mark it spent and retry with the next key.
export async function serpSearch(env, params) {
  const keys = serpKeys(env);
  if (!keys.length) return { status: 503, body: { error: 'No SerpApi key is configured.' } };
  const st = await poolStatus(env, false);
  const order = keys.map((_, i) => i).filter((i) => { const a = st.accounts[i]; return !cache.dead.has(i + 1) && !(a && a.ok && a.left <= 0); });
  const tried = [];
  for (const i of order) {
    const q = new URLSearchParams(params); q.set('api_key', keys[i]);
    let r, j;
    try { r = await fetch('https://serpapi.com/search.json?' + q.toString(), { signal: AbortSignal.timeout(25000) }); j = await r.json().catch(() => ({})); } catch (e) { tried.push(i + 1); continue; }
    if (exhausted(r.status, j) || badKey(r.status, j)) { cache.dead.add(i + 1); const a = cache.accounts && cache.accounts[i]; if (a && exhausted(r.status, j)) a.left = 0; tried.push(i + 1); continue; }
    if (cache.accounts && cache.accounts[i] && cache.accounts[i].ok && cache.accounts[i].left > 0 && r.ok) { cache.accounts[i].left -= 1; cache.accounts[i].used = (cache.accounts[i].used || 0) + 1; }   // keep the 20 s cache honest between searches
    return { status: r.status, body: j, account: i + 1, of: keys.length };
  }
  return { status: 429, body: { error: 'All SerpApi accounts are out of searches this month.', tried, of: keys.length }, exhausted: true };
}
