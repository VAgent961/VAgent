// VNetlify: Netlify account pool bar in the PM Tech chat header (/api/netlify; same .sq look as the SerpApi bar). Paints every [data-netlify]; refreshes every 30 s while one is on screen.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const LABEL = { available: 'Available', limit: 'Limit reached', token: 'Token problem', unknown: 'Unknown' };
  const when = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  let data = null, failed = '', loading = false, polled = 0, open = false, timer;

  function row(a) {
    const exact = a.creditsUsed != null && a.creditsIncluded;
    const main = exact ? `${a.creditsUsed} / ${a.creditsIncluded} credits` : LABEL[a.status] || a.status;
    const facts = [exact && a.status !== 'available' && LABEL[a.status], a.sites != null && plural(a.sites, 'site'), a.published != null && a.published + ' published', a.periodEnd && 'resets ' + day(a.periodEnd)].filter(Boolean);
    return `<li class="sq-row ${esc(a.status)}"><span>${a.order}. <b>${esc(a.label)}</b></span><span class="nf-st">${esc(main)}</span><small>${esc(facts.join(' · '))}</small>
      ${exact ? `<span class="sq-bar"><i style="transform:scaleX(${Math.min(1, a.creditsUsed / a.creditsIncluded)})"></i></span>` : ''}
      ${a.status === 'available' ? '' : `<small class="nf-why">${esc(a.reason)}</small>`}</li>`;
  }
  function html() {
    const again = '<button type="button" class="sq-acc nf-again" data-nf-retry aria-label="Refresh Netlify status" title="Refresh">↻</button>';
    if (!data) return failed ? `<span class="sq-msg nf-grow" role="alert">⚠ Netlify status unavailable: ${esc(failed)}</span>${again}` : '<span class="sq-msg" role="status">Reading Netlify accounts…</span>';
    const ok = data.accounts.filter((a) => a.status === 'available').length;
    const warns = [failed && 'Could not refresh: ' + failed + ' Showing the last answer.', data.stale && 'The account check is older than 25 minutes. Look at "Netlify Pool Status" in the builder n8n.',
      !(data.sitesKnown && data.logKnown) && 'Deploy history could not be read, so recent deploy errors may be missing.'].filter(Boolean);
    return `<button type="button" class="sq-acc" data-nf-toggle aria-expanded="${open}" title="Per-account status">Netlify ${ok}/${data.accounts.length} ▾</button>
      <span class="nf-pool">${data.accounts.map((a) => `<span class="${esc(a.status)}" title="${esc(LABEL[a.status] || a.status)}">${esc(a.label)}<span class="sr"> ${esc(LABEL[a.status] || a.status)}</span></span>`).join('')}</span>${warns.length ? '<span class="nf-flag" aria-hidden="true">⚠</span>' : ''}${again}
      <div class="sq-pop">${warns.map((w) => `<p class="nf-warn" role="alert">${esc(w)}</p>`).join('')}<ol class="nf-list">${data.accounts.map(row).join('')}</ol>
      <p class="sq-left">Checked ${when(data.checkedAt)} · failover order. Credits show only when Netlify reports usage above 0.</p></div>`;
  }
  const targets = () => [...document.querySelectorAll('[data-netlify]')];
  function render() {
    const h = html(), bad = (!data && failed) || (data && !data.accounts.some((a) => a.status === 'available'));
    targets().forEach((el) => { el.className = 'sq nf' + (bad ? ' bad' : '') + (open ? ' open' : ''); if (el._h !== h) { el._h = h; el.innerHTML = h; } });
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
  function tick() {
    if (!targets().length) { clearInterval(timer); timer = null; return; }
    if (!document.hidden && Date.now() - polled >= 29000) load();
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-nf-toggle]')) { open = !open; render(); const b = document.querySelector('[data-nf-toggle]'); if (b) b.focus(); }
    else if (e.target.closest('[data-nf-retry]')) { failed = ''; render(); load(); }
  });
  document.addEventListener('visibilitychange', () => { if (timer) tick(); });
  window.VNetlify = { paint() { render(); load(); timer = timer || setInterval(tick, 5000); } };
})();
