// "Clients & Accounts" tab of the Voice Receptionist panel (HQ owners only): create client accounts, see credentials + days left, WhatsApp reminders, +30 days, cancel.
// VoiceClients.mount(element, { api, toast, esc }) - helpers come from office.js. Talks to /api/accounts (owner session).
(function () {
  const ADMIN_URL = 'https://adminvoice.vagent.online';
  const LABEL = { active: 'Active', expiring: 'Expiring Soon', expired: 'Expired', canceled: 'Canceled' };
  const fmt = (t) => { try { return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } };

  function reminder(a) {   // renewal reminder, English + Arabic, opened in WhatsApp (wa.me)
    const en = a.state === 'expired' || a.state === 'canceled'
      ? `Hi ${a.business_name}, your Voice AI subscription ended on ${fmt(a.subscription_end)}. Reply here and we will renew it so your AI agent keeps answering your customers.`
      : `Hi ${a.business_name}, your Voice AI subscription ends in ${a.days_left} day${a.days_left === 1 ? '' : 's'} (${fmt(a.subscription_end)}). Reply here to renew so your AI agent keeps answering your customers.`;
    const ar = a.state === 'expired' || a.state === 'canceled'
      ? `مرحبا ${a.business_name}، انتهى اشتراكك بخدمة Voice AI بتاريخ ${fmt(a.subscription_end)}. ردّ على هالرسالة منجدّدلك ياه.`
      : `مرحبا ${a.business_name}، اشتراكك بخدمة Voice AI بينتهي بعد ${a.days_left} يوم (${fmt(a.subscription_end)}). ردّ على هالرسالة لنجدّدلك ياه.`;
    return en + '\n\n' + ar;
  }
  const genPw = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789', a = new Uint32Array(10); crypto.getRandomValues(a); return Array.from(a, (n) => c[n % c.length]).join(''); };

  function mount(el, c) {
    const { api, toast, esc } = c; let rows = [], q = '', fil = 'all';
    const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast((what || 'Copied') + ' copied'); } catch (e) { prompt('Copy:', text); } };
    function shell() {
      el.innerHTML = `<p class="help">Voice AI customers, fewest days left first. Each one gets a login at <b>adminvoice.vagent.online</b> and a public call link. Expired or canceled accounts are blocked and their agent goes offline.</p>
        <div class="va-tools"><input class="input va-search" type="search" placeholder="Search name, email, phone or slug…" aria-label="Search clients"><details class="va-new"><summary class="btn primary" style="display:inline-flex">+ New Client</summary>
        <form class="va-cform" autocomplete="off">
          <div class="field"><label>Business name</label><input class="input" name="business_name" maxlength="80" required placeholder="e.g. Tech Store Hamra"></div>
          <div class="field"><label>Slug / subdomain</label><input class="input" name="slug" maxlength="30" required placeholder="voice1" pattern="[a-z0-9][a-z0-9\\-]{1,28}[a-z0-9]"><small>Link: voice.vagent.online/<b class="va-slug">slug</b> · <b class="va-slug">slug</b>.vagent.online</small></div>
          <div class="field"><label>Client email (their login)</label><input class="input" name="email" type="email" maxlength="200" required></div>
          <div class="field"><label>Password</label><div class="va-pw"><input class="input" name="password" maxlength="100" required minlength="6"><button class="btn" type="button" data-gen>Generate</button></div></div>
          <div class="field"><label>WhatsApp number (with country code)</label><input class="input" name="phone" maxlength="30" placeholder="96103123456"></div>
          <div class="field"><label>Subscription days</label><input class="input" name="days" type="number" min="1" max="3650" value="30"></div>
          <p class="va-err" role="alert"></p><button class="btn primary" type="submit">Create account</button>
        </form></details></div>
        <div class="va-pills" role="group" aria-label="Filter by status"></div>
        <div class="va-clist"><p class="empty">Loading…</p></div>`;
      el.querySelector('.va-search').addEventListener('input', (e) => { q = e.target.value; draw(); });
      const f = el.querySelector('.va-cform');
      f.slug.addEventListener('input', () => { const v = f.slug.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); f.slug.value = v; el.querySelectorAll('.va-slug').forEach((x) => (x.textContent = v || 'slug')); });
      f.querySelector('[data-gen]').onclick = () => { f.password.value = genPw(); };
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); const err = el.querySelector('.va-err'); err.textContent = '';
        try { await api('accounts', { body: { business_name: f.business_name.value, slug: f.slug.value, email: f.email.value, password: f.password.value, phone: f.phone.value, days: f.days.value } }); toast('Client created'); f.reset(); el.querySelector('.va-new').open = false; load(); }
        catch (x) { err.textContent = x.message; }
      });
    }
    function card(a) {
      const hot = a.state === 'expiring' || a.state === 'expired', wa = String(a.phone || '').replace(/\D/g, '');
      const waBtn = (label) => wa ? `<a class="btn ${hot ? 'primary' : ''}" data-wa href="https://wa.me/${wa}?text=${encodeURIComponent(reminder(a))}" target="_blank" rel="noopener noreferrer">${label}</a>` : `<button class="btn" type="button" disabled title="No WhatsApp number saved">${label}</button>`;
      return `<article class="va-ccard ${hot ? 'hot' : ''} ${a.state === 'canceled' ? 'off' : ''}" data-id="${a.id}">
        <div class="va-chead"><b>${esc(a.business_name)}</b><span class="va-state ${esc(a.state)}">${LABEL[a.state]}</span></div>
        <div class="va-days"><b>${a.state === 'canceled' ? '—' : a.days_left}</b> <span>${a.state === 'canceled' ? 'canceled' : 'day' + (a.days_left === 1 ? '' : 's') + ' left'}</span><small>${fmt(a.subscription_start)} → ${fmt(a.subscription_end)}</small></div>
        <dl class="va-dl">
          <dt>Voice link</dt><dd><a href="${esc(a.voice_link)}" target="_blank" rel="noopener">${esc(a.voice_link.replace('https://', ''))}</a> <button class="va-mini" data-copy="${esc(a.voice_link)}">copy</button></dd>
          <dt>Own address</dt><dd><a href="${esc(a.custom_link)}" target="_blank" rel="noopener">${esc(a.custom_link.replace('https://', ''))}</a></dd>
          <dt>Admin login</dt><dd>${esc(a.email)} <button class="va-mini" data-copy="${esc(a.email)}">copy</button></dd>
          <dt>Password</dt><dd><code class="va-pwv">••••••••</code> <button class="va-mini" data-show>show</button> <button class="va-mini" data-pwcopy>copy</button></dd>
          <dt>WhatsApp</dt><dd>${wa ? esc(a.phone) : '<em>none</em>'}</dd>
        </dl>
        ${hot ? `<div class="va-warn">${a.state === 'expired' ? 'Subscription expired — agent is offline.' : a.days_left + ' day' + (a.days_left === 1 ? '' : 's') + ' left — time to remind.'}</div>` : ''}
        <div class="va-cbtns">${hot ? waBtn('💬 WhatsApp Reminder') : waBtn('💬 WhatsApp')}<button class="btn" type="button" data-extend>+30 Days</button>${a.state === 'canceled' ? '' : '<button class="btn cancel" type="button" data-cancel>Cancel Account</button>'}</div>
      </article>`;
    }
    const PILLS = [['all', 'All'], ['active', 'Active'], ['expiring', 'Expiring Soon (≤2 days)'], ['expired', 'Expired'], ['canceled', 'Canceled']];
    const digits = (t) => String(t || '').replace(/\D/g, '');
    function visible() {   // search + status filter together, always sorted from the fewest days left to the most
      const s = q.trim().toLowerCase(), sd = digits(s);
      return rows.filter((a) => (fil === 'all' || a.state === fil) && (!s || [a.business_name, a.email, a.slug].some((v) => String(v || '').toLowerCase().includes(s)) || (sd.length > 1 && digits(a.phone).includes(sd))))
        .sort((x, y) => x.days_left - y.days_left || Date.parse(x.subscription_end) - Date.parse(y.subscription_end) || x.business_name.localeCompare(y.business_name));
    }
    function draw() {
      const pills = el.querySelector('.va-pills');
      pills.innerHTML = PILLS.map(([k, l]) => `<button type="button" data-f="${k}" class="${fil === k ? 'on' : ''}">${l} <small>${k === 'all' ? rows.length : rows.filter((a) => a.state === k).length}</small></button>`).join('');
      pills.querySelectorAll('button').forEach((b) => (b.onclick = () => { fil = b.dataset.f; draw(); }));
      const list = visible(), box = el.querySelector('.va-clist');
      box.innerHTML = list.length ? list.map(card).join('') : `<p class="empty">${rows.length ? 'No clients match your search or filter.' : 'No clients yet. Press + New Client above.'}</p>`;
      box.querySelectorAll('.va-ccard').forEach((cd) => {
        const a = rows.find((x) => String(x.id) === cd.dataset.id);
        cd.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copy(b.dataset.copy)));
        const pw = async () => (await api('accounts', { query: 'reveal=' + a.id })).password;
        cd.querySelector('[data-show]').onclick = async (e) => { const v = cd.querySelector('.va-pwv'); if (e.target.textContent === 'hide') { v.textContent = '••••••••'; e.target.textContent = 'show'; return; } try { v.textContent = await pw(); e.target.textContent = 'hide'; } catch (x) { toast(x.message); } };
        cd.querySelector('[data-pwcopy]').onclick = async () => { try { copy(await pw(), 'Password'); } catch (x) { toast(x.message); } };
        cd.querySelector('[data-extend]').onclick = async () => { try { const r = await api('accounts', { method: 'PUT', body: { id: a.id, action: 'extend' } }); rows = rows.map((x) => (x.id === r.id ? r : x)); draw(); toast('+30 days added · ' + r.days_left + ' days left'); } catch (x) { toast(x.message); } };
        const cb = cd.querySelector('[data-cancel]');
        if (cb) cb.onclick = async () => { if (!confirm('Cancel ' + a.business_name + '? They can no longer log in and their Voice AI goes offline right away.')) return; try { const r = await api('accounts', { method: 'PUT', body: { id: a.id, action: 'cancel' } }); rows = rows.map((x) => (x.id === r.id ? r : x)); draw(); toast('Account canceled'); } catch (x) { toast(x.message); } };
      });
    }
    async function load() { try { rows = await api('accounts'); draw(); } catch (e) { el.querySelector('.va-clist').innerHTML = `<p class="empty">${esc(e.message)}</p>`; } }
    shell(); load();
  }
  window.VoiceClients = { mount };
})();
