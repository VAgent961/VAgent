// VNetlify: Netlify account pool bar in the PM Tech chat header (/api/netlify; same .sq look as the SerpApi bar). Paints every [data-netlify]; refreshes every 30 s while one is on screen.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const LABEL = { available: 'Available', limit: 'Limit reached', token: 'Token problem', unknown: 'Unknown' };
  const when = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  let data = null, failed = '', loading = false, polled = 0, open = false, timer;
  let tab = 'accounts', filter = '', busy = '', note = null;
  const gone = new Set(); // deleted in this tab: hidden until the next account check agrees

  function row(a) {
    const exact = a.creditsUsed != null && a.creditsIncluded;
    const main = exact ? `${a.creditsUsed} / ${a.creditsIncluded} credits` : LABEL[a.status] || a.status;
    const facts = [exact && a.status !== 'available' && LABEL[a.status], a.sites != null && plural(a.sites, 'site'), a.published != null && a.published + ' published', a.periodEnd && 'resets ' + day(a.periodEnd)].filter(Boolean);
    return `<li class="sq-row ${esc(a.status)}"><span>${a.order}. <b>${esc(a.label)}</b></span><span class="nf-st">${esc(main)}</span><small>${esc(facts.join(' · '))}</small>
      ${exact ? `<span class="sq-bar"><i style="transform:scaleX(${Math.min(1, a.creditsUsed / a.creditsIncluded)})"></i></span>` : ''}
      ${a.status === 'available' ? '' : `<small class="nf-why">${esc(a.reason)}</small>`}</li>`;
  }
  const shown = () => (data.deployed || []).filter((s) => !gone.has(s.site_id));
  function site(s) {
    const href = /^https:\/\//.test(s.url) ? s.url : '';
    const facts = [s.account, s.recordedAt ? 'deployed ' + when(s.recordedAt) : s.published ? 'published ' + when(s.published) : 'never published',
      s.project || 'no pool record', s.status && s.status !== 'ready' && s.status, !s.live && 'not in the last account check'].filter(Boolean);
    return `<li class="nf-site"><span><b>${esc(s.name)}</b>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(href.slice(8))}</a>` : ''}<small>${esc(facts.join(' · '))}</small></span>
      ${data.canDelete ? `<button type="button" class="nf-del" data-nf-del="${esc(s.site_id)}" aria-label="Delete ${esc(s.name)}"${busy ? ' disabled' : ''}>${busy === s.site_id ? 'Deleting…' : 'Delete'}</button>` : ''}</li>`;
  }
  function sitesPane() {
    const all = shown(), list = all.filter((s) => !filter || s.account === filter), missing = data.accounts.map((a) => a.label).filter((l) => !(data.listKnown || []).includes(l));
    const chip = (v, text) => `<button type="button" class="sq-acc" data-nf-filter="${esc(v)}" aria-pressed="${filter === v}">${esc(text)}</button>`;
    return `<div class="nf-chips">${chip('', 'All ' + all.length)}${data.accounts.map((a) => chip(a.label, a.label + ' ' + all.filter((s) => s.account === a.label).length)).join('')}</div>
      ${note ? `<p class="${note.ok ? 'nf-ok' : 'nf-why'}" role="status">${esc(note.text)}</p>` : ''}${missing.length ? `<p class="nf-warn">Full site list not available for ${esc(missing.join(', '))}; only some sites may show.</p>` : ''}
      ${list.length ? `<ul class="nf-list">${list.map(site).join('')}</ul>` : '<p class="sq-left">No sites here.</p>'}`;
  }
  function html() {
    const again = '<button type="button" class="sq-acc nf-again" data-nf-retry aria-label="Refresh Netlify status" title="Refresh">↻</button>';
    if (!data) return failed ? `<span class="sq-msg nf-grow" role="alert">⚠ Netlify status unavailable: ${esc(failed)}</span>${again}` : '<span class="sq-msg" role="status">Reading Netlify accounts…</span>';
    const ok = data.accounts.filter((a) => a.status === 'available').length;
    const warns = [failed && 'Could not refresh: ' + failed + ' Showing the last answer.', data.stale && 'The account check is older than 25 minutes. Look at "Netlify Pool Status" in the builder n8n.',
      !(data.sitesKnown && data.logKnown) && 'Deploy history could not be read, so recent deploy errors may be missing.'].filter(Boolean);
    return `<button type="button" class="sq-acc" data-nf-toggle aria-expanded="${open}" title="Per-account status">Netlify ${ok}/${data.accounts.length} ▾</button>
      <span class="nf-pool">${data.accounts.map((a) => `<span class="${esc(a.status)}" title="${esc(LABEL[a.status] || a.status)}">${esc(a.label)}<span class="sr"> ${esc(LABEL[a.status] || a.status)}</span></span>`).join('')}</span>${warns.length ? '<span class="nf-flag" aria-hidden="true">⚠</span>' : ''}${again}
      <div class="sq-pop"><div class="nf-chips">${[['accounts', 'Accounts'], ['sites', 'Sites ' + shown().length]].map(([v, t]) => `<button type="button" class="sq-acc" data-nf-tab="${v}" aria-pressed="${tab === v}">${t}</button>`).join('')}</div>
      ${warns.map((w) => `<p class="nf-warn" role="alert">${esc(w)}</p>`).join('')}${tab === 'sites' ? sitesPane() : `<ol class="nf-list">${data.accounts.map(row).join('')}</ol>`}
      <p class="sq-left">Checked ${when(data.checkedAt)}${tab === 'sites' ? '. Deleting removes the site from Netlify for good.' : ' · failover order. Credits show only when Netlify reports usage above 0.'}</p></div>`;
  }
  const targets = () => [...document.querySelectorAll('[data-netlify]')];
  function render() {
    const h = html(), bad = (!data && failed) || (data && !data.accounts.some((a) => a.status === 'available'));
    targets().forEach((el) => {
      el.className = 'sq nf' + (bad ? ' bad' : '') + (open ? ' open' : '') + (tab === 'sites' ? ' sites' : '');
      if (el._h !== h) { const y = el.querySelector('.sq-pop')?.scrollTop; el._h = h; el.innerHTML = h; if (y) el.querySelector('.sq-pop').scrollTop = y; }
    });
  }
  async function load() {
    if (loading) return;
    loading = true; polled = Date.now();
    try {
      const r = await fetch('/api/netlify', { signal: AbortSignal.timeout(25000) });
      if (r.status === 401) { location.href = '/'; return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Something went wrong.');
      data = j; failed = '';
    } catch (e) { failed = e.name === 'TimeoutError' ? 'The builder n8n took too long to answer.' : e.message; }
    finally { loading = false; render(); }
  }
  async function remove(id) {
    const s = shown().find((x) => x.site_id === id);
    if (!s || busy || !confirm(`Delete "${s.name}" from Netlify account ${s.account}?\n\n${s.url}\n\nThe site and all its deploys are removed for good. This cannot be undone.`)) return;
    busy = id; note = null; render();
    try {
      const r = await fetch('/api/netlify', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: s.account, site_id: id, name: s.name }), signal: AbortSignal.timeout(90000) });
      if (r.status === 401) { location.href = '/'; return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Something went wrong.');
      gone.add(id); note = { ok: true, text: j.already_gone ? s.name + ' was already gone from Netlify.' : 'Deleted ' + s.name + '.' };
    } catch (e) { note = { ok: false, text: e.name === 'TimeoutError' ? 'No answer yet. Refresh to check whether ' + s.name + ' was deleted.' : e.message }; }
    busy = ''; render(); polled = 0; load();
  }
  function tick() {
    if (!targets().length) { clearInterval(timer); timer = null; return; }
    if (!document.hidden && Date.now() - polled >= 29000) load();
  }
  document.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-nf-tab],[data-nf-filter]'), del = e.target.closest('[data-nf-del]');
    if (del) return void remove(del.dataset.nfDel);
    if (pick) {
      const d = pick.dataset, sel = d.nfTab !== undefined ? `[data-nf-tab="${d.nfTab}"]` : `[data-nf-filter="${d.nfFilter}"]`;
      if (d.nfTab !== undefined) tab = d.nfTab; else filter = d.nfFilter;
      render(); document.querySelector(sel)?.focus(); return;
    }
    if (e.target.closest('[data-nf-toggle]')) { open = !open; render(); const b = document.querySelector('[data-nf-toggle]'); if (b) b.focus(); }
    else if (e.target.closest('[data-nf-retry]')) { failed = ''; render(); load(); }
  });
  document.addEventListener('visibilitychange', () => { if (timer) tick(); });
  window.VNetlify = { paint() { render(); load(); timer = timer || setInterval(tick, 5000); } };
})();
