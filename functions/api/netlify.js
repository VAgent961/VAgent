import { json, bad } from '../_lib.js';
import { instances, call } from '../_n8n.js';
import { view } from '../_netlify.js';

// Netlify account pool limits. Everything is read from n8n data tables on the website builder's n8n (no Netlify tokens here):
// netlify_accounts (live plan/usage, written every 10 min by "V-Agent | Netlify Pool Status"), netlify_sites + project_progress (pool results).
const HOST = 'https://boudy.vagent.online', ACCOUNTS = 'kdNO5O7SlRFLkXuU', SITES = 'dczqULtKRsohmcpa', PROGRESS = 'H3Co95uEWFribCFS';

// GET /api/netlify -> {checkedAt, accounts[], sitesKnown, logKnown}
export async function onRequestGet({ env, data }) {
  if (data.role === 'client') return bad('Not allowed', 403);
  try {
    const inst = (await instances(env)).find((i) => i.base_url.replace(/\/$/, '') === HOST);
    if (!inst) return bad('The website builder n8n is not connected (Settings).', 502);
    const rows = (t, n) => call(env, inst, `/data-tables/${t}/rows?limit=${n}&sortBy=createdAt:desc`).then((r) => r.data || []);
    const [status, sites, log] = await Promise.all([rows(ACCOUNTS, 5), rows(SITES, 250).catch(() => null), rows(PROGRESS, 250).catch(() => null)]);
    const row = status.find((r) => r.key === 'pool');
    if (!row) return bad('No account check yet. The "Netlify Pool Status" workflow runs every 10 minutes.', 502);
    return json(view(JSON.parse(row.data), sites, log));
  } catch (e) { return bad(e.message, 502); }
}
