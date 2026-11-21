// Client Portal (admin-voice.html): login, Items (fixed fields + unlimited custom columns per item), Orders (Done / Cancel).
// Talks only to /api/client/* on this host; the server derives the business from the signed session cookie, so nothing here can reach another owner's data.
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let me = null, items = [], orders = [], filter = 'pending', editing = null, timer = null, imgVal = '';

  async function api(path, opt) {
    opt = opt || {};
    const r = await fetch('/api/client/' + path, { method: opt.method || (opt.body ? 'POST' : 'GET'), headers: opt.body ? { 'Content-Type': 'application/json' } : {}, body: opt.body ? JSON.stringify(opt.body) : undefined, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Something went wrong'); e.status = r.status; e.code = j.code; throw e; }
    return j;
  }
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2800); }

  // ---------------- login: show/hide password
  (function pwToggle() {
    const t = $('#pw-toggle'); t.addEventListener('click', () => { const show = $('#password').type === 'password'; $('#password').type = show ? 'text' : 'password'; t.setAttribute('aria-pressed', show ? 'true' : 'false'); t.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); });
  })();

  // ---------------- login / session
  function showLogin(msg) { clearInterval(timer); $('#app').hidden = true; $('#login').hidden = false; $('#login-err').textContent = msg || ''; $('#email').removeAttribute('aria-invalid'); $('#password').removeAttribute('aria-invalid'); $('#password').value = ''; $('#password').type = 'password'; $('#pw-toggle').setAttribute('aria-pressed', 'false'); }
  function showApp() {
    $('#login').hidden = true; $('#app').hidden = false;
    $('#biz').textContent = me.business_name; document.title = me.business_name + ' · Voice AI + POS';
    const pill = $('#sub-pill'); pill.className = 'pill ' + (me.state === 'expiring' ? 'expiring' : 'active');
    pill.textContent = me.state === 'expiring' ? '⚠ ' + me.days_left + ' day' + (me.days_left === 1 ? '' : 's') + ' left · contact VAgent to renew' : me.days_left + ' days left';
    $('#live').href = me.voice_link;
    loadItems(); loadOrders();
    clearInterval(timer); timer = setInterval(() => { if (!document.hidden && !$('#tab-orders').hidden) loadOrders(true); }, 20000);
  }
  async function boot() {
    try { me = await api('me'); showApp(); } catch (e) { showLogin(e.status === 401 ? '' : e.message); }
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const b = $('#login-btn'), em = $('#email'), pw = $('#password'); em.removeAttribute('aria-invalid'); pw.removeAttribute('aria-invalid'); $('#login-err').textContent = ''; if (!em.value.trim() || !pw.value) { const bad = !em.value.trim() ? em : pw; bad.setAttribute('aria-invalid', 'true'); $('#login-err').textContent = !em.value.trim() ? 'Enter your email address.' : 'Enter your password.'; bad.focus(); return; } b.disabled = true; b.textContent = 'Signing in…';
    try { await api('login', { body: { email: $('#email').value, password: $('#password').value } }); await boot(); }
    catch (err) { $('#login-err').textContent = err.message; $('#email').setAttribute('aria-invalid', 'true'); $('#password').setAttribute('aria-invalid', 'true'); } finally { b.disabled = false; b.textContent = 'Sign in'; }
  });
  $('#logout').addEventListener('click', async () => { try { await api('logout', { body: {} }); } catch (e) { /* ignore */ } me = null; showLogin(''); });
  const onAuthError = (e) => { if (e.status === 401 || e.code === 'subscription') { showLogin(e.message); return true; } return false; };

  // ---------------- tabs
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
    $('#tab-items').hidden = t.dataset.tab !== 'items'; $('#tab-orders').hidden = t.dataset.tab !== 'orders';
    if (t.dataset.tab === 'orders') loadOrders(true);
  }));

  // ---------------- items
  // thumbnail (rounded square) with a placeholder icon when there is no picture; the url was validated by the server (https link or small data:image upload)
  const thumb = (u) => '<span class="thumb">' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '<span class="ph" aria-hidden="true"></span>') + '</span>';
  const money = (v) => '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const customKeys = () => { const ks = []; items.forEach((i) => Object.keys(i.custom_fields || {}).forEach((k) => { if (!ks.includes(k)) ks.push(k); })); return ks; };
  function drawItems() {
    const t = $('#items-table'), ks = customKeys(); $('#items-empty').hidden = items.length > 0; t.hidden = !items.length;
    t.innerHTML = '<thead><tr><th>Image</th><th>Name</th><th>Price</th><th>Quantity</th><th>Available</th>' + ks.map((k) => '<th>' + esc(k) + '</th>').join('') + '<th></th></tr></thead><tbody>'
      + items.map((i) => '<tr data-id="' + i.id + '"><td data-label="Image">' + thumb(i.image_url) + '</td><td data-label="Name"><b>' + esc(i.name) + '</b></td><td data-label="Price">' + money(i.price) + '</td><td data-label="Quantity">' + esc(i.quantity) + '</td>'
        + '<td data-label="Available"><span class="chip ' + (i.available ? 'yes' : 'no') + '">' + (i.available ? 'Yes' : 'No') + '</span></td>'
        + ks.map((k) => { const v = (i.custom_fields || {})[k]; return '<td data-label="' + esc(k) + '">' + (v === undefined || v === '' ? '<span class="dash">—</span>' : esc(v)) + '</td>'; }).join('')
        + '<td class="act"><button class="btn" type="button" data-edit>Edit</button> <button class="btn cancel" type="button" data-del>Delete</button></td></tr>').join('') + '</tbody>';
    t.querySelectorAll('tr[data-id]').forEach((tr) => {
      const it = items.find((x) => String(x.id) === tr.dataset.id);
      tr.querySelector('[data-edit]').onclick = () => openModal(it);
      tr.querySelector('[data-del]').onclick = async () => {
        if (!confirm('Delete "' + it.name + '"? Your Voice AI will stop selling it.')) return;
        try { await api('items?id=' + it.id, { method: 'DELETE' }); items = items.filter((x) => x.id !== it.id); drawItems(); toast('Deleted'); } catch (e) { if (!onAuthError(e)) toast(e.message); }
      };
    });
  }
  async function loadItems() { try { items = await api('items'); drawItems(); } catch (e) { if (!onAuthError(e)) toast(e.message); } }

  function xrow(k, v) {
    const r = document.createElement('div'); r.className = 'xrow';
    r.innerHTML = '<input class="k" list="keys" maxlength="40" placeholder="Column name (e.g. Color)" aria-label="Column name"><input class="v" maxlength="300" placeholder="Value (e.g. Black)" aria-label="Value"><button type="button" aria-label="Remove field">×</button>';
    r.querySelector('.k').value = k || ''; r.querySelector('.v').value = v || ''; r.querySelector('button').onclick = () => r.remove(); return r;
  }
  function openModal(it) {
    editing = it || null; $('#modal-title').textContent = it ? 'Edit item' : 'Add item'; $('#item-err').textContent = '';
    setImage(it && it.image_url ? it.image_url : '', ''); $('#i-file').value = '';
    $('#i-name').value = it ? it.name : ''; $('#i-price').value = it ? it.price : ''; $('#i-qty').value = it ? it.quantity : ''; $('#i-avail').checked = it ? !!it.available : true;
    $('#keys').innerHTML = customKeys().map((k) => '<option value="' + esc(k) + '">').join('');
    const box = $('#i-extra'); box.innerHTML = ''; Object.entries(it ? it.custom_fields || {} : {}).forEach(([k, v]) => box.appendChild(xrow(k, v)));
    $('#modal').hidden = false; $('#i-name').focus();
  }
  const closeModal = () => { $('#modal').hidden = true; editing = null; };
  $('#add-item').addEventListener('click', () => openModal(null));
  $('#cancel-item').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
  $('#add-field').addEventListener('click', () => { const r = xrow('', ''); $('#i-extra').appendChild(r); r.querySelector('.k').focus(); });
  // ---- image: upload (resized to max 400px + compressed in the browser, so it stays small in Neon) or paste a link
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
  $('#i-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return; $('#i-info').textContent = 'Compressing…'; $('#i-info').classList.remove('bad');
    try { const r = await compress(f); setImage(r.url, 'Ready · ' + r.w + '×' + r.h + ' · ' + Math.round(r.url.length * 0.75 / 1024) + ' KB'); } catch (err) { setImage(imgVal, err.message, true); }
    e.target.value = '';
  });
  $('#i-url').addEventListener('input', (e) => {
    const v = e.target.value.trim(); if (!v) { setImage('', ''); return; }
    if (!/^https:\/\/\S{4,1900}$/i.test(v)) { imgVal = ''; $('#i-info').textContent = 'Use a link that starts with https://'; $('#i-info').classList.add('bad'); $('img', prev).hidden = true; $('.ph', prev).hidden = false; $('#i-remove').hidden = false; return; }
    imgVal = v; const im = $('img', prev); im.hidden = false; $('.ph', prev).hidden = true; im.src = v; $('#i-remove').hidden = false; $('#i-info').textContent = 'Link added'; $('#i-info').classList.remove('bad');
  });
  $('img', prev).addEventListener('error', () => { if (imgVal && /^https:/i.test(imgVal)) { $('#i-info').textContent = 'That link did not load a picture. It will still be saved.'; $('#i-info').classList.add('bad'); } });
  $('#i-remove').addEventListener('click', () => setImage('', 'Removed'));

  $('#item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const custom = {}; document.querySelectorAll('#i-extra .xrow').forEach((r) => { const k = r.querySelector('.k').value.trim(); if (k) custom[k] = r.querySelector('.v').value.trim(); });
    const body = { name: $('#i-name').value, price: $('#i-price').value, quantity: $('#i-qty').value, available: $('#i-avail').checked, custom_fields: custom, image_url: imgVal };
    try {
      if (editing) { const r = await api('items', { method: 'PUT', body: { ...body, id: editing.id } }); items = items.map((x) => (x.id === r.id ? r : x)); }
      else { const r = await api('items', { body }); items.push(r); items.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())); }
      closeModal(); drawItems(); toast('Saved');
    } catch (err) { if (!onAuthError(err)) $('#item-err').textContent = err.message; }
  });

  // ---------------- orders (only two actions: Done, Cancel)
  const FILTERS = [['pending', 'Pending'], ['done', 'Done'], ['canceled', 'Canceled'], ['all', 'All']];
  function drawOrders() {
    $('#order-filter').innerHTML = FILTERS.map(([k, l]) => '<button type="button" data-f="' + k + '" class="' + (filter === k ? 'on' : '') + '">' + l + (k === 'pending' ? ' (' + orders.filter((o) => o.status === 'pending').length + ')' : '') + '</button>').join('');
    $('#order-filter').querySelectorAll('button').forEach((b) => (b.onclick = () => { filter = b.dataset.f; drawOrders(); }));
    const n = orders.filter((o) => o.status === 'pending').length, c = $('#pending-count'); c.hidden = !n; c.textContent = n;
    const list = orders.filter((o) => filter === 'all' || o.status === filter); $('#orders-empty').hidden = list.length > 0;
    const box = $('#orders');
    box.innerHTML = list.map((o) => {
      const wa = String(o.customer_phone || '').replace(/\D/g, '');
      return '<article class="order ' + esc(o.status) + '" data-id="' + o.id + '"><h3><span>' + esc(o.customer_name || 'Customer') + '</span><span class="chip ' + esc(o.status) + '">' + esc(o.status) + '</span></h3>'
        + '<div class="sum">' + esc(o.items_summary) + '</div>'
        + '<div class="meta">📞 ' + (wa ? '<a href="tel:+' + wa + '">' + esc(o.customer_phone) + '</a> · <a href="https://wa.me/' + wa + '" target="_blank" rel="noopener">WhatsApp</a>' : '—') + '</div>'
        + '<div class="meta">📍 ' + esc(o.delivery_address || '—') + '</div>' + (o.notes ? '<div class="meta">📝 ' + esc(o.notes) + '</div>' : '')
        + '<div class="meta">🕒 ' + esc(new Date(o.created_at).toLocaleString()) + '</div>'
        + (o.status === 'pending' ? '<div class="btns"><button class="btn done" type="button" data-s="done">✓ Done</button><button class="btn cancel" type="button" data-s="canceled">✕ Cancel</button></div>' : '') + '</article>';
    }).join('');
    box.querySelectorAll('.order').forEach((card) => card.querySelectorAll('[data-s]').forEach((b) => (b.onclick = async () => {
      const id = Number(card.dataset.id), s = b.dataset.s;
      if (s === 'canceled' && !confirm('Cancel this order?')) return;
      try { const r = await api('orders', { method: 'PUT', body: { id, status: s } }); orders = orders.map((x) => (x.id === r.id ? r : x)); drawOrders(); toast(s === 'done' ? 'Marked as done' : 'Order canceled'); } catch (e) { if (!onAuthError(e)) toast(e.message); }
    })));
  }
  async function loadOrders(quiet) { try { orders = await api('orders'); drawOrders(); } catch (e) { if (!onAuthError(e) && !quiet) toast(e.message); } }
  $('#refresh').addEventListener('click', () => loadOrders());

  boot();
})();
