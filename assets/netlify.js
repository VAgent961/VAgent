// VNetlify: Netlify account pool limits card (/api/netlify). Paints every [data-netlify]; refreshes every 30 s while one is on screen.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const LABEL = { available: 'Available', limit: 'Limit reached', token: 'Token problem', unknown: 'Unknown' };
  const when = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const size = (b) => (b < 1e9 ? Math.round(b / 1e5) / 10 + ' MB' : Math.round(b / 1e7) / 100 + ' GB');
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  let data = null, failed = '', loading = false, polled = 0, timer;

  function row(a) {
    const exact = a.creditsUsed != null && a.creditsIncluded;
    const credits = exact ? `<b>${esc(a.creditsUsed)} / ${esc(a.creditsIncluded)}</b> credits used` : a.creditsIncluded != null ? `Plan: <b>${esc(a.creditsIncluded)}</b> credits per period · used: not reported` : '';
    const facts = [a.sites != null && plural(a.sites, 'site'), a.published != null && a.published + ' published this period', a.buildMinutes != null && a.buildMinutes + ' build min', a.bandwidthBytes != null && size(a.bandwidthBytes) + ' bandwidth', a.periodEnd && 'resets ' + day(a.periodEnd)].filter(Boolean);
    const pool = [a.poolSites != null && plural(a.poolSites, 'pool site'), a.lastDeploy && 'last pool deploy ' + when(a.lastDeploy)].filter(Boolean);
    return `<li class="nf-row ${esc(a.status)}"><header><span class="nf-n">${a.order}</span><b>${esc(a.label)}</b><span class="nf-badge">${LABEL[a.status] || esc(a.status)}</span></header>
      ${credits ? `<p>${credits}</p>` : ''}${exact ? `<div class="nf-meter"><i style="transform:scaleX(${Math.min(1, a.creditsUsed / a.creditsIncluded)})"></i></div>` : ''}
      ${a.status === 'available' ? '' : `<p class="nf-why">${esc(a.reason)}</p>`}
      <p class="help">${esc(facts.join(' · '))}</p>${pool.length ? `<p class="help">${esc(pool.join(' · '))}</p>` : ''}
      ${a.lastError ? `<p class="help">Last deploy error ${when(a.lastError.at)}${a.lastError.open ? '' : ' (cleared)'}: ${esc(a.lastError.reason)}</p>` : ''}</li>`;
  }
  function html() {
    if (!data) return failed ? `<p class="nf-warn" role="alert">${esc(failed)}</p><button class="btn" type="button" data-nf-retry>Try again</button>` : '<p class="help" role="status">Reading Netlify accounts…</p>';
    const hit = data.accounts.filter((a) => a.status === 'limit').length, ok = data.accounts.filter((a) => a.status === 'available').length;
    return `<p class="help" role="status">${ok} of ${data.accounts.length} available${hit ? ' · ' + hit + ' at limit' : ''} · Netlify checked ${when(data.checkedAt)} · failover order</p>
      ${failed ? `<p class="nf-warn" role="alert">Could not refresh: ${esc(failed)} Showing the last answer.</p>` : ''}
      ${data.stale ? '<p class="nf-warn">The account check is older than 25 minutes. Look at "Netlify Pool Status" in the builder n8n.</p>' : ''}
      ${data.sitesKnown && data.logKnown ? '' : '<p class="nf-warn">Deploy history could not be read, so recent deploy errors may be missing.</p>'}
      <ol class="nf-list">${data.accounts.map(row).join('')}</ol>
      <p class="help">Netlify's API does not give a reliable remaining-credit number, so a number shows only when Netlify reports usage above 0. "Available" means no limit flag and no open limit error.</p>`;
  }
  const targets = () => [...document.querySelectorAll('[data-netlify]')];
  function render() { const h = html(); targets().forEach((el) => { if (el._h !== h) { el._h = h; el.innerHTML = h; } }); }
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
  document.addEventListener('click', (e) => { if (e.target.closest('[data-nf-retry]')) { failed = ''; render(); load(); } });
  document.addEventListener('visibilitychange', () => { if (timer) tick(); });
  window.VNetlify = { paint() { render(); load(); timer = timer || setInterval(tick, 5000); } };
})();
