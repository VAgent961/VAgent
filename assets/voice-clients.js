// Customers & Clients: the one-page dashboard in the (wide) Voice Receptionist drawer (HQ owners only).
// VoiceClients.mount(element, { api, toast, esc }) - helpers come from office.js. Talks to /api/accounts (owner session): list, create, +30 days, cancel, reveal password.
// KPI cards filter the list, search narrows it, the list is always sorted fewest days left first. Palette: warm VAgent editorial (see .vcd in office.css).
(function () {
  const FILTERS = { all: () => true, active: (a) => a.state === 'active', expiring: (a) => a.state === 'expiring', dead: (a) => a.state === 'expired' || a.state === 'canceled' };
  const LABEL = { active: 'Active', expiring: 'Expiring Soon', expired: 'Expired', canceled: 'Canceled' };
  const d0 = (t, y) => { try { return new Date(t).toLocaleDateString('en-US', y ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' }); } catch (e) { return ''; } };
  const ICON = { copy: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>', ext: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>' };

  function reminder(a) {   // renewal reminder, English + Arabic, opened in WhatsApp (wa.me)
    const dead = a.state === 'expired' || a.state === 'canceled', end = d0(a.subscription_end, true);
    const en = dead ? `Hi ${a.business_name}, your Voice AI subscription ended on ${end}. Reply here and we will renew it so your AI agent keeps answering your customers.`
      : `Hi ${a.business_name}, your Voice AI subscription ends in ${a.days_left} day${a.days_left === 1 ? '' : 's'} (${end}). Reply here to renew so your AI agent keeps answering your customers.`;
    const ar = dead ? `مرحبا ${a.business_name}، انتهى اشتراكك بخدمة Voice AI بتاريخ ${end}. ردّ على هالرسالة منجدّدلك ياه.`
      : `مرحبا ${a.business_name}، اشتراكك بخدمة Voice AI بينتهي بعد ${a.days_left} يوم (${end}). ردّ على هالرسالة لنجدّدلك ياه.`;
    return en + '\n\n' + ar;
  }
  const genPw = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789', a = new Uint32Array(10); crypto.getRandomValues(a); return Array.from(a, (n) => c[n % c.length]).join(''); };

  function mount(el, c) {
    const { api, toast, esc } = c; let rows = [], q = '', fil = 'all'; const pw = new Map();
    el.classList.add('vcd');
    el.innerHTML = `
      <div class="vcd-kpis" role="group" aria-label="Filter clients"></div>
      <div class="vcd-tools"><input class="vcd-search" type="search" placeholder="Search name, email, phone or slug…" aria-label="Search clients"><button class="vcd-cta" type="button" data-new aria-expanded="false">+ New Client</button></div>
      <form class="vcd-new" hidden autocomplete="off">
        <h3>New client</h3>
        <div class="vcd-fgrid">
          <label>Business name<input name="business_name" maxlength="80" required placeholder="e.g. Tech Store Hamra"></label>
          <label>Slug / subdomain<input name="slug" maxlength="30" required placeholder="voice1" pattern="[a-z0-9][a-z0-9\\-]{1,28}[a-z0-9]"><small>voice.vagent.online/<b class="vcd-slug">slug</b> · <b class="vcd-slug">slug</b>.vagent.online</small></label>
          <label>Client email (their login)<input name="email" type="email" maxlength="200" required></label>
          <label>Password<span class="vcd-pw"><input name="password" maxlength="100" required minlength="6"><button type="button" data-gen>Generate</button></span></label>
          <label>WhatsApp number (with country code)<input name="phone" maxlength="30" placeholder="96103123456"></label>
          <label>Subscription days<input name="days" type="number" min="1" max="3650" value="30"></label>
        </div>
        <p class="vcd-err" role="alert"></p>
        <div class="vcd-frow"><button type="submit" class="vcd-cta">Create account</button><button type="button" class="vcd-ghost" data-close>Cancel</button></div>
      </form>
      <div class="vcd-grid"><p class="vcd-empty">Loading…</p></div>`;
    const $ = (s) => el.querySelector(s), $$ = (s) => [...el.querySelectorAll(s)];
    const f = $('.vcd-new');
    const toggleNew = (open) => { f.hidden = !open; $('[data-new]').setAttribute('aria-expanded', open); if (open) f.business_name.focus(); };
    $('[data-new]').onclick = () => toggleNew(f.hidden); f.querySelector('[data-close]').onclick = () => toggleNew(false);
    f.slug.addEventListener('input', () => { const v = f.slug.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); f.slug.value = v; $$('.vcd-slug').forEach((x) => (x.textContent = v || 'slug')); });
    f.querySelector('[data-gen]').onclick = () => { f.password.value = genPw(); };
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const err = $('.vcd-err'); err.textContent = '';
      try { await api('accounts', { body: { business_name: f.business_name.value, slug: f.slug.value, email: f.email.value, password: f.password.value, phone: f.phone.value, days: f.days.value } }); toast('Client created'); f.reset(); toggleNew(false); load(); }
      catch (x) { err.textContent = x.message; }
    });
    $('.vcd-search').addEventListener('input', (e) => { q = e.target.value; draw(); });

    const copy = async (btn, text, what) => {
      try { await navigator.clipboard.writeText(text); } catch (e) { prompt('Copy:', text); }
      btn.classList.add('ok'); btn.setAttribute('aria-label', 'Copied!'); clearTimeout(btn._t); btn._t = setTimeout(() => { btn.classList.remove('ok'); btn.setAttribute('aria-label', 'Copy ' + what); }, 1500);
    };
    const digits = (t) => String(t || '').replace(/\D/g, '');
    function visible() {   // KPI filter + search together, always the fewest days left first
      const s = q.trim().toLowerCase(), sd = digits(s);
      return rows.filter((a) => FILTERS[fil](a) && (!s || [a.business_name, a.email, a.slug].some((v) => String(v || '').toLowerCase().includes(s)) || (sd.length > 1 && digits(a.phone).includes(sd))))
        .sort((x, y) => x.days_left - y.days_left || Date.parse(x.subscription_end) - Date.parse(y.subscription_end) || x.business_name.localeCompare(y.business_name));
    }
    const row = (label, inner, wide) => `<div class="vcd-i${wide ? ' wide' : ''}"><span class="vcd-l">${label}</span><div class="vcd-v">${inner}</div></div>`;
    const cbtn = (text, what) => `<button class="vcd-copy" type="button" data-copy="${esc(text)}" data-what="${what}" aria-label="Copy ${what}" title="Copy ${what}">${ICON.copy}<span class="vcd-ok" aria-hidden="true">Copied!</span></button>`;
    const link = (url) => `<a class="vcd-url" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(url)}">${esc(url.replace('https://', ''))}</a>`;
    function card(a) {
      const hot = a.state === 'expiring' || a.state === 'expired', wa = digits(a.phone), left = a.days_left;
      const pill = a.state === 'canceled' ? 'Canceled' : a.state === 'expired' ? 'Ended ' + Math.abs(left) + ' day' + (Math.abs(left) === 1 ? '' : 's') + ' ago' : left + ' day' + (left === 1 ? '' : 's') + ' left';
      const waBtn = wa ? `<a class="vcd-btn ${hot ? 'primary' : ''}" href="https://wa.me/${wa}?text=${encodeURIComponent(reminder(a))}" target="_blank" rel="noopener noreferrer">WhatsApp Reminder</a>` : `<button class="vcd-btn" type="button" disabled title="No WhatsApp number saved">WhatsApp Reminder</button>`;
      return `<article class="vcd-card ${esc(a.state)}" data-id="${a.id}">
        <header><div class="vcd-name"><h3>${esc(a.business_name)}</h3><span class="vcd-badge ${esc(a.state)}">${LABEL[a.state]}</span></div>
          <div class="vcd-days ${esc(a.state)}"><b>${pill}</b><small>${d0(a.subscription_start)} → ${d0(a.subscription_end, true)}</small></div></header>
        ${hot ? `<div class="vcd-alert ${esc(a.state)}">${a.state === 'expired' ? 'Subscription expired — the agent is offline' : left + ' day' + (left === 1 ? '' : 's') + ' left — send renewal reminder'}</div>` : ''}
        <div class="vcd-info">
          ${row('Voice Link', link(a.voice_link) + cbtn(a.voice_link, 'voice link'))}
          ${row('Custom Domain', a.custom_link ? link(a.custom_link) + cbtn(a.custom_link, 'custom domain') : '<span class="vcd-none">Not set</span>')}
          ${row('Admin Login', `<span class="vcd-t" title="${esc(a.email)}">${esc(a.email)}</span>` + cbtn(a.email, 'email'))}
          ${row('Password', `<code class="vcd-t vcd-pwv">••••••••</code><button class="vcd-mini" type="button" data-show aria-pressed="false">Show</button><button class="vcd-copy" type="button" data-pwcopy aria-label="Copy password" title="Copy password">${ICON.copy}<span class="vcd-ok" aria-hidden="true">Copied!</span></button>`)}
          ${row('WhatsApp', wa ? `<span class="vcd-t">${esc(a.phone)}</span>` + cbtn(a.phone, 'phone number') : '<span class="vcd-t vcd-none">No number saved</span>', true)}
        </div>
        <footer>${waBtn}<button class="vcd-btn" type="button" data-extend>+30 Days</button>${a.state === 'canceled' ? '<span class="vcd-sp"></span>' : '<button class="vcd-cancel" type="button" data-cancel aria-label="Cancel account">Cancel</button>'}</footer>
      </article>`;
    }
    function draw() {
      const n = (k) => rows.filter(FILTERS[k]).length;
      const K = [['all', 'Total Clients', 'Total'], ['active', 'Active', 'Active'], ['expiring', 'Expiring Soon (≤2d)', 'Expiring'], ['dead', 'Expired / Canceled', 'Expired']];
      $('.vcd-kpis').innerHTML = K.map(([k, long, short]) => `<button type="button" class="vcd-kpi ${k}" data-f="${k}" aria-pressed="${fil === k}"><b>${n(k)}</b><span class="l-long">${long}</span><span class="l-short">${short}</span></button>`).join('');
      $$('.vcd-kpi').forEach((b) => (b.onclick = () => { fil = fil === b.dataset.f ? 'all' : b.dataset.f; draw(); }));
      const list = visible(), box = $('.vcd-grid');
      box.innerHTML = list.length ? list.map(card).join('') : `<p class="vcd-empty">${rows.length ? 'No clients match your search or filter.' : 'No clients yet. Press + New Client.'}</p>`;
      box.querySelectorAll('.vcd-card').forEach((cd) => {
        const a = rows.find((x) => String(x.id) === cd.dataset.id);
        cd.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copy(b, b.dataset.copy, b.dataset.what)));
        const secret = async () => { if (!pw.has(a.id)) pw.set(a.id, (await api('accounts', { query: 'reveal=' + a.id })).password); return pw.get(a.id); };
        cd.querySelector('[data-show]').onclick = async (e) => { const b = e.currentTarget, v = cd.querySelector('.vcd-pwv'), show = b.getAttribute('aria-pressed') !== 'true'; try { v.textContent = show ? await secret() : '••••••••'; b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-pressed', show); } catch (x) { toast(x.message); } };
        cd.querySelector('[data-pwcopy]').onclick = async (e) => { const b = e.currentTarget; try { await copy(b, await secret(), 'password'); } catch (x) { toast(x.message); } };
        cd.querySelector('[data-extend]').onclick = async () => { try { const r = await api('accounts', { method: 'PUT', body: { id: a.id, action: 'extend' } }); rows = rows.map((x) => (x.id === r.id ? r : x)); draw(); toast('+30 days added · ' + r.days_left + ' days left'); } catch (x) { toast(x.message); } };
        const cb = cd.querySelector('[data-cancel]');
        if (cb) cb.onclick = async () => { if (!confirm('Cancel ' + a.business_name + '? They can no longer log in and their Voice AI goes offline right away.')) return; try { const r = await api('accounts', { method: 'PUT', body: { id: a.id, action: 'cancel' } }); rows = rows.map((x) => (x.id === r.id ? r : x)); draw(); toast('Account canceled'); } catch (x) { toast(x.message); } };
      });
    }
    async function load() { try { rows = await api('accounts'); draw(); } catch (e) { $('.vcd-grid').innerHTML = `<p class="vcd-empty">${esc(e.message)}</p>`; } }
    load();
  }
  window.VoiceClients = { mount };
})();
