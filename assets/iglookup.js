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
  let current = null, busy = '', el = null, api = null, agent = '';

  function view(r) {
    if (!r) return '<p class="empty">Enter an Instagram handle or profile link to see its public details.</p>';
    const p = r.profile, retry = r.status === 'source_down' || r.status === 'quota_out';
    const head = `<div class="ig-status ${r.status}"><b>${esc(STATUS[r.status] || r.status)}</b>${r.handle ? `<span>@${esc(r.handle)}</span>` : ''}${retry ? `<button class="btn" type="button" data-ig-run="${esc(r.handle)}">↻ Retry</button>` : ''}</div>`;
    if (!p) return head + `<p class="ig-text">${linkify(r.reply)}</p>`;
    const tags = [p.verified && 'Verified', p.private && 'Private', p.business ? 'Business account' : 'Not a business account', p.category, p.highlights != null && p.highlights + ' highlights', p.igtv != null && p.igtv + ' IGTV videos'].filter(Boolean);
    return head + `<section class="ig-card"><h3>${esc(p.name || p.handle)}</h3><p class="ig-links">${link(p.url, '@' + p.handle + ' ↗')}${p.picture ? link(p.picture, 'Profile picture ↗') : ''}</p>
      <dl class="ig-stats"><div><dt>Followers</dt><dd>${n(p.followers)}</dd></div><div><dt>Following</dt><dd>${n(p.following)}</dd></div><div><dt>Posts</dt><dd>${n(p.posts)}</dd></div></dl>
      <p class="ig-tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</p></section>
      ${p.bio ? `<p class="label">Bio</p><p class="ig-text">${linkify(p.bio)}</p>` : ''}
      <p class="label">Public contacts</p>${p.contacts.length ? `<ul class="ig-list">${p.contacts.map((c) => `<li>${linkify(c)}</li>`).join('')}</ul>` : '<p class="empty">None returned.</p>'}
      ${p.links.length ? `<p class="label">Links</p><ul class="ig-list">${p.links.map((l) => `<li>${l.title ? `<small>${esc(l.title)}</small>` : ''}${link(l.url)}</li>`).join('')}</ul>` : ''}
      <p class="label">Recent posts (${p.recent.length})</p>${p.recent.map((x) => `<article class="ig-post"><header><span>${esc([x.date, x.type, x.likes != null && n(x.likes) + ' likes', x.comments != null && n(x.comments) + ' comments', x.location].filter(Boolean).join(' · '))}</span>${safe(x.url) ? link(x.url, 'Open ↗') : ''}</header>${x.caption ? `<p class="ig-text">${linkify(x.caption)}</p>` : ''}</article>`).join('')
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
    busy = input.replace(/^ig:\s*/i, '').replace(/^@/, ''); paint();
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
      if (again) { e.stopPropagation(); run(again.dataset.igRun); }
      if (show && !busy) { e.stopPropagation(); current = list().find((r) => r.handle === show.dataset.igShow) || current; paint(); }
    };
    paint();
  }
  return { mount, run };
})();
