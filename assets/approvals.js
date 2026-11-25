// VApprovals: PM Tech approval cards (same records as Telegram, via /api/approvals). Live by polling.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const linked = (s) => esc(s).replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
  const LABEL = { approved: 'Approved', changes_requested: 'Changes requested', rejected: 'Rejected' };
  const when = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const drafts = {}, busy = {}, errors = {};
  let data = null, failed = '', seen = null, cfg = {}, loading = false;

  async function request(opt) {
    const r = await fetch('/api/approvals', opt);
    if (r.status === 401) { location.href = '/'; throw new Error('Signed out'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong'), { status: r.status });
    return j;
  }
  function card(a) {
    const off = busy[a.id] ? 'disabled' : '';
    const btn = (d, cls, text) => `<button class="btn ${cls}" type="button" data-ap="${d}" data-id="${a.id}" ${off}>${busy[a.id] === d ? 'Sending…' : text}</button>`;
    return `<article class="ap-card" aria-busy="${!!busy[a.id]}"><header><b>${esc(a.stageName)}</b><span class="ap-badge pending">Waiting</span></header>
      <p class="help">${esc(a.project)} · asked ${when(a.createdAt)}</p>
      <div class="ap-msg">${linked(a.message)}</div>
      <label class="sr" for="ap-${a.id}">Your reply</label><textarea class="input" id="ap-${a.id}" data-note="${a.id}" maxlength="3000" placeholder="Reply like on Telegram: a note, or what to change" ${off}>${esc(drafts[a.id])}</textarea>
      ${errors[a.id] ? `<p class="ap-err" role="alert">${esc(errors[a.id])}</p>` : ''}
      <div class="ap-actions">${btn('approve', 'primary', 'Approve')}${btn('changes', '', 'Send feedback')}${btn('reject', 'danger', 'Reject')}</div></article>`;
  }
  function html() {
    if (!data) return `<p class="empty">${failed ? esc(failed) : 'Loading approvals…'}</p>`;
    return (failed ? `<p class="ap-err" role="alert">${esc(failed)} Showing the last list.</p>` : '')
      + (data.pending.map(card).join('') || '<p class="empty">Nothing is waiting for approval.</p>')
      + (data.recent.length ? `<details class="ap-done"><summary>Answered (${data.recent.length})</summary>${data.recent.map((a) => `<div class="ap-row"><header><b>${esc(a.stageName)}</b><span class="ap-badge ${a.status}">${LABEL[a.status] || esc(a.status)}</span></header><p class="help">${esc(a.project)}${a.decidedBy ? ' · ' + esc(a.decidedBy) : ''} · ${when(a.updatedAt)}</p>${a.note ? `<p class="ap-note">${esc(a.note)}</p>` : ''}</div>`).join('')}</details>` : '');
  }
  function paint(force) {
    document.querySelectorAll('[data-approvals]').forEach((el) => {
      const next = html(); if (el._h === next) return;
      // never rebuild under the owner's cursor; their text is kept in `drafts` and the next tick catches up
      const f = document.activeElement;
      if (!force && f && el.contains(f) && f.tagName === 'TEXTAREA' && data && data.pending.some((a) => String(a.id) === f.dataset.note)) return;
      const open = el.querySelector('.ap-done')?.open;
      el._h = next; el.innerHTML = next; if (open) el.querySelector('.ap-done')?.setAttribute('open', '');
    });
  }
  function badge() {
    const n = data ? data.pending.length : 0, b = document.getElementById('btn-approvals');
    if (b) { b.querySelector('b').textContent = n || ''; b.querySelector('b').hidden = !n; b.setAttribute('aria-label', 'Approvals' + (n ? ', ' + n + ' waiting' : '')); }
  }
  function take(j) {
    data = j; failed = '';
    const ids = j.pending.map((a) => a.id);
    if (seen && ids.some((i) => !seen.has(i))) cfg.toast?.('PM Tech needs your approval');
    seen = new Set([...(seen || []), ...ids]); badge();
  }
  async function refresh() {
    if (loading) return; loading = true;
    try { take(await request()); } catch (e) { failed = e.message; if (e.status === 403) stop(); }
    loading = false; paint();
  }
  async function decide(id, decision) {
    if (busy[id]) return;
    const note = (drafts[id] || '').trim();
    errors[id] = decision === 'changes' && !note ? 'Write what to change first.' : '';
    if (errors[id]) { paint(true); return document.getElementById('ap-' + id)?.focus(); }
    if (decision === 'reject' && !confirm('Reject this request? PM Tech will stop this step.')) return;
    busy[id] = decision; paint(true);
    try {
      take(await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, decision, note }) }));
      delete drafts[id]; cfg.toast?.(decision === 'approve' ? 'Approved. PM Tech is continuing.' : decision === 'reject' ? 'Rejected. PM Tech was told to stop.' : 'Feedback sent to PM Tech.');
    } catch (e) { errors[id] = e.message; cfg.toast?.(e.message); }
    delete busy[id]; paint(true); refresh();
  }
  document.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.note) drafts[e.target.dataset.note] = e.target.value; });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-ap]'); if (b) decide(Number(b.dataset.id), b.dataset.ap); });

  let timer = 0;
  const stop = () => { clearInterval(timer); timer = -1; const b = document.getElementById('btn-approvals'); if (b) b.style.display = 'none'; };
  window.VApprovals = {
    start(o) { cfg = o || {}; if (timer) return; refresh(); timer = setInterval(() => { if (!document.hidden) refresh(); }, 10000); document.addEventListener('visibilitychange', () => { if (!document.hidden && timer > 0) refresh(); }); },
    paint: () => { paint(true); if (timer > 0) refresh(); },
  };
})();
