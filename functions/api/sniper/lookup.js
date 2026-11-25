import { json, bad, body } from '../../_lib.js';
import { instance, summaries, runWebhook } from '../../_n8n.js';
import { enrich } from '../../_igintel.js';

// "@handle", "ig: handle" or a profile link -> handle ('' = not a profile)
function handleOf(input) {
  let s = String(input || '').trim().replace(/^ig:\s*/i, '').trim();
  const url = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/([^\s?#]*)/i);
  if (url) {
    const p = url[1].split('/').filter(Boolean);
    s = (p[0] || '').toLowerCase() === 'stories' ? p[1] || '' : p[0] || '';
    if (/^(p|reel|reels|tv|explore|accounts|direct)$/i.test(s)) s = '';
  }
  s = s.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(s) && /[A-Za-z0-9_]/.test(s) ? s.toLowerCase() : '';
}

// enrichment never turns a found profile into a failed lookup
const intelOf = (profile, env) => enrich(profile, { env }).catch(() => null);
// a profile sent back by the browser for a re-run: keep only the expected shapes and sizes
function cleanProfile(p) {
  const s = (v, n) => String(v ?? '').slice(0, n), arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
  return { handle: s(p.handle, 30), name: s(p.name, 200), category: s(p.category, 200), bio: s(p.bio, 3000),
    contacts: arr(p.contacts, 20).map((c) => s(c, 300)), links: arr(p.links, 10).map((l) => ({ url: s(l?.url, 600), title: s(l?.title, 200) })),
    recent: arr(p.recent, 12).map((x) => ({ date: s(x?.date, 10), caption: s(x?.caption, 3000), location: s(x?.location, 200) })) };
}

// POST /api/sniper/lookup {agent, profile} re-runs only the enrichment (no Apify call, no credit).
// POST /api/sniper/lookup {agent: <Sniper chat key>, input} (owner) -> {status, handle, reply, profile}.
// Only ever sends "ig: <handle>" to the agent, so it cannot start a hunt or a website build; writes nothing.
export async function onRequestPost({ request, env, data }) {
  if (data.role !== 'owner') return json({ error: 'Not allowed.' }, 403);
  const b = await body(request);
  if (b.profile && typeof b.profile === 'object') {
    const intel = await intelOf(cleanProfile(b.profile), env);
    return intel ? json({ intel }) : json({ error: 'Enrichment failed. Try again.' }, 502);
  }
  const handle = handleOf(b.input);
  if (!handle) return json({ status: 'not_found', handle: '', reply: 'That is not an Instagram profile. Enter @handle, ig: handle or a profile link.', profile: null });
  try {
    const [instId, wfId] = String(b.agent || '').split(':');
    const inst = await instance(env, instId);
    const wf = inst && (await summaries(env, inst)).find((w) => w.id === wfId);
    if (!wf?.webhook || !/\/sniper-client-chat$/.test(wf.webhook.url)) return bad('Lookup is only available on the Sniper Client chat.', 404);
    const r = await runWebhook(wf.webhook, { message: 'ig: ' + handle, from: data.owner, source: 'vagent-office' }, env.WEBHOOK_SECRET);
    const status = r.late || !r.ok ? 'source_down' : r.status;
    const profile = r.profile || null;
    return json({ status, handle, reply: r.late ? 'The lookup took too long. Tap Retry in a minute.' : r.output, profile,
      intel: profile && (status === 'ok' || status === 'private') ? await intelOf(profile, env) : null });
  } catch (e) {
    return json({ status: 'source_down', handle, reply: 'Could not reach the lookup: ' + String(e.message || e).slice(0, 200), profile: null });
  }
}
