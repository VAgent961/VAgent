// VApprovals: PM Tech approval cards (same records as Telegram, via /api/approvals). Live over SSE, with polling + tab-focus refresh as backup.
(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const linked = (s) => esc(s).replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
  const LABEL = { approved: 'Approved', changes_requested: 'Changes requested', rejected: 'Rejected' };
  const when = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const drafts = {}, busy = {}, errors = {}, known = new Map(), fresh = new Set();
  let data = null, failed = '', seen = null, cfg = {}, loading = null, again = false;

  async function request(opt) {
    const r = await fetch('/api/approvals', { signal: AbortSignal.timeout(40000), ...opt });
    if (r.status === 401) { location.href = '/'; throw new Error('Signed out'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong'), { status: r.status });
    return j;
  }
  const make = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
  // A card is built once and then only patched, so the textarea (text, cursor, focus) is never replaced.
  const card = (a) => make(`<article class="ap-card" data-card="${a.id}"><header><b>${esc(a.stageName)}</b><span class="ap-badge"></span></header>
      <p class="help">${esc(a.project)} · asked ${when(a.createdAt)}</p>
      <div class="ap-msg">${linked(a.message)}</div>
      <label class="sr" for="ap-${a.id}">Your reply</label><textarea class="input" id="ap-${a.id}" data-note="${a.id}" maxlength="3000" placeholder="Reply like on Telegram: a note, or what to change"></textarea>
      <p class="ap-err" role="alert" hidden></p><p class="help ap-state" role="status" hidden></p>
      <div class="ap-actions">${[['approve', 'primary', 'Approve'], ['changes', '', 'Send feedback'], ['reject', 'danger', 'Reject']].map(([d, c, t]) => `<button class="btn ${c}" type="button" data-ap="${d}" data-id="${a.id}" data-text="${t}">${t}</button>`).join('')}</div></article>`);
  const set = (el, key, value) => { if (el[key] !== value) el[key] = value; };
  // a = latest record for this card; undefined = it left the list (replaced by a newer request, or expired)
  function patch(el, a) {
    const id = el.dataset.card, open = a?.status === 'pending', sending = busy[id];
    const badge = el.querySelector('.ap-badge'), area = el.querySelector('textarea'), state = el.querySelector('.ap-state'), err = el.querySelector('.ap-err');
    set(badge, 'className', 'ap-badge ' + (a ? a.status : ''));
    set(badge, 'textContent', open ? 'Waiting' : a ? LABEL[a.status] || a.status : 'Closed');
    el.setAttribute('aria-busy', !!sending);
    if (document.activeElement !== area) set(area, 'value', drafts[id] || '');
    set(area, 'readOnly', !open || !!sending);
    set(area, 'hidden', !open && !area.value && document.activeElement !== area);
    set(err, 'textContent', (open && errors[id]) || ''); set(err, 'hidden', !err.textContent);
    const unsent = !open && drafts[id]?.trim() && drafts[id].trim() !== (a?.note || '');
    set(state, 'textContent', open ? '' : (a ? (LABEL[a.status] || a.status) + (a.decidedBy ? ' by ' + a.decidedBy : '') + (a.note ? ': ' + a.note : '') : 'This request is no longer waiting.') + (unsent ? ' — your typed reply was not sent.' : ''));
    set(state, 'hidden', open);
    set(el.querySelector('.ap-actions'), 'hidden', !open);
    el.querySelectorAll('[data-ap]').forEach((b) => { set(b, 'disabled', !!sending); set(b, 'textContent', sending === b.dataset.ap ? 'Sending…' : b.dataset.text); });
  }
  const done = (a) => `<div class="ap-row"><header><b>${esc(a.stageName)}</b><span class="ap-badge ${esc(a.status)}">${LABEL[a.status] || esc(a.status)}</span></header><p class="help">${esc(a.project)}${a.decidedBy ? ' · ' + esc(a.decidedBy) : ''} · ${when(a.updatedAt)}</p>${a.note ? `<p class="ap-note">${esc(a.note)}</p>` : ''}</div>`;

  const scroller = (el) => el.closest('.drawer-in') || document.scrollingElement;
  const inView = (el, box) => { const r = el.getBoundingClientRect(), b = box.getBoundingClientRect(); return r.top < b.bottom - 40 && r.bottom > Math.max(b.top, 0) + 40; };
  // Change the list while whatever the owner is looking at (or typing in) stays at the same spot on screen.
  function steady(el, change) {
    const box = scroller(el), f = document.activeElement;
    const anchor = box.contains(f) && f.matches('textarea,input,select') ? f
      : box.scrollTop > 0 ? [...box.querySelectorAll('.ap-card,.ap-done,.d-head,.drawer-in > *')].find((n) => n.getBoundingClientRect().height && inView(n, box)) : null;
    const top = anchor?.getBoundingClientRect().top;
    change();
    if (anchor?.isConnected) { const moved = anchor.getBoundingClientRect().top - top; if (moved) box.scrollTop += moved; }
  }
  // lives at the top of the drawer's own content, so it disappears with it when the drawer shows something else
  function pill(el) {
    const box = scroller(el), hidden = [...el.querySelectorAll('.ap-card')].filter((c) => fresh.has(c.dataset.card) && !inView(c, box));
    let b = box.querySelector(':scope > .ap-jump');
    if (!b) { if (!hidden.length) return; b = make('<div class="ap-jump"><button type="button"></button></div>'); steady(el, () => box.prepend(b)); }
    set(b, 'hidden', !hidden.length);
    set(b.firstChild, 'textContent', hidden.length > 1 ? hidden.length + ' new approvals · View' : 'New approval · View');
  }
  function sync(el) {
    if (!el.querySelector('.ap-cards')) el.innerHTML = '<p class="ap-err ap-top" role="alert" hidden></p><p class="empty"></p><div class="ap-cards"></div><details class="ap-done" hidden><summary></summary><div></div></details>';
    const wrap = el.querySelector('.ap-cards'), empty = el.querySelector('.empty'), top = el.querySelector('.ap-top'), fold = el.querySelector('.ap-done');
    set(top, 'textContent', data && failed ? failed + ' Showing the last list.' : ''); set(top, 'hidden', !top.textContent);
    const all = data ? [...data.pending, ...data.recent] : [];
    const have = new Map([...wrap.children].map((c) => [c.dataset.card, c]));
    // cards already on screen stay put (badge flips in place); new ones are inserted in server order without moving others
    let before = wrap.firstChild;
    (data ? data.pending : []).forEach((a) => {
      const old = have.get(String(a.id));
      if (old) { before = old.nextSibling; return; }
      const c = card(a); if (fresh.has(String(a.id))) c.classList.add('ap-new');
      wrap.insertBefore(c, before); have.set(String(a.id), c);
    });
    have.forEach((c, id) => patch(c, all.find((a) => String(a.id) === id) || (known.get(Number(id))?.status !== 'pending' ? known.get(Number(id)) : undefined)));
    set(empty, 'textContent', !data ? failed || 'Loading approvals…' : data.pending.length ? '' : 'Nothing is waiting for approval.'); set(empty, 'hidden', !empty.textContent);
    const recent = data ? data.recent.filter((a) => !have.has(String(a.id))) : [], rows = recent.map(done).join('');
    set(fold, 'hidden', !recent.length);
    if (fold._h !== rows) { fold._h = rows; fold.lastChild.innerHTML = rows; fold.firstChild.textContent = `Answered (${recent.length})`; }
  }
  // Live build: the latest project's steps. A PM reply or an approval request ends a run; silence for 4 min is called out.
  function live(el) {
    const p = data && data.progress;
    el.hidden = !p;
    if (!p) return;
    const last = p.steps[p.steps.length - 1], age = Math.round((Date.now() - new Date(last.at).getTime()) / 60000);
    const over = /^(PM Tech|Request Client Approval)$/.test(last.step), stopped = /STOPPED/.test(last.text);
    const state = stopped ? ['bad', 'Stopped'] : over ? ['', 'Waiting for you'] : age >= 4 ? ['bad', 'No update for ' + age + ' min'] : ['on', 'Working'];
    const line = (s) => s.text.split('\n').find((x) => x.trim()) || '';
    const html = `<header><b>Live build</b><span class="pm-state ${state[0]}">${state[1]}</span></header><p class="help">${esc(p.project)}</p><ol>${p.steps.map((s) => `<li><time>${new Date(s.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</time><span><b>${esc(s.step)}</b> ${linked(line(s).slice(0, 220))}</span></li>`).join('')}</ol>`
      + (over ? `<details><summary>Latest message</summary><div class="ap-msg">${linked(last.text)}</div></details>` : '');
    if (el._h === html) return;
    const open = el.querySelector('details')?.open;
    el._h = html; el.innerHTML = html;
    if (open && el.querySelector('details')) el.querySelector('details').open = true;
  }
  function paint() {
    document.querySelectorAll('[data-pm-live]').forEach((el) => { if (!el.closest('[aria-hidden="true"]')) steady(el, () => live(el)); });
    document.querySelectorAll('[data-approvals]').forEach((el) => {
      if (el.closest('[aria-hidden="true"]')) return;   // closed drawer
      steady(el, () => sync(el)); pill(el);
    });
  }
  // Notification sound (generated, no file). Browsers allow audio only after a click/key on the page, so a chime that
  // could not play is owed and rings on the first one, if something is still waiting.
  let audio = null, owed = false;
  const title = document.title;
  function ring() {
    [[880, 0], [1318.5, 0.18], [880, 0.55], [1318.5, 0.73]].forEach(([hz, at]) => {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + at;
      o.frequency.value = hz; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.5);
    });
  }
  function chime() {
    if (audio?.state === 'running') return ring();
    owed = true; unlock();
  }
  function unlock() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx || (!navigator.userActivation?.hasBeenActive && navigator.userActivation)) return;
    audio = audio || new Ctx();
    const play = () => { if (owed && audio.state === 'running') { owed = false; if (data?.pending.length) ring(); } };
    if (audio.state === 'running') play(); else audio.resume().then(play, () => {});
  }
  function badge() {
    const n = data ? data.pending.length : 0, b = document.getElementById('btn-approvals');
    if (b) { b.querySelector('b').textContent = n || ''; b.querySelector('b').hidden = !n; b.setAttribute('aria-label', 'Approvals' + (n ? ', ' + n + ' waiting' : '')); }
    document.title = n ? `(${n}) Approval needed · ${title}` : title;
  }
  // One entry per id; an older snapshot (slow poll, stream tick from before a decision) never overrides a newer record.
  function take(j) {
    const byId = new Map();
    for (const a of [...j.pending, ...j.recent]) {
      const prev = known.get(a.id), best = prev && String(prev.updatedAt) > String(a.updatedAt) ? prev : a;
      known.set(a.id, best); byId.set(a.id, best);
    }
    const list = [...byId.values()];
    data = { progress: j.progress !== undefined ? j.progress : data?.progress, pending: list.filter((a) => a.status === 'pending').sort((a, b) => b.id - a.id), recent: list.filter((a) => a.status !== 'pending').sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 6) };
    failed = '';
    const first = !seen, arrived = seen ? data.pending.filter((a) => !seen.has(a.id)) : [];
    seen = seen || new Set();
    data.pending.forEach((a) => seen.add(a.id));
    arrived.forEach((a) => { const id = String(a.id); fresh.add(id); setTimeout(() => { fresh.delete(id); document.querySelectorAll(`[data-card="${id}"]`).forEach((c) => c.classList.remove('ap-new')); paint(); }, 12000); });
    if (arrived.length) cfg.toast?.('PM Tech needs your approval');
    badge();
    if (arrived.length || (first && data.pending.length)) chime();
  }
  // One request at a time; a call made while one is running queues exactly one more, so nothing is missed.
  function refresh() {
    if (!on) return Promise.resolve();
    if (loading) { again = true; return loading; }
    return (loading = (async () => {
      try { take(await request()); } catch (e) { failed = e.message; if (e.status === 403) { refused = true; stop(); } }
      loading = null; paint();
      if (again) { again = false; refresh(); }
    })());
  }
  async function decide(id, decision) {
    if (busy[id]) return;
    const note = (drafts[id] || '').trim();
    errors[id] = decision === 'changes' && !note ? 'Write what to change first.' : '';
    if (errors[id]) { paint(); return document.getElementById('ap-' + id)?.focus(); }
    if (decision === 'reject' && !confirm('Reject this request? PM Tech will stop this step.')) return;
    busy[id] = decision; paint();
    try {
      take(await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, decision, note }) }));
      delete drafts[id]; cfg.toast?.(decision === 'approve' ? 'Approved. PM Tech is continuing.' : decision === 'reject' ? 'Rejected. PM Tech was told to stop.' : 'Feedback sent to PM Tech.');
    } catch (e) { errors[id] = e.message; cfg.toast?.(e.message); }
    delete busy[id]; paint(); refresh();
  }
  document.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.note) drafts[e.target.dataset.note] = e.target.value; });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ap]'); if (b) return decide(Number(b.dataset.id), b.dataset.ap);
    const j = e.target.closest('.ap-jump'); if (!j) return;
    const el = j.parentElement.querySelector('[data-approvals]'); if (!el) return;
    const c = [...el.querySelectorAll('.ap-new')].find((n) => !inView(n, scroller(el)));
    c?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    j.hidden = true;
  });
  document.addEventListener('scroll', (e) => { if (fresh.size && e.target.classList?.contains('drawer-in')) e.target.querySelectorAll('[data-approvals]').forEach(pill); }, { capture: true, passive: true });

  // Live connection (kept while the tab is in the background, so the sound still rings) + polling: every 30 s while the stream is healthy, 10 s when it is not.
  let on = false, source = null, healthy = false, heard = 0, polled = 0, timer = 0;
  function connect() {
    if (!on || source || !window.EventSource) return;
    source = new EventSource('/api/approvals?stream=1'); heard = Date.now();
    source.onmessage = (e) => { heard = Date.now(); healthy = true; try { take(JSON.parse(e.data)); } catch { return; } paint(); };
    source.addEventListener('ping', () => { heard = Date.now(); healthy = true; });
    source.addEventListener('problem', () => { heard = Date.now(); healthy = false; });
    // a normal 45 s rotation reconnects by itself; a refused connection (CLOSED) is retried by the timer
    source.onerror = () => { if (source?.readyState === EventSource.CLOSED) disconnect(); };
  }
  function disconnect() { source?.close(); source = null; healthy = false; }
  function tick() {
    const now = Date.now(), live = healthy && now - heard < 15000;
    if (source && now - heard > 30000) disconnect();   // silent socket: start a new one
    connect();
    if (now - polled >= (live ? 30000 : 10000) - 500) { polled = now; refresh(); }
  }
  function wake() { if (!on || document.hidden) return; connect(); polled = Date.now(); refresh(); }
  let woke = 0;
  const focus = () => { if (Date.now() - woke > 1000) { woke = Date.now(); wake(); } };   // focus + visibility fire together
  const events = [[document, 'pointerup', unlock], [document, 'keydown', unlock], [document, 'touchend', unlock], [document, 'visibilitychange', wake], [window, 'focus', focus], [window, 'online', wake], [window, 'pageshow', focus], [window, 'pagehide', disconnect]];
  function stop() {
    on = false; document.title = title; clearInterval(timer); disconnect(); events.forEach(([t, n, f]) => t.removeEventListener(n, f));
    const b = document.getElementById('btn-approvals'); if (b) b.style.display = 'none';
  }
  let refused = false;
  window.VApprovals = {
    start(o) {
      cfg = o || {}; if (on || refused) return;
      on = true; events.forEach(([t, n, f]) => t.addEventListener(n, f));
      timer = setInterval(tick, 5000); polled = Date.now(); refresh(); connect();
    },
    paint: () => { paint(); refresh(); },
  };
})();
