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

    // profile_context is saved as JSON text: {"general_rules": "...", "products": [{"name","price","props":{"Colors":"..."}}]}.
    // Older plain-text profiles open as General Rules with no products.
    function parse(txt) {
      try {
        const j = JSON.parse(txt);
        if (j && typeof j === 'object' && !Array.isArray(j) && ('general_rules' in j || Array.isArray(j.products))) {
          return { rules: String(j.general_rules || ''), products: (j.products || []).map((p) => ({ name: String(p.name || ''), price: p.price == null ? '' : String(p.price), props: Object.entries(p.props || {}).map(([k, v]) => [k, String(v)]) })) };
        }
      } catch (e) { /* plain text */ }
      return { rules: txt || '', products: [] };
    }

    const KEYS = ['Colors', 'Stock', 'Size', 'Storage', 'Brand', 'Description', 'Warranty'];
    const propRow = (k, v) => `<div class="va-prop"><input class="input" data-k list="va-keys" placeholder="Property (e.g. Colors)" value="${esc(k)}" maxlength="40"><input class="input" data-v placeholder="Value (e.g. Black, Blue)" value="${esc(v)}" maxlength="200"><button class="va-x" type="button" data-rmprop aria-label="Remove property">×</button></div>`;
    const prodCard = (p) => `<div class="va-prod"><div class="va-prodhead"><input class="input" data-name placeholder="Product name (e.g. iPhone 16)" value="${esc(p.name)}" maxlength="80"><input class="input va-price" data-price placeholder="Price (e.g. $999)" value="${esc(p.price)}" maxlength="30"><button class="va-x" type="button" data-rmprod aria-label="Remove product">×</button></div><div class="va-props">${p.props.map(([k, v]) => propRow(k, v)).join('')}</div><button class="pick" type="button" data-addprop>+ Add property</button></div>`;

    function form(b) {
      const init = b ? parse(b.profile_context) : { rules: '', products: [] };
      show(back + `<h3 class="va-h">${b ? 'Edit ' + esc(b.name) : 'Add new business'}</h3>
        <div class="field"><label for="va-name">Business name</label><input class="input" id="va-name" maxlength="80" value="${b ? esc(b.name) : ''}" placeholder="e.g. Tech Store Hamra"></div>
        <div class="field"><label for="va-rules">General Rules &amp; Info</label><textarea class="input" id="va-rules" rows="6" maxlength="3000" placeholder="Location, opening hours, delivery rules, payment methods, tone of voice…">${esc(init.rules)}</textarea></div>
        <p class="label" style="margin:14px 0 6px">Inventory Builder</p>
        <datalist id="va-keys">${KEYS.map((k) => `<option value="${k}">`).join('')}</datalist>
        <div id="va-prods"></div>
        <button class="btn" type="button" id="va-addprod">+ Add Product</button>
        <p class="help">The receptionist only knows what is here. Anything missing, it tells the customer the team will call back.</p>
        <div class="row"><button class="btn primary" type="button" id="va-save">Save</button>${b ? '<button class="btn danger" type="button" id="va-del">Delete business</button>' : ''}</div>`);
      $('#va-back').onclick = list;
      const box = $('#va-prods');
      const read = () => [...box.querySelectorAll('.va-prod')].map((c) => ({
        name: c.querySelector('[data-name]').value.trim(), price: c.querySelector('[data-price]').value.trim(),
        props: [...c.querySelectorAll('.va-prop')].map((r) => [r.querySelector('[data-k]').value.trim(), r.querySelector('[data-v]').value.trim()]),
      }));
      const draw = (list2) => { box.innerHTML = list2.map(prodCard).join(''); };
      draw(init.products);
      $('#va-addprod').onclick = () => { const cur = read(); cur.push({ name: '', price: '', props: [] }); draw(cur); const n = box.querySelectorAll('[data-name]'); n[n.length - 1].focus(); };
      box.onclick = (e) => {
        const card = e.target.closest('.va-prod'); if (!card) return;
        if (e.target.closest('[data-rmprod]')) { card.remove(); return; }
        if (e.target.closest('[data-addprop]')) { card.querySelector('.va-props').insertAdjacentHTML('beforeend', propRow('', '')); const k = card.querySelectorAll('[data-k]'); k[k.length - 1].focus(); return; }
        const rp = e.target.closest('[data-rmprop]'); if (rp) rp.closest('.va-prop').remove();
      };
      $('#va-save').onclick = async () => {
        const products = read().filter((p) => p.name).map((p) => {
          const props = {}; p.props.forEach(([k, v]) => { if (k && v) props[k] = v; });
          const o = { name: p.name }; if (p.price) o.price = p.price; if (Object.keys(props).length) o.props = props; return o;
        });
        const rules = $('#va-rules').value.trim();
        if (!rules && !products.length) { toast('Add some rules or at least one product.'); return; }
        const profile_context = JSON.stringify({ general_rules: rules, products });
        if (profile_context.length > 8000) { toast('Too much text (' + profile_context.length + '/8000). Shorten it.'); return; }
        const body = { name: $('#va-name').value, profile_context };
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
