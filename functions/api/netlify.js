import { json, bad, body } from '../_lib.js';
import { instances, call } from '../_n8n.js';
import { view } from '../_netlify.js';

// Netlify account pool limits. Everything is read from n8n data tables on the website builder's n8n (no Netlify tokens here;
// deleting a site goes through the builder n8n workflow "V-Agent | Netlify Site Delete", which holds the credentials):
// netlify_accounts (live plan/usage, written every 10 min by "V-Agent | Netlify Pool Status"), netlify_sites + project_progress (pool results).
const HOST = 'https://boudy.vagent.online', ACCOUNTS = 'kdNO5O7SlRFLkXuU', SITES = 'dczqULtKRsohmcpa', PROGRESS = 'H3Co95uEWFribCFS';

// GET /api/netlify -> {checkedAt, accounts[], sitesKnown, logKnown, deployed[], listKnown[], canDelete}
export async function onRequestGet({ env, data }) {
  if (data.role === 'client') return bad('Not allowed', 403);
  try {
    const inst = (await instances(env)).find((i) => i.base_url.replace(/\/$/, '') === HOST);
    if (!inst) return bad('The website builder n8n is not connected (Settings).', 502);
    const rows = (t, n) => call(env, inst, `/data-tables/${t}/rows?limit=${n}&sortBy=createdAt:desc`).then((r) => r.data || []);
    const [status, sites, log] = await Promise.all([rows(ACCOUNTS, 5), rows(SITES, 250).catch(() => null), rows(PROGRESS, 250).catch(() => null)]);
    const row = status.find((r) => r.key === 'pool');
    if (!row) return bad('No account check yet. The "Netlify Pool Status" workflow runs every 10 minutes.', 502);
    return json({ ...view(JSON.parse(row.data), sites, log), canDelete: data.role === 'owner' });
  } catch (e) { return bad(e.message, 502); }
}

// DELETE /api/netlify {account, site_id, name} -> {ok, already_gone, site_name} (owners only; the UI confirms first)
export async function onRequestDelete({ env, data, request }) {
  if (data.role !== 'owner') return bad('Only an owner can delete a site.', 403);
  const b = await body(request), account = String(b.account || ''), site_id = String(b.site_id || ''), name = String(b.name || '');
  if (!account || !/^[A-Za-z0-9-]{8,64}$/.test(site_id) || !name) return bad('Missing account or site.');
  try {
    const r = await fetch(HOST + '/webhook/netlify-site-delete', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-VAgent-Secret': env.WEBHOOK_SECRET },
      body: JSON.stringify({ account, site_id, name, by: data.owner }), signal: AbortSignal.timeout(80000) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return bad('The builder n8n did not confirm the delete. Refresh the list to check.', 502);
    return j.ok ? json({ ok: true, already_gone: !!j.already_gone, site_name: name }) : bad(j.error || 'Nothing was deleted.', 409);
  } catch (e) { return bad('The builder n8n took too long. Refresh the list to check.', 502); }
}
