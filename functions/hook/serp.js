import { json } from '../_lib.js';
import { poolStatus, serpSearch } from '../_serp.js';

// n8n -> SerpApi through the key pool. No session: same X-VAgent-Secret header as the other hooks.
//   GET /hook/serp?kind=account            -> account.json-shaped totals over ALL keys (plan_searches_left, total_searches_left, searches_per_month, this_month_usage, accounts[])
//   GET /hook/serp?kind=search&engine=...  -> the search.json answer of the first key with searches left (automatic failover); 429 + {error} when every account is spent
async function handle({ request, env }) {
  if (!env.WEBHOOK_SECRET || (request.headers.get('X-VAgent-Secret') || '') !== env.WEBHOOK_SECRET) return json({ error: 'Not allowed' }, 401);
  const q = new URL(request.url).searchParams, kind = q.get('kind') || 'search';
  if (kind === 'account') {
    const s = await poolStatus(env, true);
    if (!s.ok) return json({ error: s.error, configured: s.configured }, 503);
    return json({ account_status: 'Active', plan_name: 'SerpApi pool (' + s.configured + ' key' + (s.configured === 1 ? '' : 's') + ')', searches_per_month: s.totalLimit, this_month_usage: s.totalUsed, plan_searches_left: s.totalLeft, total_searches_left: s.totalLeft, active_account: s.activeIndex, accounts: s.accounts });
  }
  const p = {}; for (const [k, v] of q) if (k !== 'kind' && k !== 'api_key') p[k] = v;
  const r = await serpSearch(env, p);
  return json({ ...r.body, _pool: r.account ? { account: r.account, of: r.of } : undefined }, r.status, r.account ? { 'X-Serp-Account': r.account + '/' + r.of } : {});
}
export const onRequestGet = handle, onRequestPost = handle;
