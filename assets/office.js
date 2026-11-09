// VAgent office: live n8n workflows as agents. Working -> desk, idle/help -> café, off -> off duty.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PAL = ['#E7B38F', '#8FC79D', '#A8B8E8', '#D9C27A', '#E59A7A', '#9FD0D6', '#C8A8E0', '#B9D98F'];
  const DEPT_COLORS = ['#E7B38F', '#A8B8E8', '#8FC79D', '#D9C27A', '#E59A7A', '#9FD0D6', '#C8A8E0'];
  const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const colorOf = (k) => PAL[hash(k) % PAL.length];
  const TRIG = { webhook: 'Runs when called (webhook)', chat: 'Chat trigger', telegram: 'Telegram bot', schedule: 'Runs on a schedule', form: 'Form', helper: 'Helper for other agents', alarm: 'Error alarm', app: 'App trigger', manual: 'Manual only' };
  const STATUS = { working: 'Working', idle: 'In the café · ready', help: 'Needs help · last run failed', off: 'Off duty · turned off in n8n' };
  const ago = (t) => { if (!t) return '—'; const s = (Date.now() - Date.parse(t)) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };
  const dur = (ms) => (ms == null || isNaN(ms) ? '' : ms < 1000 ? (ms / 1000).toFixed(1) + 's' : ms < 60000 ? Math.round(ms / 1000) + 's' : Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's');
  const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let D = { agents: [], departments: [], activity: [], errors: [], instances: [] };
  const els = {}, places = {}, chats = {};
  let first = true, current = null;

  async function api(path, opt = {}) {
    const r = await fetch('/api/' + path, { method: opt.method || (opt.body ? 'POST' : 'GET'), headers: opt.body ? { 'Content-Type': 'application/json' } : {}, body: opt.body ? JSON.stringify(opt.body) : undefined });
    if (r.status === 401) { location.href = '/'; throw new Error('Signed out'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong');
    return j;
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3500); }

  // ---------- scene ----------
  $('#stage').innerHTML = VScene.svg;
  const svg = $('#scene'), free = $('#layer-free'), walkL = $('#layer-walk');
  // ---------- zoom + pan (only inside the office) ----------
  const stage = $('#stage'), VB0 = { x: 20, y: 0, w: 1400, h: 930 }, vb = { ...VB0 }, MAXZ = 3.5;
  stage.insertAdjacentHTML('beforeend', '<div class="zoom" role="group" aria-label="Zoom the office"><button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="reset" aria-label="Fit the whole office" style="font-size:14px">⤢</button></div>');
  const setVB = () => { svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h); };
  const clampVB = () => { vb.w = Math.min(VB0.w, Math.max(VB0.w / MAXZ, vb.w)); vb.h = vb.w * VB0.h / VB0.w; vb.x = Math.min(VB0.x + VB0.w - vb.w, Math.max(VB0.x, vb.x)); vb.y = Math.min(VB0.y + VB0.h - vb.h, Math.max(VB0.y, vb.y)); };
  const view = () => { const r = svg.getBoundingClientRect(), s = Math.min(r.width / vb.w, r.height / vb.h); return { s, ox: r.left + (r.width - vb.w * s) / 2, oy: r.top + (r.height - vb.h * s) / 2 }; };
  const zoomAt = (cx, cy, f, smooth) => {
    const v = view(), px = vb.x + (cx - v.ox) / v.s, py = vb.y + (cy - v.oy) / v.s, nw = Math.min(VB0.w, Math.max(VB0.w / MAXZ, vb.w / f)), k = nw / vb.w;
    const to = { x: px - (px - vb.x) * k, y: py - (py - vb.y) * k, w: nw, h: nw * VB0.h / VB0.w };
    if (smooth && window.gsap) gsap.to(vb, { ...to, duration: 0.35, ease: 'power2.out', onUpdate: () => { clampVB(); setVB(); } }); else { Object.assign(vb, to); clampVB(); setVB(); }
  };
  const center = () => { const r = svg.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  stage.addEventListener('click', (e) => { const b = e.target.closest('[data-z]'); if (!b) return; const z = b.dataset.z;
    if (z === 'reset') { if (window.gsap) gsap.to(vb, { ...VB0, duration: 0.4, ease: 'power2.out', onUpdate: setVB }); else { Object.assign(vb, VB0); setVB(); } } else zoomAt(...center(), z === 'in' ? 1.5 : 1 / 1.5, true); });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018))); }, { passive: false });
  svg.addEventListener('dblclick', (e) => { if (!e.target.closest('.agent,.lead,.add-room')) zoomAt(e.clientX, e.clientY, 1.8, true); });
  const ptrs = new Map(); let pan = null, pinch = null, dragged = false;
  svg.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, [e.clientX, e.clientY]); dragged = false;
    if (ptrs.size === 1) pan = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) }; pan = null; }
  });
  addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch.d); pinch.d = d; dragged = true; return; }
    if (pan) { const dx = e.clientX - pan.x, dy = e.clientY - pan.y; if (!dragged && Math.hypot(dx, dy) < 6) return; dragged = true; stage.classList.add('panning'); const s = view().s; vb.x = pan.vx - dx / s; vb.y = pan.vy - dy / s; clampVB(); setVB(); }
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) { pan = null; stage.classList.remove('panning'); } };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  svg.addEventListener('click', (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
  const deskG = (i) => svg.querySelector(`.desk[data-desk="${i}"]`);
  const posOf = (p) => (p.t === 'desk' ? [VScene.desks[p.i][0] + 22, VScene.desks[p.i][1] - 33] : VScene.cafe[p.i]);
  const tr = (x, y) => `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(1.1)`;

  function makeAgent(a) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'agent'); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.dataset.key = a.key;
    g.innerHTML = `<g class="body"><use href="#bot" style="color:${colorOf(a.key)}"/></g>
      <g class="bubble typing" transform="translate(27 -52)"><rect x="-15" y="-10" width="30" height="18" rx="9" fill="#FAF9F5" stroke="#E3E0D5"/><circle cx="-6" cy="-1" r="2.2" fill="#B5532F"/><circle cx="0" cy="-1" r="2.2" fill="#B5532F"/><circle cx="6" cy="-1" r="2.2" fill="#B5532F"/></g>
      <g class="bubble alert" transform="translate(18 -66)"><circle r="8" fill="#B3261E"/><text y="4" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">!</text></g>
      <g class="tag" transform="translate(0 -86)"><rect y="-12" height="22" rx="11"/><circle class="tdot" cy="-1" r="3.5"/><text y="3" text-anchor="middle"></text></g>`;
    return g;
  }
  function updateAgent(g, a) {
    g.setAttribute('class', 'agent ' + a.status);
    g.setAttribute('aria-label', a.name + ', ' + (STATUS[a.status] || a.status));
    const name = a.name.length > 22 ? a.name.slice(0, 21) + '…' : a.name, w = name.length * 6.5 + 38;
    const r = g.querySelector('.tag rect'); r.setAttribute('x', -w / 2); r.setAttribute('width', w);
    const t = g.querySelector('.tag text'); t.textContent = name; t.setAttribute('x', 6); const dt = g.querySelector('.tdot'); dt.setAttribute('cx', -w / 2 + 12); dt.setAttribute('fill', dotColor[a.status]);
  }
  svg.addEventListener('pointerover', (e) => { const g = e.target.closest('#layer-free .agent'); if (g && g.parentNode.lastChild !== g) g.parentNode.appendChild(g); });
  function attach(g, p) {
    if (p.t === 'desk') { deskG(p.i).querySelector('.seat').appendChild(g); g.setAttribute('transform', ''); }
    else { const [x, y] = posOf(p); free.appendChild(g); g.setAttribute('transform', tr(x, y)); }
    g._pos = posOf(p);
  }
  function walk(g, from, to) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!window.gsap || reduce || !from) return attach(g, to);
    const s = { x: g._pos ? g._pos[0] : posOf(from)[0], y: g._pos ? g._pos[1] : posOf(from)[1] }, [tx, ty] = posOf(to);
    walkL.appendChild(g); g.setAttribute('transform', tr(s.x, s.y));
    const body = g.querySelector('.body');
    const bob = gsap.fromTo(body, { y: 0 }, { y: -4, duration: 0.18, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.to(s, { x: tx, y: ty, duration: Math.min(3.2, Math.max(1.2, Math.hypot(tx - s.x, ty - s.y) / 230)), ease: 'power1.inOut',
      onUpdate: () => { g.setAttribute('transform', tr(s.x, s.y)); g._pos = [s.x, s.y]; },
      onComplete: () => { bob.kill(); gsap.set(body, { y: 0 }); attach(g, to); } });
  }
  function leave(g) { if (window.gsap) gsap.to(g, { opacity: 0, duration: 0.5, onComplete: () => g.remove() }); else g.remove(); }

  function renderRooms() {
    VScene.rooms.forEach((r, i) => {
      const d = D.departments[i], slot = svg.querySelector(`.lead-slot[data-room="${i}"]`), screen = svg.querySelector(`.room-screen[data-room="${i}"]`);
      screen.style.color = d ? d.color : '#3A3935';
      if (d) {
        const label = d.name + ' Lead', w = Math.min(label.length, 24) * 6.5 + 26;
        slot.innerHTML = `<g class="lead" tabindex="0" role="button" data-dept="${d.id}" aria-label="${esc(label)}"><g transform="scale(1.15)"><use href="#lead" style="color:${d.color}"/></g><g class="tag" transform="translate(0 -72)"><rect x="${-w / 2}" y="-12" width="${w}" height="22" rx="11" fill="#FAF9F5" stroke="#D8D5CB"/><text y="3" text-anchor="middle" fill="#141413">${esc(label.slice(0, 24))}</text></g></g>`;
      } else {
        slot.innerHTML = `<g class="add-room" tabindex="0" role="button" aria-label="Add a department"><g class="tag" transform="translate(0 -24)"><rect x="-56" y="-12" width="112" height="22" rx="11" fill="#FAF9F5" stroke="#B0AEA5" stroke-dasharray="4 3"/><text y="3" text-anchor="middle" fill="#5E5D59">+ Department</text></g></g>`;
      }
    });
  }

  function render() {
    const A = D.agents;
    const working = A.filter((a) => a.status === 'working'), cafe = A.filter((a) => a.status === 'idle' || a.status === 'help'), off = A.filter((a) => a.status === 'off');
    const next = {}, used = { desk: new Set(), cafe: new Set() }, over = [];
    const place = (list, t, n) => {
      for (const a of list) { const p = places[a.key]; if (p && p.t === t && !used[t].has(p.i)) { next[a.key] = p; used[t].add(p.i); } }
      for (const a of list) {
        if (next[a.key]) continue;
        let i = 0; while (i < n && used[t].has(i)) i++;
        if (i < n) { next[a.key] = { t, i }; used[t].add(i); } else over.push(a);
      }
    };
    place(working, 'desk', VScene.desks.length); place(cafe, 'cafe', VScene.cafe.length);
    svg.querySelectorAll('.desk-top').forEach((u) => (u.style.color = '#3A3935'));
    for (const a of A) {
      const p = next[a.key]; let g = els[a.key];
      if (!p) { if (g) { leave(g); delete els[a.key]; delete places[a.key]; } continue; }
      if (!g) { g = els[a.key] = makeAgent(a); updateAgent(g, a); attach(g, p); if (!first && window.gsap) gsap.from(g, { opacity: 0, duration: 0.6 }); }
      else { updateAgent(g, a); const o = places[a.key]; if (!o || o.t !== p.t || o.i !== p.i) walk(g, o, p); }
      places[a.key] = p;
      if (p.t === 'desk') deskG(p.i).querySelector('.desk-top').style.color = colorOf(a.key);
    }
    for (const k of Object.keys(els)) if (!A.find((a) => a.key === k)) { leave(els[k]); delete els[k]; delete places[k]; }
    renderRooms();
    const help = A.filter((a) => a.status === 'help').length;
    $('#n-working').textContent = working.length; $('#n-idle').textContent = cafe.length - help; $('#n-help').textContent = help;
    const bw = (n) => String(Math.max(4, Math.min(1, n / Math.max(1, A.length)) * 100)); svg.querySelector('#board-bar1').setAttribute('opacity', working.length ? 1 : 0.35); svg.querySelector('#board-bar2').setAttribute('opacity', cafe.length ? 1 : 0.35);
    $('#board-line').textContent = A.length ? working.length + ' working · ' + cafe.length + ' in café' : 'Connect n8n to start';
    const chips = [];
    if (!D.instances.length) chips.push('<button class="chip warn" type="button" data-open="settings">Connect your n8n to fill the office</button>');
    for (const e of D.errors) chips.push(`<button class="chip warn" type="button" data-open="settings">Can't reach ${esc(e.inst)}</button>`);
    if (off.length) chips.push(`<button class="chip" type="button" data-open="off">${off.length} off duty</button>`);
    if (over.length) chips.push(`<button class="chip" type="button" data-open="over">+${over.length} more inside</button>`);
    $('#chips').innerHTML = chips.join(''); render.over = over;
    $('#feed').innerHTML = D.activity.slice(0, 5).map((e) => `<li class="${/error|crashed/.test(e.status) ? 'bad' : ''}"><i class="fd ${e.status}"></i><time>${hhmm(e.at)}</time><span>${esc(e.name)} ${e.status === 'success' ? 'finished' : e.status === 'running' ? 'is working' : /error|crashed/.test(e.status) ? 'failed' : e.status}</span></li>`).join('') || '<li><span>No runs yet.</span></li>';
    const order = { working: 0, help: 1, idle: 2, off: 3 };
    $('#list').innerHTML = [...A].sort((a, b) => order[a.status] - order[b.status]).map((a) => itemAgent(a)).join('') || '<p class="empty">No agents yet. Open settings and connect your n8n.</p>';
    first = false;
  }
  const dotColor = { working: '#3F7D4E', help: '#B3261E', idle: '#B5532F', off: '#B0AEA5' };
  const itemAgent = (a) => `<button class="item" type="button" data-agent="${esc(a.key)}"><span class="sd" style="width:10px;height:10px;border-radius:50%;background:${dotColor[a.status]}"></span><span class="grow"><b>${esc(a.name)}</b><small>${esc(STATUS[a.status])} · ${esc(a.inst)}</small></span><span aria-hidden="true">›</span></button>`;

  async function load() {
    try {
      D = await api('office');
      $('#live-dot').className = 'dot ' + (D.errors.length ? 'err' : 'on'); $('#live-text').textContent = 'Live · ' + hhmm(new Date());
      render();
    } catch (e) { $('#live-dot').className = 'dot err'; $('#live-text').textContent = 'Offline, retrying'; }
  }

  // ---------- drawer ----------
  const drawer = $('#drawer'), inner = $('#drawer-in'), scrim = $('#scrim');
  function open(html, name) { current = name; inner.innerHTML = html; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); scrim.hidden = false; inner.scrollTop = 0; setTimeout(() => (inner.querySelector('[autofocus]') || $('#drawer-close')).focus(), 50); }
  function close() { current = null; drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); scrim.hidden = true; }
  const botSvg = (c, s = 40) => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="-22 -72 44 76"><use href="#bot" style="color:${c}"/></svg>`;
  const leadSvg = (c, s = 40) => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="-26 -54 52 60"><use href="#lead" style="color:${c}"/></svg>`;
  const deptName = (id) => (D.departments.find((d) => d.id === id) || {}).name;

  async function openAgent(key) {
    const a = D.agents.find((x) => x.key === key); if (!a) return;
    const head = `<div class="d-head"><span class="avatar">${botSvg(colorOf(key))}</span><div><h2 class="d-title">${esc(a.name)}</h2><div class="status ${a.status}">● ${esc(STATUS[a.status])}${a.status === 'working' && a.startedAt ? ' · for ' + dur(Date.now() - Date.parse(a.startedAt)) : ''}</div><div class="d-sub">${esc(TRIG[a.trigger] || a.trigger)} · ${esc(a.inst)} · ${a.runs24} runs today</div></div></div>`;
    open(head + '<p class="empty">Loading its work…</p>', 'agent:' + key);
    let d; try { d = await api('agent?key=' + encodeURIComponent(key)); } catch (e) { inner.innerHTML = head + `<p class="empty">${esc(e.message)}</p>`; return; }
    if (current !== 'agent:' + key) return;
    const runs = d.runs.map((r) => `<li><span class="sd ${r.status}"></span><span class="when">${r.status === 'running' ? 'Running now' : esc(r.status === 'success' ? 'Finished' : r.status)} · ${ago(r.stoppedAt || r.startedAt)}</span><span class="dur">${r.stoppedAt ? dur(Date.parse(r.stoppedAt) - Date.parse(r.startedAt)) : ''}</span></li>`).join('') || '<li class="empty">No runs yet.</li>';
    const steps = d.steps.slice(0, 10).map((s) => `<li>${esc(s)}</li>`).join('') + (d.steps.length > 10 ? `<li>+${d.steps.length - 10} more steps</li>` : '');
    const opts = '<option value="">No department</option>' + D.departments.map((x) => `<option value="${x.id}" ${x.id === d.dept ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    const talk = d.runnable
      ? `<p class="label">Talk to it</p><div class="chat" id="chat">${(chats[key] || []).map((m) => `<div class="msg ${m.me ? 'me' : 'it'}${m.bad ? ' bad' : ''}">${esc(m.t)}</div>`).join('')}</div>
         <form id="f-talk" class="row"><label class="field" style="flex:1"><span class="sr" hidden>Message</span><input class="input" name="m" placeholder="Give it a task or ask something…" required autocomplete="off"></label><button class="btn primary" style="flex:none" type="submit">Send</button></form>
         <p class="help">Your message goes to its webhook as <code>message</code>. Its answer appears here.</p>`
      : `<div class="box"><b style="font-size:14px">Want to talk to it?</b><span class="help">Add a Webhook trigger to this workflow in n8n. Then you can chat with it and give it tasks from here.</span></div>`;
    inner.innerHTML = head + talk
      + `<div class="field"><label for="dept">Department</label><select class="input" id="dept">${opts}</select></div>`
      + `<p class="label">Its steps</p><ol class="steps">${steps}</ol>`
      + `<p class="label">Recent runs</p><ul class="runs">${runs}</ul>`
      + `<div class="row"><a class="btn" href="${esc(d.link)}" target="_blank" rel="noopener">Open in n8n</a><button class="btn ${d.active ? 'danger' : ''}" type="button" id="toggle">${d.active ? 'Turn off' : 'Turn on'}</button></div>`
      + `<p class="help">Watching costs no AI: status and runs come straight from n8n.</p>`;
    $('#dept').onchange = async (e) => { try { await api('agent', { body: { key, action: 'assign', deptId: e.target.value || null } }); toast('Saved'); load(); } catch (x) { toast(x.message); } };
    $('#toggle').onclick = async () => {
      if (!confirm(d.active ? 'Turn off "' + d.name + '"? Its trigger stops until you turn it on again.' : 'Turn on "' + d.name + '"?')) return;
      try { await api('agent', { body: { key, action: d.active ? 'deactivate' : 'activate' } }); toast(d.active ? 'Turned off' : 'Turned on'); await load(); openAgent(key); } catch (x) { toast(x.message); }
    };
    const f = $('#f-talk');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault(); const m = f.m.value.trim(); if (!m) return;
      const log = (chats[key] ||= []); log.push({ me: 1, t: m }); f.m.value = '';
      const chat = $('#chat'); chat.insertAdjacentHTML('beforeend', `<div class="msg me">${esc(m)}</div><div class="msg it" id="wait">…</div>`);
      const btn = f.querySelector('button'); btn.disabled = true;
      try { const r = await api('agent', { body: { key, action: 'run', message: m } }); log.push({ t: r.output, bad: !r.ok }); $('#wait').outerHTML = `<div class="msg it${r.ok ? '' : ' bad'}">${esc(r.output)}</div>`; }
      catch (x) { $('#wait').outerHTML = `<div class="msg it bad">${esc(x.message)}</div>`; }
      btn.disabled = false; load();
    };
  }

  async function openDept(id, focusTask) {
    const d = D.departments.find((x) => x.id === Number(id)); if (!d) return;
    const team = D.agents.filter((a) => a.dept === d.id), can = team.filter((a) => a.runnable).length;
    open(`<div class="d-head"><span class="avatar">${leadSvg(d.color)}</span><div><h2 class="d-title">${esc(d.name)} Lead</h2><div class="d-sub">${team.length} agents · ${can} can take tasks</div></div></div>
      <form id="f-task" class="field"><label for="task">Give the lead a task</label><textarea class="input" id="task" name="t" required placeholder="Example: check vagent.online and report anything broken" ${focusTask ? 'autofocus' : ''}></textarea>
      <button class="btn primary" type="submit">Send to the team</button><p class="help">The lead sends it to every agent here that has a webhook, waits for them, and gives you one final result.</p></form>
      <div id="task-out"></div>
      <p class="label">Team</p><div class="items">${team.map(itemAgent).join('') || '<p class="empty">No agents yet. Open an agent and choose this department.</p>'}</div>
      <p class="label">Past tasks</p><div class="items" id="history"><p class="empty">Loading…</p></div>
      <p class="label">Edit</p><form id="f-edit" class="field"><input class="input" name="n" value="${esc(d.name)}" aria-label="Department name" required><div class="sw">${DEPT_COLORS.map((c) => `<button type="button" aria-label="Color ${c}" aria-pressed="${c === d.color}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="row"><button class="btn" type="submit">Save</button><button class="btn danger" type="button" id="del-dept">Delete department</button></div></form>`, 'dept:' + d.id);
    let color = d.color;
    inner.querySelectorAll('.sw button').forEach((b) => (b.onclick = () => { color = b.dataset.c; inner.querySelectorAll('.sw button').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
    $('#f-edit').onsubmit = async (e) => { e.preventDefault(); try { await api('departments', { body: { id: d.id, name: e.target.n.value, color } }); toast('Saved'); await load(); openDept(d.id); } catch (x) { toast(x.message); } };
    $('#del-dept').onclick = async () => { if (!confirm('Delete the ' + d.name + ' department? Its agents stay, they just leave the team.')) return; await api('departments?id=' + d.id, { method: 'DELETE' }); close(); load(); };
    $('#f-task').onsubmit = async (e) => {
      e.preventDefault(); const t = e.target.t.value.trim(); if (!t) return;
      const btn = e.target.querySelector('button'); btn.disabled = true;
      $('#task-out').innerHTML = `<div class="box">The lead sent it to the team. Waiting for answers (up to a minute)…</div>`;
      try { const r = await api('tasks', { body: { deptId: d.id, text: t } }); $('#task-out').innerHTML = taskBox(r); e.target.t.value = ''; history(); load(); }
      catch (x) { $('#task-out').innerHTML = `<div class="box">${esc(x.message)}</div>`; }
      btn.disabled = false;
    };
    const history = async () => { try { const h = await api('tasks?deptId=' + d.id); $('#history').innerHTML = h.map((t) => `<details class="item" style="display:block"><summary style="cursor:pointer"><b style="font-weight:500">${esc(t.text.slice(0, 80))}</b> <small class="muted">· ${esc(t.status)} · ${ago(t.created_at)}</small></summary><div class="result" style="margin-top:8px">${esc(t.final || '')}</div></details>`).join('') || '<p class="empty">No tasks yet.</p>'; } catch { $('#history').innerHTML = ''; } };
    history();
  }
  const taskBox = (r) => `<div class="box dark"><span class="label" style="color:#B0AEA5">Final result · ${esc(r.status)}</span><div class="result">${esc(r.final)}</div></div>`
    + r.results.map((x) => `<details class="item" style="display:block"><summary style="cursor:pointer">${x.ok ? '✓' : '✗'} ${esc(x.name)}</summary><div class="result" style="margin-top:8px">${esc(x.output)}</div></details>`).join('');

  function newDept() {
    let color = DEPT_COLORS[D.departments.length % DEPT_COLORS.length];
    open(`<div class="d-head"><span class="avatar">${leadSvg(color)}</span><div><h2 class="d-title">New department</h2><div class="d-sub">A lead runs it and gives tasks to its agents.</div></div></div>
      <form id="f-new" class="field"><label for="dn">Name</label><input class="input" id="dn" name="n" placeholder="Backend, Sales, UI, UX…" required autofocus maxlength="40">
      <span class="label" style="margin-top:6px">Color</span><div class="sw">${DEPT_COLORS.map((c) => `<button type="button" aria-label="Color ${c}" aria-pressed="${c === color}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
      <button class="btn primary" type="submit" style="margin-top:8px">Create</button></form>`, 'new-dept');
    inner.querySelectorAll('.sw button').forEach((b) => (b.onclick = () => { color = b.dataset.c; inner.querySelectorAll('.sw button').forEach((x) => x.setAttribute('aria-pressed', x === b)); inner.querySelector('.avatar').innerHTML = leadSvg(color); }));
    $('#f-new').onsubmit = async (e) => { e.preventDefault(); try { const d = await api('departments', { body: { name: e.target.n.value, color } }); await load(); openDept(d.id); } catch (x) { toast(x.message); } };
  }

  function openSettings() {
    open(`<h2 class="d-title">Settings</h2>
      <p class="label">Connected n8n</p><div class="items">${D.instances.map((i) => { const er = D.errors.find((e) => e.id === i.id); return `<div class="item" style="cursor:default"><span class="grow"><b>${esc(i.label)}</b><small>${esc(i.url)} · added by ${esc((i.owner || '').split('@')[0])}${er ? ' · <span style="color:#B3261E">' + esc(er.error) + '</span>' : ''}</small></span><button class="btn danger" type="button" data-del-n8n="${i.id}">Remove</button></div>`; }).join('') || '<p class="empty">Nothing connected yet.</p>'}</div>
      <form id="f-n8n" class="field" autocomplete="off"><span class="label" style="margin-top:6px">Connect an n8n</span>
        <label for="nl">Name</label><input class="input" id="nl" name="label" placeholder="Fayez's n8n" required maxlength="40" ${D.instances.length ? '' : 'autofocus'}>
        <label for="nu">n8n address</label><input class="input" id="nu" name="url" type="url" placeholder="https://fayez.vagent.online" required>
        <label for="nk">API key</label><input class="input" id="nk" name="key" type="password" placeholder="Paste the n8n API key" required autocomplete="new-password">
        <p class="help">In n8n: Settings → n8n API → Create an API key. It is saved encrypted and only the server uses it. Every owner sees all agents.</p>
        <button class="btn primary" type="submit">Connect</button></form>
      <p class="label">Departments</p><div class="items">${D.departments.map((d) => `<button class="item" type="button" data-dept="${d.id}"><span class="sd" style="width:12px;height:12px;border-radius:50%;background:${d.color}"></span><span class="grow"><b>${esc(d.name)}</b></span>›</button>`).join('')}<button class="btn" type="button" data-open="new-dept">+ New department</button></div>
      <p class="label">Account</p><div class="row" style="align-items:center"><span class="grow muted" style="flex:1;font-size:14px">Signed in as ${esc(D.me)}</span><form method="post" action="/api/logout"><button class="btn" type="submit">Sign out</button></form></div>`, 'settings');
    $('#f-n8n').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, b = f.querySelector('button[type=submit]'); b.disabled = true;
      try { const r = await api('n8n', { body: { label: f.label.value, url: f.url.value, key: f.key.value } }); toast('Connected · ' + r.workflows + ' workflows found'); await load(); openSettings(); }
      catch (x) { toast(x.message); b.disabled = false; }
    };
  }

  function openList(kind) {
    const list = kind === 'off' ? D.agents.filter((a) => a.status === 'off') : render.over || [];
    open(`<h2 class="d-title">${kind === 'off' ? 'Off duty' : 'More agents inside'}</h2><p class="help">${kind === 'off' ? 'These workflows are turned off in n8n. Open one to turn it on.' : 'The office is full, these are working or resting out of view.'}</p><div class="items">${list.map(itemAgent).join('')}</div>`, 'list');
  }
  function openTask() {
    if (!D.departments.length) { newDept(); toast('First create a department'); return; }
    open(`<h2 class="d-title">Give a task</h2><p class="help">Pick the department whose lead should handle it.</p><div class="items">${D.departments.map((d) => `<button class="item" type="button" data-dept-task="${d.id}">${leadSvg(d.color, 32)}<span class="grow"><b>${esc(d.name)} Lead</b><small>${D.agents.filter((a) => a.dept === d.id).length} agents</small></span>›</button>`).join('')}</div>`, 'task');
  }

  // ---------- events ----------
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-agent],[data-dept],[data-dept-task],[data-open],[data-del-n8n],.agent,.lead,.add-room');
    if (!t) return;
    if (t.classList.contains('agent')) return openAgent(t.dataset.key);
    if (t.classList.contains('lead')) return openDept(t.dataset.dept);
    if (t.classList.contains('add-room')) return newDept();
    if (t.dataset.agent) return openAgent(t.dataset.agent);
    if (t.dataset.deptTask) return openDept(t.dataset.deptTask, true);
    if (t.dataset.dept) return openDept(t.dataset.dept);
    if (t.dataset.delN8n) { if (!confirm('Remove this n8n? Its agents leave the office (nothing is deleted in n8n).')) return; await api('n8n?id=' + t.dataset.delN8n, { method: 'DELETE' }); await load(); return openSettings(); }
    const o = t.dataset.open; if (o === 'settings') openSettings(); else if (o === 'new-dept') newDept(); else if (o === 'off' || o === 'over') openList(o);
  });
  svg.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.agent,.lead,.add-room')) { e.preventDefault(); e.target.closest('.agent,.lead,.add-room').dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) close(); });
  $('#drawer-close').onclick = close; scrim.onclick = close;
  $('#btn-settings').onclick = openSettings; $('#btn-task').onclick = openTask;
  const tick = () => { const n = new Date(); $('#clock').textContent = n.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); const h = $('#clock-h'), m = $('#clock-m'); if (h) { h.setAttribute('transform', 'rotate(' + ((n.getHours() % 12) * 30 + n.getMinutes() / 2) + ')'); m.setAttribute('transform', 'rotate(' + n.getMinutes() * 6 + ')'); } };
  tick(); setInterval(tick, 30000);
  load(); setInterval(() => { if (!document.hidden) load(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
