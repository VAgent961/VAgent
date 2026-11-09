// VAgent office: live n8n workflows as agents. Working -> desk, idle/help -> café, off -> off duty.
// Office Helper is special: he lives at S.helper (messenger corner). When working he walks to the target lead's room.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PAL = ['#E7B38F', '#8FC79D', '#A8B8E8', '#D9C27A', '#E59A7A', '#9FD0D6', '#C8A8E0', '#B9D98F'];
  const DEPT_COLORS = ['#E7B38F', '#A8B8E8', '#8FC79D', '#D9C27A', '#E59A7A', '#9FD0D6', '#C8A8E0'];
  const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const colorOf = (k) => PAL[hash(k) % PAL.length];
  const TRIG = { webhook: 'Runs when called (webhook)', chat: 'Chat trigger', telegram: 'Telegram bot', schedule: 'Runs on a schedule', form: 'Form', helper: 'Helper for other agents', alarm: 'Error alarm', app: 'App trigger', manual: 'Manual only' };
  const STATUS = { working: 'Working', idle: 'Resting · ready', help: 'Needs help · last run failed', off: 'Off duty · turned off in n8n' };
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
  let S = VScene.build([]), sceneKey = '';
  $('#stage').innerHTML = '<svg id="scene" preserveAspectRatio="xMidYMid meet" role="img" aria-label="The VAgent office: one room per department, the CEO office, the café and open desks."></svg>';
  const svg = $('#scene'); svg.innerHTML = S.inner;
  let free = $('#layer-free'), walkL = $('#layer-walk');
  // ---------- zoom + pan ----------
  const stage = $('#stage'); let VB0 = { ...S.vb }; const vb = { ...VB0 }, MAXZ = 5;
  stage.insertAdjacentHTML('beforeend', '<div class="zoom" role="group" aria-label="Zoom the office"><button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="reset" aria-label="Fit the whole office" style="font-size:14px">⤢</button></div>');
  const setVB = () => { svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h); };
  setVB();
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
  const posOf = (p) => (p.t === 'desk' ? [S.desks[p.i][0] + 22, S.desks[p.i][1] - 33] : p.t === 'helper' ? S.helper : S.cafe[p.i]);
  const tr = (x, y) => `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(1.1)`;

  // ── detect the Office Helper (messenger) by name ─────────────────────────
  const isHelper = (a) => /office.?helper/i.test((a.name || '').replace(/\s+/g, '.'));

  function makeAgent(a) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'agent'); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.dataset.key = a.key;
    const botRef = isHelper(a) ? '#msgbot' : '#bot';
    g.innerHTML = `<circle class="ring" cy="-30" r="34" fill="none" stroke="${isHelper(a) ? '#9FD0D6' : '#B5532F'}" stroke-width="3"/><g class="body"><use href="${botRef}" style="color:${colorOf(a.key)}"/></g>
      <g class="props"><g class="p p-book" transform="translate(0 -15)"><rect x="-10" y="-6" width="20" height="13" rx="1.5" fill="#B5532F"/><rect x="-8" y="-4" width="7" height="9" fill="#FAF9F5"/><rect x="1" y="-4" width="7" height="9" fill="#FAF9F5"/></g><g class="p p-pad" transform="translate(0 -14)"><rect x="-11" y="-5" width="22" height="10" rx="5" fill="#F5F5F7" stroke="#141413" stroke-width="1"/><circle cx="-5" cy="0" r="1.8" fill="#3A6EA5"/><circle cx="5" cy="0" r="1.8" fill="#B5532F"/></g><g class="p p-phone" transform="translate(6 -16)"><rect x="-4" y="-7" width="8" height="13" rx="2" fill="#141413"/><rect x="-3" y="-5.5" width="6" height="9" rx="1" fill="#7FB0E0"/></g><g class="p p-mug" transform="translate(9 -16)"><rect x="-4" y="-5" width="8" height="9" rx="2" fill="#FAF9F5"/><path d="M4 -3 q4 1 0 5" stroke="#FAF9F5" stroke-width="1.6" fill="none"/></g><g class="p p-music"><path d="M-18 -46 Q0 -78 18 -46" stroke="#141413" stroke-width="3.5" fill="none"/><rect x="-22" y="-52" width="7" height="12" rx="3" fill="#B5532F"/><rect x="15" y="-52" width="7" height="12" rx="3" fill="#B5532F"/><text class="note" x="20" y="-62" font-size="14" fill="#E7B38F">♪</text></g><g class="p p-rest"><text class="zz" x="16" y="-62" font-size="13" font-weight="700" fill="#A8B8E8">z z</text></g></g><g class="bubble typing" transform="translate(27 -52)"><rect x="-15" y="-10" width="30" height="18" rx="9" fill="#FAF9F5" stroke="#E3E0D5"/><circle cx="-6" cy="-1" r="2.2" fill="#B5532F"/><circle cx="0" cy="-1" r="2.2" fill="#B5532F"/><circle cx="6" cy="-1" r="2.2" fill="#B5532F"/></g>
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

  // ── wander engine ──────────────────────────────────────────────────────────
  // Each resting bot gets a looping micro-walk around its home spot.
  // Cancelled whenever the bot gets a new assignment (status/position change).
  const rng = (a, b) => a + Math.random() * (b - a);
  function stopWander(g) { if (g._wanderKill) { g._wanderKill(); g._wanderKill = null; } }
  function startWander(g, hx, hy) {
    if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    stopWander(g);
    let alive = true;
    g._wanderKill = () => { alive = false; };
    // randomise start delay so bots don't all move at once
    const delay = rng(0, 12);
    const loop = () => {
      if (!alive || !g.isConnected) return;
      // pick a spot within 32px of home, biased isometrically
      const ox = rng(-28, 28), oy = rng(-16, 16);
      const tx = hx + ox, ty = hy + oy;
      const dist = Math.hypot(ox, oy);
      const dur = dist / 55; // ~55 px/s — slow stroll
      free.appendChild(g);
      g.setAttribute('transform', tr(g._pos ? g._pos[0] : hx, g._pos ? g._pos[1] : hy));
      const body = g.querySelector('.body');
      const bob = gsap.fromTo(body, { y: 0 }, { y: -3, duration: 0.22, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      const s = { x: g._pos ? g._pos[0] : hx, y: g._pos ? g._pos[1] : hy };
      gsap.to(s, {
        x: tx, y: ty, duration: dur, ease: 'none',
        onUpdate: () => { if (!alive) return; g.setAttribute('transform', tr(s.x, s.y)); g._pos = [s.x, s.y]; },
        onComplete: () => {
          bob.kill(); gsap.set(body, { y: 0 });
          if (!alive) return;
          // pause at destination, then walk home
          const pause = rng(4, 18);
          gsap.delayedCall(pause, () => {
            if (!alive) return;
            const s2 = { x: s.x, y: s.y };
            const bob2 = gsap.fromTo(body, { y: 0 }, { y: -3, duration: 0.22, yoyo: true, repeat: -1, ease: 'sine.inOut' });
            gsap.to(s2, {
              x: hx, y: hy, duration: Math.hypot(hx - s.x, hy - s.y) / 55, ease: 'none',
              onUpdate: () => { if (!alive) return; g.setAttribute('transform', tr(s2.x, s2.y)); g._pos = [s2.x, s2.y]; },
              onComplete: () => {
                bob2.kill(); gsap.set(body, { y: 0 });
                if (!alive) return;
                g._pos = [hx, hy];
                gsap.delayedCall(rng(6, 20), loop);
              },
            });
          });
        },
      });
    };
    gsap.delayedCall(delay, loop);
  }

  function attach(g, p) {
    stopWander(g);
    if (p.t === 'desk') { deskG(p.i).querySelector('.seat').appendChild(g); g.setAttribute('transform', ''); }
    else if (p.t === 'helper') {
      const slot = svg.querySelector('#helper-slot'); if (slot) { slot.appendChild(g); g.setAttribute('transform', ''); } else { free.appendChild(g); g.setAttribute('transform', tr(S.helper[0], S.helper[1])); }
    }
    else { const [x, y] = posOf(p); free.appendChild(g); g.setAttribute('transform', tr(x, y)); }
    g.dataset.prop = p.t === 'cafe' ? (S.spotProp[p.i] || 'rest') : '';
    const [bx, by] = posOf(p); g._pos = [bx, by]; g._home = [bx, by];
    // start wandering for resting bots
    if (p.t === 'cafe') startWander(g, bx, by);
  }

  function walk(g, from, to) {
    stopWander(g);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!window.gsap || reduce || !from) return attach(g, to);
    const s = { x: g._pos ? g._pos[0] : posOf(from)[0], y: g._pos ? g._pos[1] : posOf(from)[1] }, [tx, ty] = posOf(to);
    walkL.appendChild(g); g.dataset.prop = ''; g.setAttribute('transform', tr(s.x, s.y));
    const body = g.querySelector('.body');
    const bob = gsap.fromTo(body, { y: 0 }, { y: -4, duration: 0.18, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.to(s, { x: tx, y: ty, duration: Math.min(3.2, Math.max(1.2, Math.hypot(tx - s.x, ty - s.y) / 230)), ease: 'power1.inOut',
      onUpdate: () => { g.setAttribute('transform', tr(s.x, s.y)); g._pos = [s.x, s.y]; },
      onComplete: () => { bob.kill(); gsap.set(body, { y: 0 }); attach(g, to); } });
  }
  function leave(g) { stopWander(g); if (window.gsap) gsap.to(g, { opacity: 0, duration: 0.5, onComplete: () => g.remove() }); else g.remove(); }

  function renderRooms() {
    const cs = svg.querySelector("#ceo-slot"); if (cs && !cs.firstChild) cs.innerHTML = '<g class="ceo-g" tabindex="0" role="button" aria-label="Talk to the CEO"><g transform="scale(1.25)"><use href="#ceo"/></g><g class="tag" transform="translate(0 -104)"><rect x="-64" y="-13" width="128" height="24" rx="12" fill="#2B2416"/><text y="3" text-anchor="middle" fill="#E9C46A" font-size="12" font-weight="600">CEO · Talk to me</text></g></g>';
    renderDepts();
    S.rooms.forEach((r, i) => {
      const d = D.departments[i], slot = svg.querySelector(`.lead-slot[data-room="${i}"]`), screen = svg.querySelector(`.room-screen[data-room="${i}"]`);
      if (!slot) return;
      if (screen) screen.style.color = d ? d.color : '#3A3935';
      const fl = svg.querySelector(`.room-floor[data-room="${i}"]`), nm = svg.querySelector(`.room-name[data-room="${i}"]`);
      if (fl) { fl.setAttribute("fill", d ? d.color : "#2A2A2E"); fl.setAttribute("opacity", d ? "0.16" : "0.6"); }
      if (nm) nm.textContent = d ? d.name : "";
      if (d) {
        const leadA = d.lead_key ? D.agents.find((a) => a.key === d.lead_key) : null;
        const label = leadA ? (leadA.name.length > 22 ? leadA.name.slice(0, 21) + '…' : leadA.name) : d.name + ' Lead';
        const w = Math.min(label.length, 24) * 6.5 + 26;
        const body = leadA
          ? `<g transform="scale(1.15)"><use href="#bot" style="color:${colorOf(leadA.key)}"/></g><g class="tag" transform="translate(0 -100)"><rect x="${-w / 2}" y="-12" width="${w}" height="22" rx="11" fill="${d.color}" stroke="${d.color}"/><text y="3" text-anchor="middle" fill="#141413" font-weight="600">${esc(label)}</text></g>`
          : `<g transform="scale(1.15)"><use href="#lead" style="color:${d.color}"/></g><g class="tag" transform="translate(0 -84)"><rect x="${-w / 2}" y="-12" width="${w}" height="22" rx="11" fill="#FAF9F5" stroke="#D8D5CB"/><text y="3" text-anchor="middle" fill="#141413">${esc(label)}</text></g>`;
        slot.innerHTML = `<g class="lead" tabindex="0" role="button" data-dept="${d.id}" aria-label="${esc(label)}">${body}</g>`;
      } else {
        slot.innerHTML = `<g class="add-room" tabindex="0" role="button" aria-label="Add a department"><g class="tag" transform="translate(0 -24)"><rect x="-56" y="-12" width="112" height="22" rx="11" fill="#FAF9F5" stroke="#B0AEA5" stroke-dasharray="4 3"/><text y="3" text-anchor="middle" fill="#5E5D59">+ Department</text></g></g>`;
      }
    });
  }

  function buildScene() {
    const key = D.departments.map((d) => d.id).join(','); if (key === sceneKey) return;
    sceneKey = key; S = VScene.build(D.departments);
    for (const k of Object.keys(els)) { els[k].remove(); delete els[k]; delete places[k]; }
    svg.innerHTML = S.inner; free = $('#layer-free'); walkL = $('#layer-walk');
    VB0 = { ...S.vb }; Object.assign(vb, VB0); setVB();
  }
  function zoomRoom(i) {
    const r = S.rooms[i]; if (!r) return;
    const xs = r.box.map((p) => p[0]), ys = r.box.map((p) => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const nw = Math.min(VB0.w, (Math.max(...xs) - Math.min(...xs)) * 1.1), to = { w: nw, h: nw * VB0.h / VB0.w }; to.x = cx - to.w / 2; to.y = cy - to.h / 2 - 20;
    if (window.gsap) gsap.to(vb, { ...to, duration: 0.6, ease: 'power2.inOut', onUpdate: () => { clampVB(); setVB(); } }); else { Object.assign(vb, to); clampVB(); setVB(); }
  }
  function renderDepts() {
    const box = $('#depts'); if (!box) return;
    const count = (id) => D.agents.filter((a) => a.dept === id).length;
    box.innerHTML = '<span class="depts-h">Departments</span>' + (D.departments.map((d, i) => `<button type="button" class="dept-btn" data-room-i="${i}" data-dept="${d.id}"><span class="dd" style="background:${d.color}"></span><span class="dn">${esc(d.name)}</span><span class="dc">${count(d.id)}/35</span></button>`).join('') || '<p class="empty">No departments yet.</p>') + '<button type="button" class="dept-btn add" id="dept-add">+ New department</button>';
  }

  function render() {
    buildScene();
    const A = D.agents;
    const working = A.filter((a) => a.status === 'working' && !isHelper(a));
    const cafe = A.filter((a) => (a.status === 'idle' || a.status === 'help') && !isHelper(a));
    const off = A.filter((a) => a.status === 'off' && !isHelper(a));
    const helpers = A.filter(isHelper);

    const next = {}, used = { desk: new Set(), cafe: new Set() }, over = [];
    const roomOf = (a) => { const i = D.departments.findIndex((x) => x.id === a.dept); return i >= 0 && i < S.rooms.length ? i : -1; };
    const pick = (a, t, choices) => { const p = places[a.key]; if (p && p.t === t && choices.includes(p.i) && !used[t].has(p.i)) return p.i; return choices.find((i) => !used[t].has(i)); };
    for (const a of working) { const r = roomOf(a); let i = pick(a, 'desk', r >= 0 ? S.rooms[r].desks : S.hot); if (i === undefined) i = pick(a, 'desk', S.hot); if (i === undefined) { over.push(a); continue; } next[a.key] = { t: 'desk', i }; used.desk.add(i); }
    for (const a of cafe) { const r = roomOf(a); let i = r >= 0 ? pick(a, 'cafe', S.rooms[r].rest) : undefined; if (i === undefined) i = pick(a, 'cafe', S.cafeIdx); if (i === undefined) { over.push(a); continue; } next[a.key] = { t: 'cafe', i }; used.cafe.add(i); }

    // ── Office Helper: messenger corner when idle/off; first dept lead room when working ──
    for (const a of helpers) {
      if (a.status === 'working') {
        // walk to the first valid dept lead position (or fall back to helper spot)
        const targetRoom = S.rooms.find((r, i) => D.departments[i] && !r.ghost);
        const dest = targetRoom ? targetRoom.lead : S.helper;
        // we store it as a 'lead' type with the xy baked in
        next[a.key] = { t: 'helperworking', xy: dest };
      } else {
        // idle / help / off → sit at messenger desk
        next[a.key] = { t: 'helper' };
      }
    }

    svg.querySelectorAll('.desk-top').forEach((u) => (u.style.color = '#3A3935'));
    for (const a of A) {
      const p = next[a.key]; let g = els[a.key];
      if (!p) { if (g) { leave(g); delete els[a.key]; delete places[a.key]; } continue; }
      if (!g) { g = els[a.key] = makeAgent(a); updateAgent(g, a); attachAny(g, p); if (!first && window.gsap) gsap.from(g, { opacity: 0, duration: 0.6 }); }
      else { updateAgent(g, a); const o = places[a.key]; if (!o || o.t !== p.t || o.i !== p.i || o.xy !== p.xy) walkAny(g, o, p); }
      places[a.key] = p;
      if (p.t === 'desk') deskG(p.i).querySelector('.desk-top').style.color = colorOf(a.key);
    }
    for (const k of Object.keys(els)) if (!A.find((a) => a.key === k)) { leave(els[k]); delete els[k]; delete places[k]; }
    renderRooms();
    const help = A.filter((a) => a.status === 'help').length;
    $('#n-working').textContent = working.length; $('#n-idle').textContent = cafe.length - help; $('#n-help').textContent = help;
    svg.querySelector('#board-bar1').setAttribute('opacity', working.length ? 1 : 0.35); svg.querySelector('#board-bar2').setAttribute('opacity', cafe.length ? 1 : 0.35);
    $('#board-line').textContent = A.length ? working.length + ' working · ' + cafe.length + ' in café' : 'Connect n8n to start';
    $('#n-all').textContent = A.length; $('#n-off').textContent = off.length;
    const notes = [];
    if (!D.instances.some((i) => i.owner === D.me)) notes.push('<button class="chip hello" type="button" data-open="connect"><b>Bring your agents in</b><span>Connect your n8n in 3 quick steps →</span></button>');
    for (const e of D.errors) notes.push(`<button class="chip warn" type="button" data-open="settings">Can't reach ${esc(e.inst)} · check its API key →</button>`);
    if (over.length) notes.push(`<button class="chip" type="button" data-open="over">+${over.length} agents don't fit in the office →</button>`);
    $('#notice').innerHTML = notes.length ? '<div class="notice">' + notes.join('') + '</div>' : ''; render.over = over;
    $('#feed').innerHTML = D.activity.slice(0, 12).map((e) => `<li><i class="sd ${e.status}"></i><time>${hhmm(e.at)}</time><span>${esc(e.name)} ${e.status === 'success' ? 'finished' : e.status === 'running' ? 'is working' : /error|crashed/.test(e.status) ? 'failed' : e.status}</span></li>`).join('') || '<li>No runs yet.</li>';
    const sel = $('#inst'); sel.hidden = D.instances.length < 2; sel.innerHTML = '<option value="">Everyone\'s agents</option>' + D.instances.map((i) => `<option value="${i.id}" ${String(i.id) === inst ? 'selected' : ''}>${esc(i.label)}</option>`).join('');
    if (prevStatus) for (const a of A) if (a.status === 'help' && prevStatus[a.key] && prevStatus[a.key] !== 'help') toast('⚠ ' + a.name + ' needs help: its last run failed');
    prevStatus = Object.fromEntries(A.map((a) => [a.key, a.status]));
    document.title = (help ? '(' + help + ') ' : '') + 'VAgent HQ · Office';
    renderList();
    first = false;
  }

  // Extended attach/walk that handle the helper position types
  function attachAny(g, p) {
    stopWander(g);
    if (p.t === 'helper') return attach(g, p);
    if (p.t === 'helperworking') {
      const [x, y] = p.xy; free.appendChild(g); g.setAttribute('transform', tr(x, y)); g._pos = [x, y];
    } else {
      attach(g, p);
    }
  }
  function walkAny(g, from, to) {
    if (to.t === 'helperworking') {
      const [tx, ty] = to.xy;
      if (!window.gsap) { const [x, y] = to.xy; free.appendChild(g); g.setAttribute('transform', tr(x, y)); g._pos = [x, y]; return; }
      const sx = g._pos ? g._pos[0] : S.helper[0], sy = g._pos ? g._pos[1] : S.helper[1];
      walkL.appendChild(g); g.setAttribute('transform', tr(sx, sy));
      const body = g.querySelector('.body'), s = { x: sx, y: sy };
      const bob = gsap.fromTo(body, { y: 0 }, { y: -4, duration: 0.18, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      gsap.to(s, { x: tx, y: ty, duration: Math.min(3.2, Math.max(1.4, Math.hypot(tx - sx, ty - sy) / 220)), ease: 'power1.inOut',
        onUpdate: () => { g.setAttribute('transform', tr(s.x, s.y)); g._pos = [s.x, s.y]; },
        onComplete: () => { bob.kill(); gsap.set(body, { y: 0 }); free.appendChild(g); g.setAttribute('transform', tr(tx, ty)); g._pos = [tx, ty]; } });
    } else {
      walk(g, from, to);
    }
  }

  const where = (a) => { const x = D.departments.find((y) => y.id === a.dept); if (!x) return 'No department'; const t = x.teams.find((y) => y.id === a.team); return x.name + (t ? ' / ' + t.name : ''); };
  const dotColor = { working: '#3F7D4E', help: '#B3261E', idle: '#B5532F', off: '#B0AEA5' };
  const itemAgent = (a) => `<button class="item" type="button" data-agent="${esc(a.key)}"><span class="sd ${a.status}"></span><span class="grow"><b>${esc(a.name)}</b><small>${esc(a.status === 'idle' && D.departments.some((d) => d.id === a.dept) ? 'Resting in the lounge' : STATUS[a.status].split(' · ')[0])} · ${esc(where(a))}</small></span><span aria-hidden="true">›</span></button>`;

  let filter = 'all', q = '', inst = '', prevStatus = null;
  const groups = { all: () => true, working: (a) => a.status === 'working', cafe: (a) => a.status === 'idle', help: (a) => a.status === 'help', off: (a) => a.status === 'off' };
  function renderList() {
    const order = { working: 0, help: 1, idle: 2, off: 3 }, s = q.toLowerCase();
    const list = D.agents.filter(groups[filter]).filter((a) => !inst || String(a.instId) === inst).filter((a) => !s || (a.name + ' ' + a.inst).toLowerCase().includes(s)).sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
    $('#list').innerHTML = list.map(itemAgent).join('') || (D.agents.length ? '<p class="empty">No agents match.</p>' : '<p class="empty">No agents yet. Open settings and connect your n8n.</p>');
  }
  document.querySelectorAll('.filters button').forEach((b) => (b.onclick = () => { filter = b.dataset.f; document.querySelectorAll('.filters button').forEach((x) => x.setAttribute('aria-pressed', x === b)); renderList(); }));
  $('#q').oninput = (e) => { q = e.target.value; renderList(); };
  $('#inst').onchange = (e) => { inst = e.target.value; renderList(); };
  document.addEventListener('keydown', (e) => { if (e.key === '/' && !e.target.closest('input,textarea,select')) { e.preventDefault(); $('#q').focus(); } });
  function focusAgent(key) {
    const g = els[key]; if (!g || !g._pos) return;
    document.querySelectorAll('.agent.found').forEach((x) => x.classList.remove('found')); g.classList.add('found'); setTimeout(() => g.classList.remove('found'), 4000);
    const nw = Math.min(VB0.w, VB0.w / 2.2), to = { w: nw, h: nw * VB0.h / VB0.w }; to.x = g._pos[0] - to.w / 2; to.y = g._pos[1] - 40 - to.h / 2;
    if (window.gsap) gsap.to(vb, { ...to, duration: 0.6, ease: 'power2.inOut', onUpdate: () => { clampVB(); setVB(); } }); else { Object.assign(vb, to); clampVB(); setVB(); }
  }
  async function load() {
    try {
      D = await api('office');
      $('#live-dot').className = 'dot ' + (D.errors.length ? 'err' : 'on'); $('#live-text').textContent = 'Live · ' + hhmm(new Date());
      render();
    } catch (e) { $('#live-dot').className = 'dot err'; $('#live-text').textContent = 'Offline, retrying'; }
    api('me').then((me) => { if (me.owners) renderOwners(me.owners); }).catch(() => {});
  }

  // ---------- drawer ----------
  const drawer = $('#drawer'), inner = $('#drawer-in'), scrim = $('#scrim');
  function open(html, name) { current = name; inner.innerHTML = html; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); scrim.hidden = false; inner.scrollTop = 0; setTimeout(() => (inner.querySelector('[autofocus]') || $('#drawer-close')).focus(), 50); }
  function close() { current = null; drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); scrim.hidden = true; }
  const botSvg = (c, s = 40) => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="-22 -72 44 76"><use href="#bot" style="color:${c}"/></svg>`;
  const leadSvg = (c, s = 40) => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="-30 -66 60 70"><use href="#lead" style="color:${c}"/></svg>`;
  const deptName = (id) => (D.departments.find((d) => d.id === id) || {}).name;

  async function openAgent(key) {
    const a = D.agents.find((x) => x.key === key); if (!a) return;
    const avatarSvg = isHelper(a)
      ? `<svg aria-hidden="true" width="40" height="40" viewBox="-22 -72 44 76"><use href="#msgbot" style="color:${colorOf(key)}"/></svg>`
      : botSvg(colorOf(key));
    const head = `<div class="d-head"><span class="avatar">${avatarSvg}</span><div><h2 class="d-title">${esc(a.name)} <button class="rename" type="button" id="rename" aria-label="Rename" title="Rename">✎</button></h2><div class="status ${a.status}">● ${esc(STATUS[a.status])}${a.status === 'working' && a.startedAt ? ' · for ' + dur(Date.now() - Date.parse(a.startedAt)) : ''}</div><div class="d-sub">${esc(TRIG[a.trigger] || a.trigger)} · ${esc(a.inst)} · ${a.runs24} runs today</div></div></div>`;
    open(head + '<p class="empty">Loading its work…</p>', 'agent:' + key);
    let d; try { d = await api('agent?key=' + encodeURIComponent(key)); } catch (e) { inner.innerHTML = head + `<p class="empty">${esc(e.message)}</p>`; return; }
    if (current !== 'agent:' + key) return;
    const runs = d.runs.map((r) => `<li><span class="sd ${r.status}"></span><span class="when">${r.status === 'running' ? 'Running now' : esc(r.status === 'success' ? 'Finished' : r.status)} · ${ago(r.stoppedAt || r.startedAt)}</span><span class="dur">${r.stoppedAt ? dur(Date.parse(r.stoppedAt) - Date.parse(r.startedAt)) : ''}</span><a class="see" href="${esc(d.link)}/executions/${r.id}" target="_blank" rel="noopener" aria-label="See this run in n8n">${/error|crashed/.test(r.status) ? 'See why ↗' : '↗'}</a></li>`).join('') || '<li class="empty">No runs yet.</li>';
    const steps = d.steps.slice(0, 10).map((s) => `<li>${esc(s)}</li>`).join('') + (d.steps.length > 10 ? `<li>+${d.steps.length - 10} more steps</li>` : '');
    const opts = '<option value="">No department</option>' + D.departments.map((x) => `<option value="${x.id}" ${x.id === d.dept ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    const teamOpts = (deptId) => { const x = D.departments.find((y) => y.id === Number(deptId)); return '<option value="">No team</option>' + (x ? x.teams.map((t) => `<option value="${t.id}" ${t.id === d.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('') : ''); };
    const how = d.runnable ? 'It has its own webhook, so your messages go straight to it.' : d.canRun ? 'Ask it anything. Press Run now to start it.' : d.hasHook ? 'Ask it anything. Turn it on to be able to start it from here.' : 'Ask it anything. It starts from its own trigger (' + esc(TRIG[d.trigger] || d.trigger) + ').';
    const aInD = D.departments.find((x) => x.id === d.dept);
    const isLeadOf = aInD && aInD.lead_key === key;
    const leadRow = aInD
      ? isLeadOf
        ? `<div class="row"><span class="pick" aria-pressed="true" style="display:inline-flex;align-items:center;gap:6px">⭐ Lead of ${esc(aInD.name)}</span><button class="btn" type="button" id="clear-lead">Remove as lead</button></div>`
        : `<button class="btn primary" type="button" id="set-lead">⭐ Make lead of ${esc(aInD.name)}</button>`
      : '';
    inner.innerHTML = head
      + (d.canRun ? `<button class="btn primary" type="button" id="run-now">▶ Run now</button>` : '')
      + leadRow
      + `<p class="label">Talk to ${esc(d.name)}</p>` + chatUI('agent:' + key, 'Ask it something…') + `<p class="help">${how}</p>`
      + `<div class="row" style="flex-wrap:nowrap"><div class="field" style="flex:1"><label for="dept">Department</label><select class="input" id="dept">${opts}</select></div><div class="field" style="flex:1"><label for="team">Team</label><select class="input" id="team">${teamOpts(d.dept)}</select></div></div>`
      + `<details class="more"><summary>What it does (${d.steps.length} steps)</summary><ol class="steps">${steps}</ol></details>`
      + `<details class="more"><summary>Recent runs</summary><ul class="runs">${runs}</ul></details>`
      + `<div class="row"><a class="btn" href="${esc(d.link)}" target="_blank" rel="noopener">Open in n8n</a><button class="btn ${d.active ? 'danger' : ''}" type="button" id="toggle">${d.active ? 'Turn off' : 'Turn on'}</button></div>`;
    bindChat('agent:' + key, d.name);
    const rn = () => { const n = prompt('New name for this agent (empty = its n8n name):', d.name); if (n === null) return; api('agent', { body: { key, action: 'rename', name: n } }).then(async () => { toast('Renamed'); await load(); openAgent(key); }).catch((x) => toast(x.message)); };
    $('#rename').onclick = rn;
    const saveAssign = async () => { try { await api('agent', { body: { key, action: 'assign', deptId: $('#dept').value || null, teamId: $('#team').value || null } }); toast('Moved'); load(); } catch (x) { toast(x.message); } };
    $('#dept').onchange = () => { d.team = null; $('#team').innerHTML = teamOpts($('#dept').value); saveAssign(); };
    $('#team').onchange = saveAssign;
    if ($('#set-lead')) $('#set-lead').onclick = async () => {
      const deptId = $('#dept').value; if (!deptId) { toast('Assign a department first'); return; }
      try { await api('departments', { body: { deptId: Number(deptId), leadKey: key } }); toast('Set as lead'); await load(); openAgent(key); } catch (x) { toast(x.message); }
    };
    if ($('#clear-lead')) $('#clear-lead').onclick = async () => {
      const deptId = d.dept; if (!deptId) return;
      try { await api('departments', { body: { deptId, leadKey: '' } }); toast('Lead cleared'); await load(); openAgent(key); } catch (x) { toast(x.message); }
    };
    if ($('#run-now')) $('#run-now').onclick = async (e) => { e.target.disabled = true; try { const r = await api('agent', { body: { key, action: 'run', message: 'Run now from the office' } }); toast(r.output); load(); } catch (x) { toast(x.message); } e.target.disabled = false; };
    $('#toggle').onclick = async () => {
      if (!confirm(d.active ? 'Turn off "' + d.name + '"? Its trigger stops until you turn it on again.' : 'Turn on "' + d.name + '"?')) return;
      try { await api('agent', { body: { key, action: d.active ? 'deactivate' : 'activate' } }); toast(d.active ? 'Turned off' : 'Turned on'); await load(); openAgent(key); } catch (x) { toast(x.message); }
    };
  }

  async function openDept(id, focusTask) {
    const d = D.departments.find((x) => x.id === Number(id)); if (!d) return;
    const team = D.agents.filter((a) => a.dept === d.id), can = team.filter((a) => a.runnable).length;
    const leadAgent = d.lead_key ? D.agents.find((a) => a.key === d.lead_key) : null;
    const leadAvatarSvg = leadAgent ? botSvg(colorOf(leadAgent.key)) : leadSvg(d.color);
    const leadTitle = leadAgent ? esc(leadAgent.name) + ' <small class="muted">(lead)</small>' : esc(d.name) + ' Lead';
    const leadPickOpts = '<option value="">— no lead —</option>' + team.map((a) => `<option value="${esc(a.key)}" ${a.key === d.lead_key ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
    open(`<div class="d-head"><span class="avatar">${leadAvatarSvg}</span><div><h2 class="d-title">${leadTitle}</h2><div class="d-sub">${team.length} employees · ${can} can take tasks${d.mission ? '<br>' + esc(d.mission) : ''}</div></div></div>
      <div class="field"><label for="lead-pick">Lead</label><select class="input" id="lead-pick">${leadPickOpts}</select></div>
      <p class="label">Talk to the lead</p>${chatUI('lead:' + d.id, 'Ask the ' + d.name + ' lead…')}
      <form id="f-task" class="field"><label for="task">Give the lead a task</label><textarea class="input" id="task" name="t" required placeholder="Example: check vagent.online and report anything broken" ${focusTask ? 'autofocus' : ''}></textarea>
      <button class="btn primary" type="submit">Send to the team</button><p class="help">The lead sends it to every agent here that has a webhook, waits for them, and gives you one final result.</p></form>
      <div id="task-out"></div>
      <p class="label">Teams</p><div class="teams">${(d.teams || []).map((t) => `<span class="pick" style="display:inline-flex;align-items:center;gap:6px">${esc(t.name)} <small class="muted">${D.agents.filter((a) => a.team === t.id).length}</small><button type="button" class="rename" data-del-team="${t.id}" aria-label="Remove team ${esc(t.name)}">✕</button></span>`).join('')}</div>
      <form id="f-team" class="row" style="flex-wrap:nowrap"><label class="sr" for="tn">New team</label><input class="input" id="tn" name="t" placeholder="New team name" required maxlength="40" style="flex:1"><button class="btn" type="submit">Add team</button></form>
      <p class="label">Employees</p><div class="items">${team.map(itemAgent).join('') || '<p class="empty">No employees yet. Ask the CEO to move some here, or open an agent and choose this department.</p>'}</div>
      <p class="label">Past tasks</p><div class="items" id="history"><p class="empty">Loading…</p></div>
      <p class="label">Edit</p><form id="f-edit" class="field"><input class="input" name="n" value="${esc(d.name)}" aria-label="Department name" required><div class="sw">${DEPT_COLORS.map((c) => `<button type="button" aria-label="Color ${c}" aria-pressed="${c === d.color}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="row"><button class="btn" type="submit">Save</button><button class="btn danger" type="button" id="del-dept">Delete department</button></div></form>`, 'dept:' + d.id);
    let color = d.color;
    bindChat('lead:' + d.id, d.name + ' lead');
    $('#lead-pick').onchange = async (e) => {
      try { await api('departments', { body: { deptId: d.id, leadKey: e.target.value || '' } }); toast(e.target.value ? 'Lead set' : 'Lead cleared'); await load(); openDept(d.id, focusTask); } catch (x) { toast(x.message); }
    };
    $("#f-team").onsubmit = async (e) => { e.preventDefault(); try { await api("departments", { body: { deptId: d.id, team: e.target.t.value } }); await load(); openDept(d.id); } catch (x) { toast(x.message); } };
    inner.querySelectorAll("[data-del-team]").forEach((b) => (b.onclick = async () => { if (!confirm("Remove this team? Its employees stay in the department.")) return; await api("departments?teamId=" + b.dataset.delTeam, { method: "DELETE" }); await load(); openDept(d.id); }));
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

  const myName = () => (D.me || '').split('@')[0].replace(/^./, (c) => c.toUpperCase());
  function openConnect(pre) {
    const free = [];
    let url = pre || '';
    open(`<h2 class="d-title">Connect your n8n</h2><p class="help" style="font-size:14px">3 quick steps. After this, all your workflows walk into the office as agents.</p>
      <form id="f-n8n" class="steps-form" autocomplete="off">
        <div class="step"><span class="num">1</span><div class="field" style="flex:1"><label for="nu">Which n8n is yours?</label>
          ${free.length ? `<div class="row">${free.map((u) => `<button type="button" class="pick" data-u="${u}" aria-pressed="${u === url}">${u.replace('https://', '')}</button>`).join('')}</div>` : ''}
          <input class="input" id="nu" name="url" inputmode="url" placeholder="your-n8n.example.com" value="${esc(url.replace('https://', ''))}" required></div></div>
        <div class="step"><span class="num">2</span><div class="field" style="flex:1"><span style="font-size:14px;font-weight:500">Make a key in n8n</span>
          <a class="btn" id="open-api" href="#" target="_blank" rel="noopener">Open my n8n API page ↗</a>
          <p class="help">In the page that opens, click <b>Create an API key</b>, name it "VAgent", and copy the key.</p></div></div>
        <div class="step"><span class="num">3</span><div class="field" style="flex:1"><label for="nk">Paste the key</label>
          <input class="input" id="nk" name="key" type="password" placeholder="Paste here" required autocomplete="new-password">
          <p class="help">Saved encrypted. Only the server uses it, never shown again.</p></div></div>
        <button class="btn primary" type="submit" style="min-height:50px">Connect and bring my agents in</button>
        <p class="help" id="conn-msg" role="alert"></p>
      </form>`, 'connect');
    const f = $('#f-n8n'), link = $('#open-api');
    const sync = () => { const v = f.url.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''); link.href = v ? 'https://' + v + '/settings/api' : '#'; link.toggleAttribute('aria-disabled', !v); };
    sync(); f.url.oninput = sync;
    inner.querySelectorAll('.pick').forEach((b) => (b.onclick = () => { f.url.value = b.dataset.u.replace('https://', ''); inner.querySelectorAll('.pick').forEach((x) => x.setAttribute('aria-pressed', x === b)); sync(); f.key.focus(); }));
    link.onclick = (e) => { if (link.getAttribute('href') === '#') { e.preventDefault(); f.url.focus(); } };
    f.onsubmit = async (e) => {
      e.preventDefault(); const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Connecting…'; $('#conn-msg').textContent = '';
      try {
        const host = f.url.value.trim().replace(/^https?:\/\//, '').split('/')[0];
        const r = await api('n8n', { body: { label: myName() + "'s n8n", url: host, key: f.key.value } });
        close(); toast('Connected · ' + r.workflows + ' agents are walking in'); load();
      } catch (x) { $('#conn-msg').textContent = x.message; $('#conn-msg').style.color = '#B3261E'; b.disabled = false; b.textContent = 'Connect and bring my agents in'; }
    };
  }

  function openSettings() {
    open(`<h2 class="d-title">Settings</h2>
      <p class="label">Connected n8n</p><div class="items">${D.instances.map((i) => { const er = D.errors.find((e) => e.id === i.id); return `<div class="item" style="cursor:default"><span class="sd ${er ? 'help' : 'working'}"></span><span class="grow"><b>${esc(i.label)}</b><small>${esc(i.url.replace('https://', ''))} · ${D.agents.filter((a) => a.instId === i.id).length} agents${er ? ' · <span style="color:#B3261E">' + esc(er.error) + '</span>' : ''}</small></span><button class="btn" type="button" data-reconnect="${esc(i.url)}">${er ? 'Fix key' : 'New key'}</button><button class="btn icon danger" type="button" data-del-n8n="${i.id}" aria-label="Remove ${esc(i.label)}">✕</button></div>`; }).join('') || '<p class="empty">Nothing connected yet.</p>'}
      <button class="btn primary" type="button" data-open="connect">+ Connect an n8n</button></div>
      <p class="label">Departments</p><div class="items">${D.departments.map((d) => `<button class="item" type="button" data-dept="${d.id}"><span class="sd" style="background:${d.color}"></span><span class="grow"><b>${esc(d.name)}</b><small>${D.agents.filter((a) => a.dept === d.id).length} agents</small></span>›</button>`).join('')}<button class="btn" type="button" data-open="new-dept">+ New department</button></div>
      <p class="label">Account</p><div class="row" style="align-items:center"><span class="muted" style="flex:1;font-size:14px">Signed in as ${esc(D.me)}</span><form method="post" action="/api/logout"><button class="btn" type="submit">Sign out</button></form></div>`, 'settings');
  }

  function openList(kind) {
    const list = kind === 'off' ? D.agents.filter((a) => a.status === 'off') : render.over || [];
    open(`<h2 class="d-title">${kind === 'off' ? 'Off duty' : 'More agents inside'}</h2><p class="help">${kind === 'off' ? 'These workflows are turned off in n8n. Open one to turn it on.' : 'The office is full, these are working or resting out of view.'}</p><div class="items">${list.map(itemAgent).join('')}</div>`, 'list');
  }
  function openTask() {
    if (!D.departments.length) { newDept(); toast('First create a department'); return; }
    open(`<h2 class="d-title">Give a task</h2><p class="help">Pick the department whose lead should handle it.</p><div class="items">${D.departments.map((d) => `<button class="item" type="button" data-dept-task="${d.id}">${leadSvg(d.color, 32)}<span class="grow"><b>${esc(d.name)} Lead</b><small>${D.agents.filter((a) => a.dept === d.id).length} agents</small></span>›</button>`).join('')}</div>`, 'task');
  }

  const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v.slice(-30))); } catch {} } };
  const ACT = { create_department: (a) => 'Create department "' + a.name + '"', rename_department: (a) => 'Rename ' + a.department + ' to "' + a.name + '"', set_mission: (a) => 'New mission for ' + a.department + ': ' + a.mission, delete_department: (a) => 'Delete department ' + a.department,
    create_team: (a) => 'New team "' + a.name + '" in ' + a.department, delete_team: (a) => 'Remove team ' + a.team + ' from ' + a.department, move_agent: (a) => 'Move ' + a.agent + ' → ' + a.department + (a.team ? ' / ' + a.team : ''),
    assign_task: (a) => 'Give ' + a.department + ' Lead the task: ' + a.task, rename_agent: (a) => 'Rename ' + a.agent + ' to "' + a.name + '"', run_agent: (a) => 'Start ' + a.agent + ' now', turn_on: (a) => 'Turn on ' + a.agent, turn_off: (a) => 'Turn off ' + a.agent,
    set_lead: (a) => (a.agent ? a.agent + ' becomes lead of ' + a.department : 'Clear lead of ' + a.department) };
  const bubble = (m) => {
    if (m.me) return `<div class="msg me">${esc(m.t)}</div>`;
    let h = `<div class="msg it${m.bad ? ' bad' : ''}">${esc(m.t)}</div>`;
    if (m.actions && m.actions.length) h += `<div class="plan" data-plan="${m.id}"><p class="label">The CEO wants to</p><ul>${m.actions.map((a) => `<li>${esc((ACT[a.type] || ((x) => x.type))(a))}</li>`).join('')}</ul>${m.done ? `<div class="result">${esc(m.done)}</div>` : `<div class="row"><button class="btn primary" type="button" data-approve="${m.id}">Approve</button><button class="btn" type="button" data-skip="${m.id}">No thanks</button></div>`}</div>`;
    if (m.project) h += `<div class="plan"><p class="label">Project brief</p><div class="result">${esc(m.project)}</div>${m.done ? `<div class="result" style="margin-top:6px">${esc(m.done)}</div>` : `<div class="row"><button class="btn primary" type="button" data-start="${m.id}">Start with the team</button><button class="btn" type="button" data-skip="${m.id}">Not now</button></div>`}</div>`;
    if (m.prompt) h += `<div class="plan"><p class="label">Prompt for Claude</p><pre class="prompt">${esc(m.prompt)}</pre><button class="btn" type="button" data-copy="${m.id}">Copy prompt</button></div>`;
    return h;
  };
  function chatUI(to, hint) { return `<div class="chat" id="chat">${(to === 'ceo' ? store.get('vagent-ceo') : chats[to] || []).map(bubble).join('')}</div>
    <form id="f-chat" class="row" style="flex-wrap:nowrap"><label class="sr" for="cm">Message</label><input class="input" id="cm" name="m" placeholder="${esc(hint)}" required autocomplete="off" style="flex:1"><button class="btn primary" type="submit" style="flex:none">Send</button></form>`; }
  function bindChat(to, who) {
    const f = $('#f-chat'), log = () => (to === 'ceo' ? store.get('vagent-ceo') : (chats[to] ||= []));
    const save = (l) => (to === 'ceo' ? store.set('vagent-ceo', l) : (chats[to] = l));
    const paint = () => { const c = $('#chat'); if (!c) return; c.innerHTML = log().map(bubble).join(''); c.lastElementChild && c.lastElementChild.scrollIntoView({ block: 'nearest' }); };
    const send = async (m) => {
      const l = log(); const history = l.slice(-8).map((x) => ({ me: !!x.me, t: x.t })); l.push({ me: 1, t: m }); save(l); paint();
      $('#chat').insertAdjacentHTML('beforeend', `<div class="msg it typing-msg" id="wait">${esc(who)} is typing…</div>`); $('#wait').scrollIntoView({ block: 'nearest' });
      const btn = f.querySelector('button'); btn.disabled = true;
      try { const r = await api('talk', { body: { to, message: m, history } }); const l2 = log(); l2.push({ id: Date.now(), t: r.reply, actions: r.actions, prompt: r.prompt, project: r.project, bad: r.ok === false }); save(l2); }
      catch (x) { const l2 = log(); l2.push({ id: Date.now(), t: x.message, bad: 1 }); save(l2); }
      btn.disabled = false; paint(); if (to.startsWith('agent:')) load();
    };
    f.onsubmit = (e) => { e.preventDefault(); const m = f.m.value.trim(); if (m) { f.m.value = ''; send(m); } };
    inner.querySelectorAll('[data-say]').forEach((b) => (b.onclick = () => send(b.dataset.say)));
    inner.onclick = async (e) => {
      const ap = e.target.closest('[data-approve],[data-skip],[data-copy],[data-start]'); if (!ap) return;
      const l = log(), m = l.find((x) => String(x.id) === (ap.dataset.approve || ap.dataset.skip || ap.dataset.copy || ap.dataset.start)); if (!m) return;
      if (ap.dataset.start) { ap.disabled = true; ap.textContent = 'The team is working… (up to a minute)'; const depId = Number(to.split(':')[1]); if (!depId) { m.done = 'Pick a department first (open its lead).'; save(l); return paint(); } try { const r = await api('tasks', { body: { deptId: depId, text: m.project } }); m.done = 'Done: ' + r.used + ' of ' + r.team + ' team members worked on it.'; const l2 = log(); l2.push({ id: Date.now(), t: r.final }); save(l2 === l ? l : l2); if (l2 !== l) {} } catch (x) { m.done = 'Could not start: ' + x.message; } save(l); paint(); load(); return; }
      if (ap.dataset.copy) { try { await navigator.clipboard.writeText(m.prompt); toast('Prompt copied'); } catch { toast('Select the prompt and copy it'); } return; }
      if (ap.dataset.skip) { m.done = 'Skipped.'; save(l); return paint(); }
      ap.disabled = true; ap.textContent = 'Working…';
      const jobs = m.actions.filter((a) => a.type === 'assign_task'), rest = m.actions.filter((a) => a.type !== 'assign_task'), out = [];
      try { if (rest.length) { const r = await api('act', { body: { actions: rest } }); out.push(...r.done); } } catch (x) { out.push('Could not do it: ' + x.message); }
      if (jobs.length) { ap.textContent = 'The teams are working… (up to a minute)'; await load(); }
      for (const j of jobs) {
        const dep = D.departments.find((d) => d.name.toLowerCase() === String(j.department || '').toLowerCase());
        if (!dep) { out.push('No department called ' + j.department); continue; }
        try { const r = await api('tasks', { body: { deptId: dep.id, text: j.task } }); out.push(dep.name + ': ' + r.status + ' (' + r.used + ' of ' + r.team + ' members)\n' + r.final); } catch (x) { out.push(dep.name + ': could not start · ' + x.message); }
      }
      m.done = out.join('\n\n') || 'Done.'; toast('Done');
      save(l); paint(); load();
    };
    paint();
  }
  async function openBoard() {
    open(`<h2 class="d-title">Task board</h2><p class="help">Every project the leads ran, newest first.</p><button class="btn primary" type="button" id="board-new" style="align-self:flex-start">+ Give a task</button><div class="items" id="board-list"><p class="empty">Loading…</p></div>`, 'board');
    $('#board-new').onclick = openTask;
    try { const h = await api('tasks'); $('#board-list').innerHTML = h.map((t) => `<details class="item" style="display:block"><summary style="cursor:pointer"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(t.color || '#888')}"></span> <b style="font-weight:500">${esc(t.text.slice(0, 80))}</b> <small class="muted">· ${esc(t.dept || 'Deleted department')} · ${esc(t.status)} · ${ago(t.created_at)}</small></summary><div class="result" style="margin-top:8px">${esc(t.final || 'Still working…')}</div></details>`).join('') || '<p class="empty">No tasks yet. Give the first one.</p>'; }
    catch (x) { $('#board-list').innerHTML = `<p class="empty">${esc(x.message)}</p>`; }
  }
  function openCEO() {
    open(`<div class="d-head"><span class="avatar" style="background:#2B2416"><svg aria-hidden="true" width="44" height="44" viewBox="-26 -78 52 82"><use href="#ceo"/></svg></span><div><h2 class="d-title">The CEO</h2><div class="d-sub">Sees the whole company live. Ask anything, or ask for a change.</div></div></div>
      <div class="row">${['How is the company doing today?', 'Organize everyone into the right departments and teams', 'Which agents failed recently and why?', 'Give a task to ', 'Create a new department for ', 'Write a Claude prompt to add a feature: '].map((s) => `<button class="pick" type="button" ${s.endsWith(' ') ? `data-fill="${esc(s)}"` : `data-say="${esc(s)}"`}>${esc(s.trim())}</button>`).join('')}</div>
      ${chatUI('ceo', 'Ask the CEO anything…')}
      <p class="help">Changes only happen after you press Approve. For new website features he writes a prompt you paste into Claude.</p>
      <div class="row"><button class="btn" type="button" id="ceo-board">Task board</button><button class="btn" type="button" id="clear-ceo">Clear chat</button></div>`, 'ceo');
    bindChat('ceo', 'The CEO');
    inner.querySelectorAll('[data-fill]').forEach((b) => (b.onclick = () => { const i = $('#cm'); i.value = b.dataset.fill; i.focus(); }));
    $('#ceo-board').onclick = openBoard;
    $('#clear-ceo').onclick = () => { store.set('vagent-ceo', []); openCEO(); };
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-agent],[data-dept],[data-dept-task],[data-open],[data-del-n8n],[data-reconnect],.agent,.lead,.add-room,.ceo-g,.task-board');
    if (!t) return;
    if (t.classList.contains('task-board')) return openBoard();
    if (t.classList.contains('agent')) return openAgent(t.dataset.key);
    if (t.classList.contains('lead')) return openDept(t.dataset.dept);
    if (t.classList.contains('ceo-g')) return openCEO();
    if (t.classList.contains('add-room')) return newDept();
    if (t.dataset.agent) { focusAgent(t.dataset.agent); return openAgent(t.dataset.agent); }
    if (t.dataset.deptTask) return openDept(t.dataset.deptTask, true);
    if (t.dataset.dept) return openDept(t.dataset.dept);
    if (t.dataset.reconnect) return openConnect(t.dataset.reconnect);
    if (t.dataset.delN8n) { if (!confirm('Remove this n8n? Its agents leave the office (nothing is deleted in n8n).')) return; await api('n8n?id=' + t.dataset.delN8n, { method: 'DELETE' }); await load(); return openSettings(); }
    const o = t.dataset.open; if (o === 'connect') openConnect(); else if (o === 'settings') openSettings(); else if (o === 'new-dept') newDept(); else if (o === 'off' || o === 'over') openList(o);
  });
  document.addEventListener('click', (e) => { const b = e.target.closest('.dept-btn'); if (!b) return; if (b.id === 'dept-add') return newDept(); zoomRoom(+b.dataset.roomI); }, true);
  svg.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.agent,.lead,.add-room,.ceo-g,.task-board')) { e.preventDefault(); e.target.closest('.agent,.lead,.add-room,.ceo-g,.task-board').dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) close(); });
  $('#drawer-close').onclick = close; scrim.onclick = close;
  $('#btn-settings').onclick = openSettings; $('#btn-task').onclick = openCEO;
  const tick = () => { const n = new Date(); const h = $('#clock-h'), m = $('#clock-m'); if (h) { h.setAttribute('transform', 'rotate(' + ((n.getHours() % 12) * 30 + n.getMinutes() / 2) + ')'); m.setAttribute('transform', 'rotate(' + n.getMinutes() * 6 + ')'); } };
  tick(); setInterval(tick, 30000);
  // ── owner presence ─────────────────────────────────────────────────────────
  const ping = () => api('ping', { method: 'POST' }).catch(() => {});
  const renderOwners = (owners) => {
    const box = $('#owners'); if (!box) return;
    box.innerHTML = owners.map((o) => `<span class="owner"><span class="od${o.online ? ' on' : ''}"></span><b>${esc(o.name)}</b>${o.online ? '' : '<span>· away</span>'}</span>`).join('');
  };
  ping(); setInterval(ping, 60000);
  api('me').then((me) => { if (me.owners) renderOwners(me.owners); }).catch(() => {});

  load(); setInterval(() => { if (!document.hidden) load(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
})();
