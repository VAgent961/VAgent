// Client Portal (admin-voice.html): login, Items (fixed fields + unlimited custom columns per item), Orders (Done / Cancel).
// Talks only to /api/client/* on this host; the server derives the business from the signed session cookie, so nothing here can reach another owner's data.
// Visuals + motion live in assets/vx.css and assets/admin-voice.css (transform/opacity only, reduced-motion safe).
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let me = null, items = [], orders = [], filter = 'pending', editing = null, timer = null, imgVal = '', itemsLoaded = false, ordersLoaded = false, query = '', firstDraw = true, flashItem = null;
  const ic = (d, s) => '<svg viewBox="0 0 24 24" width="' + (s || 16) + '" height="' + (s || 16) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';

  async function api(path, opt) {
    opt = opt || {};
    const r = await fetch('/api/client/' + path, { method: opt.method || (opt.body ? 'POST' : 'GET'), headers: opt.body ? { 'Content-Type': 'application/json' } : {}, body: opt.body ? JSON.stringify(opt.body) : undefined, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Something went wrong'); e.status = r.status; e.code = j.code; throw e; }
    return j;
  }

  // ---------------- toasts: stack bottom-right, slide in, auto-dismiss
  function toast(msg, type) {
    const box = $('#toasts'), t = document.createElement('div'); t.className = 'vx-toast ' + (type || 'success'); t.setAttribute('role', 'status');
    t.innerHTML = '<span class="ti">' + (type === 'error' ? ic('<path d="M12 8v5M12 16.5v.01"/>', 14) : type === 'info' ? ic('<path d="M12 11v5M12 7.5v.01"/>', 14) : ic('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 14)) + '</span><span>' + esc(msg) + '</span>';
    box.appendChild(t); while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 220); }, type === 'error' ? 4500 : 2800);
  }

  // ---------------- tab indicator (1px element moved with translateX + scaleX)
  function slide(nav) {
    const on = $('.tab.on', nav), ind = $('.ind', nav); if (!on || !ind) return;
    ind.style.transform = 'translateX(' + on.offsetLeft + 'px) scaleX(' + on.offsetWidth + ')';
  }
  const slideAll = () => $$('.vx-tabs').forEach((n) => { if (n.offsetParent) slide(n); });
  window.addEventListener('resize', (window.VPerf ? VPerf.debounce(slideAll) : slideAll));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(slideAll);

  // ---------------- count-up for the KPI numbers
  function countTo(el, to) {
    const from = Number(el.dataset.v || 0); el.dataset.v = to;
    if (reduce() || from === to || !el.isConnected) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 600;
    (function step(t) { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); })(t0);
  }
  function kpis() {
    if (itemsLoaded) { countTo($('#k-items'), items.length); countTo($('#k-stock'), items.filter((i) => i.available && Number(i.quantity) > 0).length); }
    if (ordersLoaded) { countTo($('#k-pending'), orders.filter((o) => o.status === 'pending').length); countTo($('#k-done'), orders.filter((o) => o.status === 'done').length); }
  }

  // ---------------- modal helpers: scrim blur fades in, sheet scales in
  function openDlg(el) { el.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open'))); el._opener = document.activeElement; }
  function closeDlg(el) { el.classList.remove('open'); el.classList.add('closing'); setTimeout(() => { el.classList.remove('closing'); el.hidden = true; if (el._opener && el._opener.focus) el._opener.focus(); }, reduce() ? 0 : 240); }
  function confirmDlg(title, text, yes, no) {
    return new Promise((resolve) => {
      const d = $('#confirm'); $('#cf-title').textContent = title; $('#cf-text').textContent = text; $('#cf-yes').textContent = yes || 'Delete'; $('#cf-no').textContent = no || 'Keep it';
      const done = (v) => { d.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey); closeDlg(d); resolve(v); };
      const onClick = (e) => { if (e.target === d) done(false); else if (e.target.closest('#cf-no')) done(false); else if (e.target.closest('#cf-yes')) done(true); };
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      d.addEventListener('click', onClick); document.addEventListener('keydown', onKey); openDlg(d); setTimeout(() => $('#cf-no').focus(), 60);
    });
  }

  // ---------------- login showcase: a call becomes an order row, on a loop (all inside its frame)
  (function showcase() {
    const stage = $('.sh-stage'), wave = $('#sh-wave'), say = $('#sh-say'), lines = $('#sh-lines'), chip = $('#sh-chip'), total = $('#sh-total'), time = $('#sh-time'), oid = $('#sh-ord-id');
    wave.innerHTML = Array.from({ length: 36 }, (_, i) => '<i style="--i:' + i + ';--h:' + (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + 1))).toFixed(2) + '"></i>').join('');
    const calls = [
      { say: 'Two shawarma and a mint lemonade, please.', dir: 'ltr', id: 1042, rows: [['2 × Shawarma', 9.0], ['1 × Mint lemonade', 3.5]] },
      { say: 'بدي كيلو ورق عنب وتبولة، توصيل عالحمرا.', dir: 'rtl', id: 1043, rows: [['1 kg Grape leaves', 12.0], ['1 × Tabbouleh', 5.5]] },
      { say: 'Do you have the blue one in a medium?', dir: 'ltr', id: 1044, rows: [['1 × T-shirt, blue, M', 24.0], ['1 × Delivery', 2.0]] },
    ];
    let k = 0, run = 0;
    const wait = (ms, tok) => new Promise((res) => setTimeout(() => res(tok === run), ms));
    const money = (v) => '$' + v.toFixed(2);
    async function cycle() {
      const tok = ++run, c = calls[k % calls.length]; k++;
      stage.classList.remove('talk', 'fill'); lines.innerHTML = ''; chip.textContent = 'New'; chip.className = 'sh-chip'; total.textContent = '$0.00'; say.textContent = ''; say.dir = c.dir; oid.textContent = 'Order #' + c.id; time.textContent = '0:00';
      if (!(await wait(500, tok))) return;
      stage.classList.add('talk'); const t0 = Date.now(), tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); time.textContent = '0:0' + Math.min(9, s); }, 500);
      for (let i = 1; i <= c.say.length; i++) { say.textContent = c.say.slice(0, i); if (!(await wait(reduce() ? 0 : 42, tok))) { clearInterval(tick); return; } }
      clearInterval(tick); if (!(await wait(500, tok))) return;
      stage.classList.remove('talk'); stage.classList.add('fill');
      lines.innerHTML = c.rows.map((r) => '<li><span>' + esc(r[0]) + '</span><span>' + money(r[1]) + '</span></li>').join('');
      let sum = 0; const li = $$('li', lines);
      for (let i = 0; i < li.length; i++) { if (!(await wait(380, tok))) return; li[i].classList.add('on'); sum += c.rows[i][1]; total.textContent = money(sum); }
      if (!(await wait(900, tok))) return; chip.textContent = 'Confirmed'; chip.className = 'sh-chip done';
      if (!(await wait(3200, tok))) return; cycle();
    }
    const guard = () => { if (!$('#login').hidden && !document.hidden) { if (!stage.dataset.on) { stage.dataset.on = '1'; cycle(); } } else if (stage.dataset.on) { stage.dataset.on = ''; run++; } };
    if (reduce()) { // a still frame: the finished order
      const c = calls[0]; say.textContent = c.say; lines.innerHTML = c.rows.map((r) => '<li class="on"><span>' + esc(r[0]) + '</span><span>' + money(r[1]) + '</span></li>').join(''); total.textContent = money(12.5); chip.textContent = 'Confirmed'; chip.className = 'sh-chip done'; stage.classList.add('fill'); return;
    }
    setInterval(guard, 700); document.addEventListener('visibilitychange', guard);
  })();

  // ---------------- login: show/hide password
  $('#pw-toggle').addEventListener('click', () => { const t = $('#pw-toggle'), show = $('#password').type === 'password'; $('#password').type = show ? 'text' : 'password'; t.setAttribute('aria-pressed', show ? 'true' : 'false'); t.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); });

  // ---------------- login / session
  function loginError(msg, fields) {
    const e = $('#login-err'); e.textContent = msg; $('#login-form').classList.remove('vx-shake'); void $('#login-form').offsetWidth; if (msg) $('#login-form').classList.add('vx-shake');
    ['#email', '#password'].forEach((s) => { if (!fields || fields.includes(s)) { if (msg) $(s).setAttribute('aria-invalid', 'true'); else $(s).removeAttribute('aria-invalid'); } });
  }
  function showLogin(msg) { clearInterval(timer); $('#app').hidden = true; $('#login').hidden = false; $('#email').removeAttribute('aria-invalid'); $('#password').removeAttribute('aria-invalid'); $('#login-err').textContent = msg || ''; $('#password').value = ''; $('#password').type = 'password'; $('#pw-toggle').setAttribute('aria-pressed', 'false'); items = []; orders = []; itemsLoaded = ordersLoaded = false; }
  function reveal(sel) { $$(sel).forEach((el, i) => { el.classList.remove('vx-in'); void el.offsetWidth; el.style.setProperty('--d', i); el.classList.add('vx-in'); }); }
  function showApp() {
    $('#login').hidden = true; $('#app').hidden = false;
    $('#biz').textContent = me.business_name; document.title = me.business_name + ' · Voice AI + POS';
    const pill = $('#sub-pill'), exp = me.state === 'expiring';
    pill.className = 'vx-chip ' + (exp ? 'warn' : 'ok'); $('#sub-txt').textContent = exp ? 'Agent live · ' + me.days_left + ' day' + (me.days_left === 1 ? '' : 's') + ' left, contact VAgent to renew' : 'Agent live · ' + me.days_left + ' days left';
    $('#live').href = me.voice_link;
    reveal('.top-in, .kpis, .main-tabs, .panel:not([hidden])');
    firstDraw = true; renderSkeleton(); renderOrderSkeleton(); drawFilter();
    loadItems(); loadOrders();
    requestAnimationFrame(slideAll);
    clearInterval(timer); timer = setInterval(() => { if (!document.hidden && !$('#tab-orders').hidden) loadOrders(true); }, 20000);
  }
  async function boot() {
    try { me = await api('me'); showApp(); } catch (e) { showLogin(e.status === 401 ? '' : e.message); }
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const b = $('#login-btn'), em = $('#email'), pw = $('#password'); loginError('');
    if (!em.value.trim() || !pw.value) { const bad = !em.value.trim() ? em : pw; loginError(!em.value.trim() ? 'Enter your email address.' : 'Enter your password.', ['#' + bad.id]); bad.focus(); return; }
    b.disabled = true; b.classList.add('is-loading');
    try { await api('login', { body: { email: em.value, password: pw.value } }); await boot(); }
    catch (err) { loginError(err.message); }
    finally { b.disabled = false; b.classList.remove('is-loading'); }
  });
  $('#logout').addEventListener('click', async () => { try { await api('logout', { body: {} }); } catch (e) { /* ignore */ } me = null; showLogin(''); });
  $('#copy-link').addEventListener('click', async () => {
    const u = me && me.voice_link; if (!u) return;
    try { await navigator.clipboard.writeText(u); toast('Link copied'); } catch (e) { const t = document.createElement('textarea'); t.value = u; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast('Link copied'); } catch (x) { toast('Could not copy the link', 'error'); } t.remove(); }
  });
  const onAuthError = (e) => { if (e.status === 401 || e.code === 'subscription') { showLogin(e.message); return true; } return false; };

  // ---------------- main tabs
  $$('#main-tabs .tab').forEach((t) => t.addEventListener('click', () => {
    $$('#main-tabs .tab').forEach((x) => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
    const ti = $('#tab-items'), to = $('#tab-orders'); ti.hidden = t.dataset.tab !== 'items'; to.hidden = t.dataset.tab !== 'orders';
    const shown = t.dataset.tab === 'items' ? ti : to; shown.classList.remove('swap'); void shown.offsetWidth; shown.classList.add('swap');
    slide($('#main-tabs')); if (t.dataset.tab === 'orders') { slide($('#order-filter')); loadOrders(true); }
  }));

  // ---------------- items
  // thumbnail (rounded square) with a placeholder icon when there is no picture; the url was validated by the server (https link or small data:image upload)
  const thumb = (u) => '<span class="thumb">' + (u ? '<img src="' + esc(u) + '" alt="" width="44" height="44" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '<span class="ph" aria-hidden="true"></span>') + '</span>';
  const money = (v) => '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const customKeys = () => { const ks = []; items.forEach((i) => Object.keys(i.custom_fields || {}).forEach((k) => { if (!ks.includes(k)) ks.push(k); })); return ks; };
  function renderSkeleton() {
    const t = $('#items-table'); $('#items-empty').hidden = true; t.hidden = true;
    let sk = $('#items-sk'); if (!sk) { sk = document.createElement('div'); sk.id = 'items-sk'; $('#items-wrap').appendChild(sk); }
    sk.hidden = false; sk.innerHTML = Array.from({ length: 5 }, () => '<div class="sk-row"><div class="vx-sk"></div><div class="vx-sk l1"></div><div class="vx-sk l2"></div><div class="vx-sk l3"></div></div>').join('');
  }
  function drawItems() {
    const sk = $('#items-sk'); if (sk) sk.hidden = true;
    const t = $('#items-table'), q = query.trim().toLowerCase();
    const list = q ? items.filter((i) => (i.name + ' ' + Object.entries(i.custom_fields || {}).map(([k, v]) => k + ' ' + v).join(' ')).toLowerCase().includes(q)) : items;
    const none = !list.length; $('#items-empty').hidden = !none; t.hidden = none; $('#items-wrap').hidden = none;
    if (none) { t.innerHTML = ''; $('#items-empty-t').textContent = q ? 'No items match “' + q + '”' : 'No items yet'; $('#items-empty-p').textContent = q ? 'Try a different name or clear the search.' : 'Add your first item so your Voice AI can sell it.'; return; }
    t.innerHTML = '<thead><tr><th>Item</th><th></th><th class="num">Price</th><th class="num">Quantity</th><th>Available</th><th>Details</th><th></th></tr></thead><tbody>'
      + list.map((i, n) => {
        const cf = Object.entries(i.custom_fields || {}).filter(([k]) => k);
        const tags = cf.length ? '<div class="tags">' + cf.map(([k, v]) => '<span class="tag" title="' + esc(k + ': ' + v) + '"><em>' + esc(k) + '</em>' + (v === '' || v == null ? '—' : esc(v)) + '</span>').join('') + '</div>' : '<span class="dash">—</span>';
        return '<tr data-id="' + i.id + '" class="' + (firstDraw ? 'row-in' : '') + (String(flashItem) === String(i.id) ? ' flash' : '') + '" style="--d:' + Math.min(n, 12) + '"><td class="c-img">' + thumb(i.image_url) + '</td><td class="c-name nm">' + esc(i.name) + '</td><td class="c-price num">' + money(i.price) + '</td><td class="c-qty num">' + esc(i.quantity) + '</td>'
          + '<td class="c-avail"><span class="vx-chip ' + (i.available ? 'ok' : 'mute') + '">' + (i.available ? 'Available' : 'Hidden') + '</span></td><td class="c-tags">' + tags + '</td>'
          + '<td class="act"><button class="vx-btn sm" type="button" data-edit>Edit</button><button class="vx-btn sm danger" type="button" data-del>Delete</button></td></tr>';
      }).join('') + '</tbody>';
    firstDraw = false; flashItem = null;
    $$('tr[data-id]', t).forEach((tr) => {
      const it = items.find((x) => String(x.id) === tr.dataset.id);
      $('[data-edit]', tr).onclick = () => openModal(it);
      $('[data-del]', tr).onclick = async () => {
        if (!(await confirmDlg('Delete “' + it.name + '”?', 'Your Voice AI will stop selling it. This cannot be undone.', 'Delete item'))) return;
        try {
          await api('items?id=' + it.id, { method: 'DELETE' });
          tr.classList.add('row-out'); await new Promise((r) => setTimeout(r, reduce() ? 0 : 230));
          items = items.filter((x) => x.id !== it.id); drawItems(); kpis(); toast('Item deleted');
        } catch (e) { if (!onAuthError(e)) toast(e.message, 'error'); }
      };
    });
  }
  async function loadItems() { try { items = await api('items'); itemsLoaded = true; drawItems(); kpis(); } catch (e) { itemsLoaded = true; items = []; drawItems(); if (!onAuthError(e)) toast(e.message, 'error'); } }
  $('#item-search').addEventListener('input', (e) => { query = e.target.value; drawItems(); });

  function xrow(k, v) {
    const r = document.createElement('div'); r.className = 'xrow';
    r.innerHTML = '<input class="vx-input k" list="keys" maxlength="40" placeholder="Column name (e.g. Color)" aria-label="Column name" autocomplete="off"><input class="vx-input v" maxlength="300" placeholder="Value (e.g. Black)" aria-label="Value" autocomplete="off"><button type="button" aria-label="Remove field">' + ic('<path d="M18 6 6 18M6 6l12 12"/>', 16) + '</button>';
    r.querySelector('.k').value = k || ''; r.querySelector('.v').value = v || '';
    r.querySelector('button').onclick = () => { r.classList.add('out'); setTimeout(() => r.remove(), reduce() ? 0 : 190); }; return r;
  }
  function openModal(it) {
    editing = it || null; $('#modal-title').textContent = it ? 'Edit item' : 'Add item'; $('#item-err').textContent = ''; $('#save-item').textContent = it ? 'Save changes' : 'Save item';
    setImage(it && it.image_url ? it.image_url : '', ''); $('#i-file').value = '';
    $('#i-name').value = it ? it.name : ''; $('#i-price').value = it ? it.price : ''; $('#i-qty').value = it ? it.quantity : ''; $('#i-avail').checked = it ? !!it.available : true;
    $('#keys').innerHTML = customKeys().map((k) => '<option value="' + esc(k) + '">').join('');
    const box = $('#i-extra'); box.innerHTML = ''; Object.entries(it ? it.custom_fields || {} : {}).forEach(([k, v]) => box.appendChild(xrow(k, v)));
    openDlg($('#modal')); setTimeout(() => $('#i-name').focus(), 80);
  }
  const closeModal = () => { closeDlg($('#modal')); editing = null; };
  $('#add-item').addEventListener('click', () => openModal(null));
  $('#cancel-item').addEventListener('click', closeModal); $('#x-item').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal').classList.contains('open') && $('#confirm').hidden) closeModal(); });
  $('#add-field').addEventListener('click', () => { const r = xrow('', ''); $('#i-extra').appendChild(r); r.querySelector('.k').focus(); });
  // ---- image: upload / drop (resized to max 400px + compressed in the browser, so it stays small in Neon) or paste a link
  const prev = $('#i-prev');
  function setImage(v, info, bad) {
    imgVal = v || ''; const im = $('img', prev), ph = $('.ph', prev); im.hidden = !imgVal; ph.hidden = !!imgVal; if (imgVal) im.src = imgVal; else im.removeAttribute('src');
    $('#i-remove').hidden = !imgVal; $('#i-url').value = /^https:/i.test(imgVal) ? imgVal : ''; const i = $('#i-info'); i.textContent = info || ''; i.classList.toggle('bad', !!bad);
  }
  async function compress(file) {
    if (!/^image\//.test(file.type)) throw new Error('Choose an image file.');
    if (file.size > 20e6) throw new Error('That file is too large (max 20 MB).');
    let bmp; try { bmp = await createImageBitmap(file); } catch (e) { throw new Error('Could not read that image.'); }
    for (const max of [400, 320, 240]) {
      const sc = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * sc)), h = Math.max(1, Math.round(bmp.height * sc));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h);
      for (const [type, q] of [['image/webp', 0.82], ['image/webp', 0.68], ['image/jpeg', 0.72], ['image/jpeg', 0.55], ['image/jpeg', 0.4]]) { const u = c.toDataURL(type, q); if (u.startsWith('data:' + type) && u.length <= 110000) return { url: u, w, h }; }
    }
    throw new Error('That picture is too detailed to shrink enough. Try another one.');
  }
  async function takeFile(f) {
    if (!f) return; $('#i-info').textContent = 'Compressing…'; $('#i-info').classList.remove('bad');
    try { const r = await compress(f); setImage(r.url, 'Ready · ' + r.w + '×' + r.h + ' · ' + Math.round(r.url.length * 0.75 / 1024) + ' KB'); } catch (err) { setImage(imgVal, err.message, true); }
  }
  $('#i-file').addEventListener('change', async (e) => { await takeFile(e.target.files && e.target.files[0]); e.target.value = ''; });
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((n) => drop.addEventListener(n, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => takeFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));
  $('#i-url').addEventListener('input', (e) => {
    const v = e.target.value.trim(); if (!v) { setImage('', ''); return; }
    if (!/^https:\/\/\S{4,1900}$/i.test(v)) { imgVal = ''; $('#i-info').textContent = 'Use a link that starts with https://'; $('#i-info').classList.add('bad'); $('img', prev).hidden = true; $('.ph', prev).hidden = false; $('#i-remove').hidden = false; return; }
    imgVal = v; const im = $('img', prev); im.hidden = false; $('.ph', prev).hidden = true; im.src = v; $('#i-remove').hidden = false; $('#i-info').textContent = 'Link added'; $('#i-info').classList.remove('bad');
  });
  $('img', prev).addEventListener('error', () => { if (imgVal && /^https:/i.test(imgVal)) { $('#i-info').textContent = 'That link did not load a picture. It will still be saved.'; $('#i-info').classList.add('bad'); } });
  $('#i-remove').addEventListener('click', () => setImage('', 'Removed'));

  $('#item-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const sb = $('#save-item');
    if (!$('#i-name').value.trim() || $('#i-price').value === '' || $('#i-qty').value === '') { const bad = !$('#i-name').value.trim() ? $('#i-name') : $('#i-price').value === '' ? $('#i-price') : $('#i-qty'); bad.setAttribute('aria-invalid', 'true'); $('#item-err').textContent = 'Fill in the name, price and quantity.'; bad.focus(); bad.addEventListener('input', () => bad.removeAttribute('aria-invalid'), { once: true }); return; }
    const custom = {}; $$('#i-extra .xrow').forEach((r) => { const k = r.querySelector('.k').value.trim(); if (k) custom[k] = r.querySelector('.v').value.trim(); });
    const body = { name: $('#i-name').value, price: $('#i-price').value, quantity: $('#i-qty').value, available: $('#i-avail').checked, custom_fields: custom, image_url: imgVal };
    sb.disabled = true; sb.classList.add('is-loading'); $('#item-err').textContent = '';
    try {
      let saved;
      if (editing) { saved = await api('items', { method: 'PUT', body: { ...body, id: editing.id } }); items = items.map((x) => (x.id === saved.id ? saved : x)); }
      else { saved = await api('items', { body }); items.push(saved); items.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())); }
      const was = !!editing; closeModal(); flashItem = saved.id; drawItems(); kpis(); toast(was ? 'Changes saved' : 'Item added');
    } catch (err) { if (!onAuthError(err)) { $('#item-err').textContent = err.message; toast(err.message, 'error'); } }
    finally { sb.disabled = false; sb.classList.remove('is-loading'); }
  });

  // ---------------- orders (only two actions: Done, Cancel)
  const FILTERS = [['all', 'All'], ['pending', 'Pending'], ['done', 'Done'], ['canceled', 'Canceled']];
  const countOf = (k) => (k === 'all' ? orders.length : orders.filter((o) => o.status === k).length);
  function drawFilter() {
    const box = $('#order-filter'); $$('.tab', box).forEach((b) => b.remove());
    FILTERS.forEach(([k, l]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tab' + (filter === k ? ' on' : ''); b.dataset.f = k; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', filter === k ? 'true' : 'false'); b.innerHTML = l + '<small class="vx-num">' + (ordersLoaded ? countOf(k) : '') + '</small>';
      b.onclick = () => { filter = k; drawFilter(); drawOrders(true); }; box.insertBefore(b, $('.ind', box)); });
    slide(box);
  }
  function renderOrderSkeleton() { $('#orders-empty').hidden = true; $('#orders').innerHTML = Array.from({ length: 3 }, () => '<div class="vx-sk sk-card"></div>').join(''); }
  const flag = (d) => ic(d, 16);
  function orderCard(o, n) {
    const wa = String(o.customer_phone || '').replace(/\D/g, '');
    return '<article class="order" data-id="' + o.id + '" style="--d:' + Math.min(n, 8) + '"><h3><span>' + esc(o.customer_name || 'Customer') + '</span><span class="vx-chip ' + (o.status === 'done' ? 'ok' : o.status === 'pending' ? 'warn' : 'mute') + '">' + (o.status === 'done' ? 'Done' : o.status === 'pending' ? 'Pending' : 'Canceled') + '</span></h3>'
      + '<div class="sum">' + esc(o.items_summary) + '</div>'
      + '<div class="meta">' + flag('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>') + '<span>' + (wa ? '<a href="tel:+' + wa + '">' + esc(o.customer_phone) + '</a> · <a href="https://wa.me/' + wa + '" target="_blank" rel="noopener">WhatsApp</a>' : '—') + '</span></div>'
      + '<div class="meta">' + flag('<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>') + '<span>' + esc(o.delivery_address || '—') + '</span></div>'
      + (o.notes ? '<div class="meta">' + flag('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>') + '<span>' + esc(o.notes) + '</span></div>' : '')
      + '<div class="meta">' + flag('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>') + '<span class="vx-num">' + esc(new Date(o.created_at).toLocaleString()) + '</span></div>'
      + (o.status === 'pending' ? '<div class="btns"><button class="vx-btn ok" type="button" data-s="done">' + ic('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 16) + 'Done</button><button class="vx-btn danger" type="button" data-s="canceled">' + ic('<path d="M18 6 6 18M6 6l12 12"/>', 16) + 'Cancel</button></div>' : '') + '</article>';
  }
  function drawOrders(swap) {
    drawFilter();
    const n = orders.filter((o) => o.status === 'pending').length, c = $('#pending-count'); c.hidden = !n; c.textContent = n; slide($('#main-tabs'));
    const list = orders.filter((o) => filter === 'all' || o.status === filter); $('#orders-empty').hidden = list.length > 0;
    const box = $('#orders'); box.classList.toggle('anim', !!swap); box.innerHTML = list.map(orderCard).join('');
    $$('.order', box).forEach((card) => {
      const id = Number(card.dataset.id);
      const act = async (s, btn) => {
        btn.classList.add('is-loading'); $$('[data-s]', card).forEach((x) => (x.disabled = true));
        try {
          const r = await api('orders', { method: 'PUT', body: { id, status: s } }); orders = orders.map((x) => (x.id === r.id ? r : x)); kpis();
          const gone = filter !== 'all' && filter !== r.status;
          if (gone) { card.classList.add('leaving'); await new Promise((res) => setTimeout(res, reduce() ? 0 : 260)); }
          drawOrders(); if (!gone) { const nc = $('.order[data-id="' + id + '"]'); if (nc) { nc.classList.add('flash'); } }
          toast(s === 'done' ? 'Order marked as done' : 'Order canceled', s === 'done' ? 'success' : 'info');
        } catch (e) { btn.classList.remove('is-loading'); $$('[data-s]', card).forEach((x) => (x.disabled = false)); if (!onAuthError(e)) toast(e.message, 'error'); }
      };
      $$('[data-s]', card).forEach((b) => (b.onclick = () => {
        if (b.dataset.s === 'done') return act('done', b);
        const btns = $('.btns', card); btns.outerHTML = '<div class="ask"><button class="vx-btn danger" type="button" data-yes>Yes, cancel order</button><button class="vx-btn" type="button" data-no>Keep it</button></div>';
        $('[data-yes]', card).onclick = (e) => act('canceled', e.currentTarget); $('[data-no]', card).onclick = () => drawOrders();
      }));
    });
  }
  async function loadOrders(quiet) { try { const first = !ordersLoaded; orders = await api('orders'); ordersLoaded = true; drawOrders(first); kpis(); } catch (e) { if (!ordersLoaded) { ordersLoaded = true; orders = []; drawOrders(true); } if (!onAuthError(e) && !quiet) toast(e.message, 'error'); } }
  $('#refresh').addEventListener('click', async (e) => { const b = e.currentTarget; b.classList.add('is-loading'); await loadOrders(); b.classList.remove('is-loading'); });

  boot();
})();
