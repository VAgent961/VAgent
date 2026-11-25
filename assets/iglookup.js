// VIgLookup — the "Instagram Lookup" tab of the Sniper Client drawers. Talks only to /api/sniper/lookup.
window.VIgLookup = (() => {
  const KEY = 'vagent-ig-history-v2', MAX = 8;
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const keep = (r) => { try { localStorage.setItem(KEY, JSON.stringify([r, ...list().filter((x) => x.handle !== r.handle)].slice(0, MAX))); } catch {} };
  const STATUS = { ok: 'Found', private: 'Private account', not_found: 'Not found', quota_out: 'No Apify credit', source_down: 'Source unavailable' };
  const safe = (u) => /^https?:\/\//i.test(u || '');
  const link = (u, label) => (safe(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label || u)}</a>` : esc(label || u));
  const linkify = (t) => esc(t).replace(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  const n = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
  let current = null, busy = '', el = null, api = null, agent = '', full = false, opt = {};

  const from = (s) => `<small>${esc((s || []).slice(0, 4).join(' · ') + (s?.length > 4 ? ' +' + (s.length - 4) : ''))}</small>`;
  const block = (title, items, row) => `<div class="ig-block"><p class="label">${title} (${items.length})</p>${items.length ? `<ul class="ig-list">${items.map((x) => `<li>${row(x)}${from(x.sources)}</li>`).join('')}</ul>` : '<p class="empty">None found.</p>'}</div>`;
  const tel = (v) => `<a href="tel:${esc(v.replace(/[^\d+]/g, ''))}">${esc(v)}</a>`;
  const mail = (v) => `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
  const STATE = { unreachable: 'could not be opened', blocked: 'not opened (unsafe address)', no_links: 'opened, no links readable', not_a_page: 'not a web page' };
  const anyLink = (u, label) => (/^(mailto|tel):/i.test(u) ? `<a href="${esc(u)}">${esc(label || u)}</a>` : link(u, label));
  const linkRow = (l) => `<span class="ig-kind">${esc(l.kind)}</span> ${l.title ? esc(l.title) + ' · ' : ''}${anyLink(l.url)}${l.final ? `<small>goes to ${link(l.final)}</small>` : ''}${STATE[l.state] ? `<small class="ig-warn">Page ${STATE[l.state]}.</small>` : ''}${l.destinations?.length ? `<ul class="ig-list ig-dest">${l.destinations.map((d) => `<li>${linkRow(d)}</li>`).join('')}</ul>` : ''}`;
  const TOPIC = [['offer', 'What they offer'], ['audience', 'Audience / ages'], ['booking', 'Trial / booking'], ['activity', 'Recent activity']];

  function snapshot(p, s) {
    const tags = [p.verified ? 'Verified' : 'Not verified', p.private && 'Private', p.business ? 'Business account' : 'Not a business account', p.category, p.highlights != null && p.highlights + ' highlights'].filter(Boolean);
    const ai = s?.ai, rows = ai ? [['What they offer', ai.offer], ['Audience', ai.audience], ['Ages', ai.ages], ['Trial / booking', ai.booking], ['Recent activity', ai.activity.join('\n')]] : [];
    const lines = TOPIC.filter(([k]) => s?.evidence[k].length);
    return `<div class="ig-block"><p class="label">Business &amp; offer snapshot</p>
      <dl class="ig-stats"><div><dt>Followers</dt><dd>${n(p.followers)}</dd></div><div><dt>Following</dt><dd>${n(p.following)}</dd></div><div><dt>Posts</dt><dd>${n(p.posts)}</dd></div></dl>
      <p class="ig-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</p>
      ${ai ? `<dl class="ig-sum">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd class="ig-text">${v ? esc(v) : 'Not mentioned'}</dd></div>`).join('')}</dl><p class="help">AI summary of the bio and captions. Check it against the quoted lines.</p>`
        : s?.aiState === 'unavailable' ? '<p class="help ig-warn">The AI summary is not available right now. The quoted lines are below.</p>' : ''}
      ${lines.length ? `<details class="ig-quotes"${ai ? '' : ' open'}><summary>Quoted lines from the profile</summary>${lines.map(([k, title]) => `<p class="label">${title}</p><ul class="ig-list">${s.evidence[k].map((x) => `<li><span class="ig-text">${esc(x.text)}</span><small>${esc(x.source)}</small></li>`).join('')}</ul>`).join('')}</details>` : ''}</div>`;
  }

  function intelCard(p, i) {
    if (!i) return `<section class="ig-card ig-intel"><h3>Contacts &amp; Business Intel</h3>${snapshot(p, null)}<p class="empty">Contacts could not be extracted.</p><button class="btn" type="button" data-ig-enrich>↻ Retry extraction</button></section>`;
    return `<section class="ig-card ig-intel"><h3>Contacts &amp; Business Intel</h3>
      ${block('Phone numbers', i.phones, (x) => tel(x.normalized || x.value) + (x.normalized && x.normalized !== x.value ? ` <span class="ig-raw">written ${esc(x.value)}</span>` : x.normalized ? '' : ' <span class="ig-raw">country code unknown</span>'))}
      ${block('Email addresses', i.emails, (x) => mail(x.value))}
      ${block('Links & link-in-bio', i.links, linkRow)}
      ${block('Locations & branches', i.places, (x) => `${esc(x.value)} <span class="ig-raw">${esc(x.type)}</span>`)}
      ${block('Partners & mentions', i.mentions, (x) => link('https://www.instagram.com/' + x.value + '/', '@' + x.value) + (x.context ? `<span class="ig-text ig-raw">${esc(x.context)}</span>` : ''))}
      ${snapshot(p, i.snapshot)}
      ${i.retry ? '<button class="btn" type="button" data-ig-enrich>↻ Retry links &amp; summary (no Apify credit)</button>' : ''}</section>`;
  }

  function post(x, found) {
    const hits = found ? [...found.phones.map(tel), ...found.emails.map(mail), ...found.links.map((u) => link(u))] : [];
    return `<article class="ig-post"><header><span>${esc([x.date, x.type === 'Sidecar' ? 'Carousel' : x.type, x.likes != null && n(x.likes) + ' likes', x.comments != null && n(x.comments) + ' comments'].filter(Boolean).join(' · '))}</span>${safe(x.url) ? link(x.url, 'Open ↗') : ''}</header>
      ${hits.length ? `<p class="ig-hits">${hits.join('')}</p>` : ''}${x.caption ? `<details${full ? ' open' : ''}><summary>Caption</summary><p class="ig-text">${linkify(x.caption)}</p></details>` : ''}</article>`;
  }

  function view(r) {
    if (!r) return '<p class="empty">Enter an Instagram handle or profile link to see its public details.</p>';
    const p = r.profile, retry = r.status === 'source_down' || r.status === 'quota_out';
    const head = `<div class="ig-status ${r.status}"><b>${esc(STATUS[r.status] || r.status)}</b>${r.handle ? `<span>@${esc(r.handle)}</span>` : ''}${retry ? `<button class="btn" type="button" data-ig-run="${esc(r.handle)}">↻ Retry</button>` : ''}</div>`;
    if (!p) return head + `<p class="ig-text">${linkify(r.reply)}</p>`;
    return head + intelCard(p, r.intel)
      + `<section class="ig-card"><h3>${esc(p.name || p.handle)}</h3><p class="ig-links">${link(p.url, '@' + p.handle + ' ↗')}${p.picture ? link(p.picture, 'Profile picture ↗') : ''}</p>${p.bio ? `<p class="ig-text">${linkify(p.bio)}</p>` : ''}</section>
      <div class="ig-posts-head"><p class="label">Recent posts (${p.recent.length})</p>${p.recent.some((x) => x.caption) ? `<button class="btn" type="button" data-ig-full aria-pressed="${full}">${full ? 'Collapse all captions' : 'Expand all captions'}</button>` : ''}</div>
      ${p.recent.map((x, k) => post(x, r.intel?.posts[k])).join('') || `<p class="empty">${p.private ? 'This account is private: posts are not public.' : 'No recent posts were returned.'}</p>`}`;
  }

  function paint() {
    if (!el?.isConnected) return;
    el.querySelector('[data-ig-out]').innerHTML = busy ? `<p class="empty">Looking up @${esc(busy)}… this can take up to a minute.</p>` : view(current);
    el.querySelector('[data-ig-recent]').innerHTML = list().map((r) => `<button class="pick" type="button" data-ig-show="${esc(r.handle)}" aria-pressed="${!busy && current?.handle === r.handle}">@${esc(r.handle)}</button>`).join('');
    el.querySelector('button[type=submit]').disabled = !!busy;
  }

  async function run(input) {
    input = String(input || '').trim();
    if (!input || busy) return;
    full = false; busy = input.replace(/^ig:\s*/i, '').replace(/^@/, ''); paint();
    try {
      current = await api('sniper/lookup', { body: { agent, input } });
      if (current.handle && ['ok', 'private', 'not_found'].includes(current.status)) keep(current); // failures are not kept
    } catch (e) { current = { status: 'source_down', handle: busy, reply: e.message, profile: null }; }
    busy = ''; paint();
  }

  async function again() {
    const r = current;
    if (!r?.profile || busy) return;
    busy = r.handle; paint();
    try { r.intel = (await api('sniper/lookup', { body: { agent, profile: r.profile } })).intel; keep(r); }
    catch (e) { r.intel = r.intel || null; opt.toast?.(e.message); }
    busy = ''; paint();
  }

  function mount(node, o) {
    opt = o;
    el = node; api = opt.api; agent = opt.agent; current = current || list()[0] || null;
    el.innerHTML = `<form class="row ig-form"><label class="sr" for="ig-in">Instagram handle or profile link</label><input class="input" id="ig-in" name="q" placeholder="@handle or instagram.com/handle" required autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="200"><button class="btn primary" type="submit">Look up</button></form>
      <div class="chips" data-ig-recent></div><div data-ig-out aria-live="polite"></div>`;
    el.querySelector('form').onsubmit = (e) => { e.preventDefault(); run(e.target.q.value); };
    el.onclick = (e) => {
      const again = e.target.closest('[data-ig-run]'), show = e.target.closest('[data-ig-show]');
      if (e.target.closest('[data-ig-enrich]')) { e.stopPropagation(); again(); }
      const more = e.target.closest('[data-ig-full]');
      if (more) { e.stopPropagation(); full = !full; paint(); el.querySelector('[data-ig-full]')?.focus({ preventScroll: true }); }
      if (again) { e.stopPropagation(); run(again.dataset.igRun); }
      if (show && !busy) { e.stopPropagation(); current = list().find((r) => r.handle === show.dataset.igShow) || current; full = false; paint(); }
    };
    paint();
  }
  return { mount, run };
})();
