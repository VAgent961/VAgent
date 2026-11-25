import { json, bad, body } from '../../_lib.js';
import { instance, summaries, runWebhook } from '../../_n8n.js';

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

// POST /api/sniper/lookup {agent: <Sniper chat key>, input} (owner) -> {status, handle, reply, profile}.
// Only ever sends "ig: <handle>" to the agent, so it cannot start a hunt or a website build; writes nothing.
export async function onRequestPost({ request, env, data }) {
  if (data.role !== 'owner') return json({ error: 'Not allowed.' }, 403);
  const b = await body(request);
  const handle = handleOf(b.input);
  if (!handle) return json({ status: 'not_found', handle: '', reply: 'That is not an Instagram profile. Enter @handle, ig: handle or a profile link.', profile: null });
  try {
    const [instId, wfId] = String(b.agent || '').split(':');
    const inst = await instance(env, instId);
    const wf = inst && (await summaries(env, inst)).find((w) => w.id === wfId);
    if (!wf?.webhook || !/\/sniper-client-chat$/.test(wf.webhook.url)) return bad('Lookup is only available on the Sniper Client chat.', 404);
    const r = await runWebhook(wf.webhook, { message: 'ig: ' + handle, from: data.owner, source: 'vagent-office' }, env.WEBHOOK_SECRET);
    return json({ status: r.late || !r.ok ? 'source_down' : r.status, handle, reply: r.late ? 'The lookup took too long. Tap Retry in a minute.' : r.output, profile: r.profile || null });
  } catch (e) {
    return json({ status: 'source_down', handle, reply: 'Could not reach the lookup: ' + String(e.message || e).slice(0, 200), profile: null });
  }
}
