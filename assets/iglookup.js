// VIgLookup — the "Instagram Lookup" tab of the Sniper Client drawers. Talks only to /api/sniper/lookup.
window.VIgLookup = (() => {
  const KEY = 'vagent-ig-history', MAX = 8;
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const keep = (r) => { try { localStorage.setItem(KEY, JSON.stringify([r, ...list().filter((x) => x.handle !== r.handle)].slice(0, MAX))); } catch {} };
  const STATUS = { ok: 'Found', private: 'Private account', not_found: 'Not found', quota_out: 'No Apify credit', source_down: 'Source unavailable' };
  const safe = (u) => /^https?:\/\//i.test(u || '');
  const link = (u, label) => (safe(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label || u)}</a>` : esc(label || u));
  const linkify = (t) => esc(t).replace(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  const n = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
  let current = null, busy = '', el = null, api = null, agent = '', full = false;

  // ---- Contact & business intel, read from what the lookup already returned (no extra requests)
  const digits = (t) => String(t || '').replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 15));
  // a number counts when it looks Lebanese, starts with + / 00, or follows a contact word; bare numbers (prices, dates) do not
  const PHONES = [
    /(?<![\d+])(?:\+|00)\s?[1-9](?:[ \-.()]{0,2}\d){7,13}(?!\d)/g,
    /(?<![\d+.,])(?:961[ \-.]?)(?:0?3|7\d|81|[14-9])(?:[ \-.\/]?\d){6}(?!\d)/g,
    /(?<![\d+.,])(?:0[ \-]?(?:3|[14-9])|0?(?:70|71|76|78|79|81))[ \-.\/]?\d{3}[ \-.]?\d{3}(?![\d]|[.,]\d)/g,
    /(?:call|phone|tel|mobile|whats ?app|contact|hotline|order|☎️?|📞|📱|للحجز|للطلب|للتواصل|واتساب|هاتف|اتصل)[^\d+\n]{0,14}(\+?\d(?:[ \-.]?\d){6,13})(?!\d)/gi,
  ];
  function phoneKey(raw) {
    let d = digits(raw).replace(/\D/g, '').replace(/^00/, '');
    if (d.startsWith('961')) d = d.slice(3); else if (!/^\s*(\+|00)/.test(raw) && d.length <= 9) d = d.replace(/^0/, ''); else return d;
    return d.length === 7 || d.length === 8 ? '961' + d.replace(/^0/, '') : d;
  }
  function intel(p) {
    const phones = new Map(), emails = new Map(), links = new Map(), places = new Map(), mentions = new Map();
    const put = (map, key, value, source) => { const x = map.get(key) || { value, sources: new Set() }; x.sources.add(source); map.set(key, x); };
    const phone = (raw, source) => { const k = phoneKey(raw); if (k.length >= 7 && k.length <= 15) put(phones, k, raw.trim(), source); };
    const scan = (text, source) => {
      const all = digits(text);
      for (const m of all.matchAll(/(?:wa\.me\/\+?|whatsapp\.com\/send\/?\?(?:[^\s]*&)?phone=(?:\+|%2B)?)(\d{8,15})/gi)) phone('+' + m[1], 'WhatsApp link');
      for (const m of all.matchAll(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g)) put(links, m[0].replace(/\/$/, ''), m[0], source);
      const t = all.replace(/https?:\/\/\S+/g, ' ');
      for (const e of t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g) || []) put(emails, e.toLowerCase(), e, source);
      for (const re of PHONES) for (const m of t.matchAll(re)) phone(m[1] || m[0], source);
      for (const m of t.matchAll(/(?<![A-Za-z0-9._%+-])@([A-Za-z0-9_](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?)/g)) { const h = m[1].toLowerCase(); if (h !== String(p.handle).toLowerCase()) put(mentions, h, h, source); }
      for (const line of t.split('\n')) if (/📍|\bbranch(?:es)?\b|\blocated\b|\baddress\b|\bvisit us\b|فرع|فروع|العنوان|موقعنا/i.test(line)) { const v = line.trim().slice(0, 160); if (v.length > 3) put(places, v.toLowerCase(), v, source); }
    };
    for (const c of p.contacts || []) {
      const [, label, v] = String(c).match(/^([^:]+):\s*(.*)$/) || [, 'Profile', String(c)];
      if (/address/i.test(label)) put(places, v.toLowerCase(), v, 'Business address');
      else if (/email/i.test(label)) put(emails, v.toLowerCase(), v, /bio/i.test(label) ? 'Bio' : 'Profile');
      else phone(v, /bio/i.test(label) ? 'Bio' : /whatsapp/i.test(label) ? 'WhatsApp link' : 'Profile');
    }
    for (const l of p.links || []) { put(links, l.url.replace(/\/$/, ''), l.url, l.title || 'Profile link'); scan(l.url, 'Profile link'); }
    scan(p.bio || '', 'Bio');
    for (const x of p.recent || []) {
      const source = 'Post' + (x.date ? ' ' + x.date : '');
      if (x.location) put(places, x.location.toLowerCase(), x.location, source);
      scan(x.caption || '', source);
    }
    const out = (map) => [...map.values()].map((x) => ({ value: x.value, sources: [...x.sources] }));
    return { phones: out(phones), emails: out(emails), links: out(links), places: out(places), mentions: out(mentions).sort((a, b) => b.sources.length - a.sources.length) };
  }
  const from = (s) => `<small>${esc(s.slice(0, 3).join(' · ') + (s.length > 3 ? ' +' + (s.length - 3) : ''))}</small>`;
  const block = (title, items, row) => `<p class="label">${title} (${items.length})</p>${items.length ? `<ul class="ig-list">${items.map((x) => `<li>${row(x)}${from(x.sources)}</li>`).join('')}</ul>` : '<p class="empty">None found.</p>'}`;

  function view(r) {
    if (!r) return '<p class="empty">Enter an Instagram handle or profile link to see its public details.</p>';
    const p = r.profile, retry = r.status === 'source_down' || r.status === 'quota_out';
    const head = `<div class="ig-status ${r.status}"><b>${esc(STATUS[r.status] || r.status)}</b>${r.handle ? `<span>@${esc(r.handle)}</span>` : ''}${retry ? `<button class="btn" type="button" data-ig-run="${esc(r.handle)}">↻ Retry</button>` : ''}</div>`;
    if (!p) return head + `<p class="ig-text">${linkify(r.reply)}</p>`;
    const i = intel(p);
    const tags = [p.verified && 'Verified', p.private && 'Private', p.business ? 'Business account' : 'Not a business account', p.category, p.highlights != null && p.highlights + ' highlights', p.igtv != null && p.igtv + ' IGTV videos'].filter(Boolean);
    return head + `<section class="ig-card"><h3>${esc(p.name || p.handle)}</h3><p class="ig-links">${link(p.url, '@' + p.handle + ' ↗')}${p.picture ? link(p.picture, 'Profile picture ↗') : ''}</p>
      <dl class="ig-stats"><div><dt>Followers</dt><dd>${n(p.followers)}</dd></div><div><dt>Following</dt><dd>${n(p.following)}</dd></div><div><dt>Posts</dt><dd>${n(p.posts)}</dd></div></dl>
      <p class="ig-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</p></section>
      <section class="ig-card ig-intel"><h3>Contact &amp; Business Intel</h3>
      ${block('Phones', i.phones, (x) => `<a href="tel:${esc(x.value.replace(/[^\d+]/g, ''))}">${esc(x.value)}</a>`)}
      ${block('Emails', i.emails, (x) => `<a href="mailto:${esc(x.value)}">${esc(x.value)}</a>`)}
      ${block('Links', i.links, (x) => link(x.value))}
      ${block('Locations & branches mentioned', i.places, (x) => esc(x.value))}
      ${block('Mentions & partners', i.mentions, (x) => link('https://www.instagram.com/' + x.value + '/', '@' + x.value))}</section>
      ${p.bio ? `<p class="label">Bio</p><p class="ig-text">${linkify(p.bio)}</p>` : ''}
      <div class="ig-posts-head"><p class="label">Recent posts (${p.recent.length})</p>${p.recent.some((x) => x.caption) ? `<button class="btn" type="button" data-ig-full aria-pressed="${full}">${full ? 'Hide captions' : 'Show full captions'}</button>` : ''}</div>
      ${p.recent.map((x) => `<article class="ig-post"><header><span>${esc([x.date, x.type === 'Sidecar' ? 'Carousel' : x.type, x.likes != null && n(x.likes) + ' likes', x.comments != null && n(x.comments) + ' comments'].filter(Boolean).join(' · '))}</span>${safe(x.url) ? link(x.url, 'Open ↗') : ''}</header>${full && x.caption ? `<p class="ig-text">${linkify(x.caption)}</p>` : ''}</article>`).join('')
        || `<p class="empty">${p.private ? 'This account is private: posts are not public.' : 'No recent posts were returned.'}</p>`}`;
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

  function mount(node, opt) {
    el = node; api = opt.api; agent = opt.agent; current = current || list()[0] || null;
    el.innerHTML = `<form class="row ig-form"><label class="sr" for="ig-in">Instagram handle or profile link</label><input class="input" id="ig-in" name="q" placeholder="@handle or instagram.com/handle" required autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="200"><button class="btn primary" type="submit">Look up</button></form>
      <div class="chips" data-ig-recent></div><div data-ig-out aria-live="polite"></div>`;
    el.querySelector('form').onsubmit = (e) => { e.preventDefault(); run(e.target.q.value); };
    el.onclick = (e) => {
      const again = e.target.closest('[data-ig-run]'), show = e.target.closest('[data-ig-show]');
      const more = e.target.closest('[data-ig-full]');
      if (more) { e.stopPropagation(); full = !full; paint(); el.querySelector('[data-ig-full]')?.focus({ preventScroll: true }); }
      if (again) { e.stopPropagation(); run(again.dataset.igRun); }
      if (show && !busy) { e.stopPropagation(); current = list().find((r) => r.handle === show.dataset.igShow) || current; full = false; paint(); }
    };
    paint();
  }
  return { mount, run, intel };
})();
