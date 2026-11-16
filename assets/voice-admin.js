// Manage tab of the Voice Receptionist panel: add / edit / delete the businesses it answers for, and read their saved orders.
// VoiceAdmin.mount(element, { api, toast, esc, ago }) - helpers come from office.js (via voice-agent.js).
(function () {
  function mount(el, c) {
    const { api, toast, esc, ago } = c;
    const $ = (s) => el.querySelector(s);
    const show = (html) => { el.innerHTML = html; };
    const back = '<button class="btn" type="button" id="va-back" style="margin-bottom:10px">← All clients</button>';

    async function list() {
      show('<p class="help">Businesses your Voice Receptionist answers for. Pick one in the Test Call tab to try it.</p><button class="btn primary" type="button" id="va-new" style="margin:8px 0">+ Add new business</button><div class="items" id="va-list"><p class="empty">Loading…</p></div>');
      $('#va-new').onclick = () => form();
      let rows;
      try { rows = await api('businesses'); } catch (e) { $('#va-list').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
      $('#va-list').innerHTML = rows.length ? rows.map((b) => `<div class="item" style="display:block" data-id="${esc(b.id)}">
        <b style="font-weight:600">${esc(b.name)}</b> <small style="color:var(--muted)">· ${b.orders} order${b.orders === 1 ? '' : 's'} · id ${esc(b.id)}</small>
        <div class="chips"><button class="pick" type="button" data-orders>📋 Orders</button><button class="pick" type="button" data-edit>✎ Edit</button></div></div>`).join('')
        : '<p class="empty">No businesses yet. Add your first one.</p>';
      el.querySelectorAll('[data-id]').forEach((el) => {
        const b = rows.find((x) => x.id === el.dataset.id);
        el.querySelector('[data-orders]').onclick = () => orders(b);
        el.querySelector('[data-edit]').onclick = () => form(b);
      });
    }

    function form(b) {
      show(back + `<h3 class="va-h">${b ? 'Edit ' + esc(b.name) : 'Add new business'}</h3>
        <div class="field"><label for="va-name">Business name</label><input class="input" id="va-name" maxlength="80" value="${b ? esc(b.name) : ''}" placeholder="e.g. Café Zaytoun"></div>
        <div class="field"><label for="va-ctx">What the receptionist knows</label><textarea class="input" id="va-ctx" rows="14" maxlength="8000" placeholder="Location, opening hours, delivery rules, the full menu with prices (USD), booking rules, payment methods…">${b ? esc(b.profile_context) : ''}</textarea></div>
        <p class="help">It only uses this text. If something is missing it tells the customer the team will call back, so put every price and rule here.</p>
        <div class="row"><button class="btn primary" type="button" id="va-save">Save</button>${b ? '<button class="btn danger" type="button" id="va-del">Delete business</button>' : ''}</div>`);
      $('#va-back').onclick = list;
      $('#va-save').onclick = async () => {
        const body = { name: $('#va-name').value, profile_context: $('#va-ctx').value };
        try { if (b) await api('businesses', { method: 'PUT', body: { ...body, id: b.id } }); else await api('businesses', { body }); toast('Saved'); list(); }
        catch (e) { toast(e.message); }
      };
      if (b) $('#va-del').onclick = async () => {
        if (!confirm('Delete ' + b.name + ' and all its saved orders? This cannot be undone.')) return;
        try { await api('businesses', { method: 'DELETE', query: 'id=' + encodeURIComponent(b.id) }); toast('Deleted'); list(); } catch (e) { toast(e.message); }
      };
    }

    async function orders(b) {
      show(back + `<h3 class="va-h">📋 ${esc(b.name)} orders</h3><div class="items" id="va-orders"><p class="empty">Loading…</p></div>`);
      $('#va-back').onclick = list;
      let rows;
      try { rows = await api('orders', { query: 'business_id=' + encodeURIComponent(b.id) }); } catch (e) { $('#va-orders').innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
      $('#va-orders').innerHTML = rows.length ? rows.map((o) => `<div class="item" style="display:block" data-oid="${esc(o.id)}">
        <small style="color:var(--muted)">${esc(ago(o.at))} · ${esc(new Date(o.at).toLocaleString())}</small>
        <div style="font-weight:600;margin:2px 0">${esc(o.order_summary)}</div><div>${esc(o.customer_details || '')}</div>
        <div class="chips"><button class="pick" type="button" data-rm>Delete</button></div></div>`).join('')
        : '<p class="empty">No orders yet. They appear here after a customer confirms one on a call.</p>';
      el.querySelectorAll('[data-oid]').forEach((el) => {
        el.querySelector('[data-rm]').onclick = async () => {
          if (!confirm('Delete this order?')) return;
          try { await api('orders', { method: 'DELETE', query: 'id=' + encodeURIComponent(el.dataset.oid) }); el.remove(); } catch (e) { toast(e.message); }
        };
      });
    }

    list();
  }
  window.VoiceAdmin = { mount };
})();
