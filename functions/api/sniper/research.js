import { json, bad, body } from '../../_lib.js';
import { discover, scoreLead, audit, outreach, proposal } from '../../_research.js';

// POST /api/sniper/research {action} (owner). Draft only: sends nothing, writes nothing, calls no Sniper n8n workflow.
//   discover {query, n}                     -> 1 SerpApi search, only with paid:true
//   score    {lead, query}                  -> free website check + 0-100 score
//   audit    {input, area, paid}            -> free website audit; paid:true adds up to 3 SerpApi searches
//   outreach {name, channel, findings}      -> drafts (free office AI)
//   proposal {name, service, findings, ...} -> fixed-structure proposal
export async function onRequestPost({ request, env, data }) {
  if (data.role !== 'owner') return json({ error: 'Not allowed.' }, 403);
  const b = (await body(request)) || {};
  const me = String(data.owner || '').split('@')[0].match(/hassan|fayez|boudy/i)?.[0] || '';
  const sender = me && me[0].toUpperCase() + me.slice(1).toLowerCase();
  const query = String(b.query || '').trim(), input = String(b.input || '').trim();
  try {
    if (b.action === 'discover') {
      if (query.length < 3) return bad('Type a niche and a city, for example: dental clinics in Beirut');
      if (b.paid !== true) return bad('Searching Google Maps uses 1 SerpApi search. Press the search button to confirm.');
      return json(await discover(env, query, Number(b.n) || 15));
    }
    if (b.action === 'score') {
      if (!b.lead || !(b.lead.name || b.lead.website)) return bad('Missing lead.');
      return json({ lead: await scoreLead(b.lead, query) });
    }
    if (b.action === 'audit') {
      if (input.length < 2) return bad('Enter a company name or website.');
      return json({ audit: await audit(env, { input, area: b.area, paid: b.paid === true }) });
    }
    if (b.action === 'outreach') return json({ draft: await outreach(env, { ...b, sender }) });
    if (b.action === 'proposal') return json({ proposal: proposal({ ...b, sender }) });
    return bad('Unknown action.');
  } catch (e) {
    return json({ error: String(e.message || e).slice(0, 250) }, 502);
  }
}
