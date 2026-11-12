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
  const fromTxt = (s) => s ? String(s).split(',').map(Number).filter(Boolean) : [];
  const ago = (t) => { if (!t) return '—'; const s = (Date.now() - Date.parse(t)) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; };
  const dur = (ms) => (ms == null || isNaN(ms) ? '' : ms < 1000 ? (ms / 1000).toFixed(1) + 's' : ms < 60000 ? Math.round(ms / 1000) + 's' : Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's');
  const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let D = { agents: [], departments: [], activity: [], errors: [], instances: [] };
  const els = {}, places = {};
  let first = true, current = null;
  // building mode: floor === null shows the tower; a number shows that apartment (4 departments) in detail
  let V = { departments: [], agents: [] }, floor = null, bBoxes = [], busy = false; const PER = 4;

  async function api(path, opt = {}) {
    const r = await fetch('/api/' + path + (opt.query ? '?' + opt.query : ''), { method: opt.method || (opt.body ? 'POST' : 'GET'), headers: opt.body ? { 'Content-Type': 'application/json' } : {}, body: opt.body ? JSON.stringify(opt.body) : undefined });
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
  const NS_ = 'http://www.w3.org/2000/svg', mkLayer = (id, before) => { const e = document.createElementNS(NS_, 'svg'); e.id = id; e.setAttribute('class', 'fx-layer fx-all'); e.setAttribute('aria-hidden', 'true'); e.setAttribute('preserveAspectRatio', 'xMidYMid meet'); before ? svg.parentNode.insertBefore(e, svg) : svg.parentNode.appendChild(e); return e; };
  const bgL = mkLayer('scene-bg', true), topL = mkLayer('scene-top', false);
  const setOutside = (o) => { bgL.innerHTML = (o && o.outside) || ''; topL.innerHTML = (o && o.outsideTop) || ''; };
  setOutside(S);
  let free = $('#layer-free'), walkL = $('#layer-walk');
  // ---------- zoom + pan ----------
  const phoneMQ = window.matchMedia('(max-width:560px)'), vbOf = (o) => (phoneMQ.matches && o.vbCore ? o.vbCore : o.vb); // phones get the office alone, no floating-world margin
  const stage = $('#stage'); let VB0 = { ...vbOf(S) }; const vb = { ...VB0 }, MAXZ = 5;
  stage.insertAdjacentHTML('beforeend', '<div class="zoom" role="group" aria-label="Zoom the office"><button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="reset" aria-label="Fit the whole office" style="font-size:14px">⤢</button></div>');
  let lodNear = null, szW = 0, szH = 0;
  const lod = () => { if (!szW) { const r = svg.getBoundingClientRect(); szW = r.width; szH = r.height; if (!szW) return; }
    const near = Math.min(szW / vb.w, szH / vb.h) >= 0.34; if (near !== lodNear) { lodNear = near; svg.style.setProperty('--dt', near ? 'inline' : 'none'); svg.style.setProperty('--dl', near ? 'none' : 'inline'); svg.dataset.lod = near ? 'near' : 'far'; }
    if (!cullQ) { cullQ = true; requestAnimationFrame(cull); } };
  // zoomed in: desks outside the view are not drawn at all (a phone never paints the whole floor at full detail)
  let cullQ = false;
  const cull = () => { cullQ = false; const els = svg.getElementsByClassName('desk'), x0 = vb.x - 130, x1 = vb.x + vb.w + 130, y0 = vb.y - 150, y1 = vb.y + vb.h + 90;
    for (let k = 0; k < els.length; k++) { const e = els[k], p = S.desks && S.desks[+e.dataset.desk]; if (!p) continue; const hide = !!lodNear && (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1); if (e._h !== hide) { e._h = hide; e.style.display = hide ? 'none' : ''; } } };
  if (window.ResizeObserver) new ResizeObserver(() => { szW = 0; lod(); }).observe(stage);
  stage.insertAdjacentHTML('beforeend', '<button type="button" class="legend-btn" aria-expanded="false" aria-controls="legend">Legend</button><div class="legend" id="legend" hidden><p><i class="sd working"></i>Working at a desk</p><p><i class="sd idle"></i>Resting in the lounge or café</p><p><i class="sd help"></i>Needs help (last run failed)</p><p><i class="sd off"></i>Turned off</p><p class="muted">Zoom in to see rooms, signs and desk details.</p></div><div class="floor-badge" id="floor-badge" hidden></div>');
  stage.addEventListener('click', (e) => { const b = e.target.closest('.legend-btn'); if (!b) return; const l = $('#legend'); l.hidden = !l.hidden; b.setAttribute('aria-expanded', String(!l.hidden)); });
  const setVB = () => { const v = vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h; svg.setAttribute('viewBox', v); if (bgL) { bgL.setAttribute('viewBox', v); topL.setAttribute('viewBox', v); } lod(); };
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
  const posOf = (p) => p.t === 'desk' ? [S.desks[p.i][0] + 22, S.desks[p.i][1] - 33] : p.t === 'helper' ? S.helper : p.t === 'leaddesk' ? p.xy : S.cafe[p.i];
  const tr = (x, y) => `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(1.1)`;

  // ── detect the Office Helper (messenger) by name ─────────────────────────
  const isHelper = (a) => /office.?helper/i.test((a.name || '').replace(/\s+/g, '.'));

  // Each agent is one of the office's people (always the same one: picked from its key), or the messenger.
  const isLeadAgent = (a) => !!a && (a.isLead || ((typeof D !== 'undefined' && D && D.departments) || []).some((d) => d.lead_key === a.key));
  const personRef = (a) => isHelper(a) ? '#msgbot' : isLeadAgent(a) ? '#lead' : '#p' + (hash(a.key) % ((window.VScene && window.VScene.people) || 1));
  function makeAgent(a) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'agent'); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.dataset.key = a.key;
    g.innerHTML = `<circle class="ring" cy="-38" r="40" fill="none" stroke="${isHelper(a) ? '#9FD0D6' : a.isLead ? '#E9C46A' : '#B5532F'}" stroke-width="3"/><g class="body"><use href="${personRef(a)}" style="color:${colorOf(a.key)}"/></g>
      <g class="props"><g class="p p-book" transform="translate(-12 -36)"><rect x="-3.5" y="-6" width="7" height="11" rx="1" fill="#D8D3C6"/><rect x="-3.5" y="-6" width="1.6" height="11" fill="#9A968A"/></g><g class="p p-pad" transform="translate(12 -37)"><rect x="-4" y="-6" width="8" height="11" rx="1.4" fill="#2A2B2F"/><rect x="-3" y="-5" width="6" height="9" rx=".8" fill="#9DB7CE"/></g><g class="p p-phone" transform="translate(12 -36)"><rect x="-2.6" y="-5" width="5.2" height="9" rx="1.3" fill="#17181B"/><rect x="-1.9" y="-4" width="3.8" height="6.6" rx=".6" fill="#7FB0E0"/></g><g class="p p-mug" transform="translate(12 -35)"><rect x="-3" y="-4" width="6" height="7" rx="1.4" fill="#F1EEE7"/><path d="M3 -2.6 q3 .6 0 3.8" stroke="#F1EEE7" stroke-width="1.3" fill="none"/></g><g class="p p-music" transform="translate(-12 -37)"><rect x="-5" y="-4" width="10" height="7" rx="1" fill="#B9BDC4"/><rect x="-5" y="2" width="10" height="1.4" fill="#8D939B"/></g><g class="p p-rest"></g></g>
      <g class="bubble typing" transform="translate(17 -80)"><rect x="-11" y="-7" width="22" height="13" rx="6.5" fill="#FAF9F5" stroke="#E3E0D5"/><circle cx="-4.5" cy="-.5" r="1.7" fill="#B5532F"/><circle cx="0" cy="-.5" r="1.7" fill="#B5532F"/><circle cx="4.5" cy="-.5" r="1.7" fill="#B5532F"/></g>
      <g class="bubble alert" transform="translate(15 -82)"><circle r="8" fill="#B3261E"/><text y="4" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">!</text></g>
      <g class="tag" transform="translate(0 -98)"><rect y="-12" height="22" rx="11"/><circle class="tdot" cy="-1" r="3.5"/><text y="3" text-anchor="middle"></text></g>`;
    return g;
  }
  function updateAgent(g, a) {
    g.setAttribute('class', 'agent ' + a.status + (g._mv ? ' walking' : ''));
    g.setAttribute('aria-label', a.name + ', ' + (STATUS[a.status] || a.status));
    // swap skin + ring colour live when lead status changes
    const wantRef = personRef(a);
    const bodyUse = g.querySelector('.body use'); if (bodyUse && bodyUse.getAttribute('href') !== wantRef) bodyUse.setAttribute('href', wantRef);
    const ring = g.querySelector('.ring'); if (ring) ring.setAttribute('stroke', isHelper(a) ? '#9FD0D6' : a.isLead ? '#E9C46A' : '#B5532F');
    const name = a.name.length > 22 ? a.name.slice(0, 21) + '…' : a.name, w = name.length * 6.5 + 38;
    const r = g.querySelector('.tag rect'); r.setAttribute('x', -w / 2); r.setAttribute('width', w);
    const t = g.querySelector('.tag text'); t.textContent = name; t.setAttribute('x', 6); const dt = g.querySelector('.tdot'); dt.setAttribute('cx', -w / 2 + 12); dt.setAttribute('fill', dotColor[a.status]);
  }
  svg.addEventListener('pointerover', (e) => { const g = e.target.closest('#layer-free .agent'); if (g && g.parentNode.lastChild !== g) g.parentNode.appendChild(g); });

  // ── movement ───────────────────────────────────────────────────────────────
  // People walk only on open floor (assets/nav.js: A* over a grid of the floor plan, so walls, glass, desks, sofas, tables and plants are never crossed),
  // through the door gaps, at a human pace; and they sit down properly: walk to the approach point in front of the seat, turn, step back into it
  // while the body lowers onto it (--sitk, the same variable the poses use). Standing up is the reverse. ?nav=1 draws the grid, the doors and every path.
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DBG = /[?&]nav=1/.test(location.search);
  const inv = (sx, sy) => { const a = (sx - 600) / 0.8, b = (sy - 110) / 0.462; return [(a + b) / 2, (b - a) / 2]; }; // screen -> floor (world) units
  const proj = (x, y) => [600 + 0.8 * (x - y), 110 + 0.462 * (x + y)]; // floor -> screen, same as scene.js P()
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const rng = (a, b) => a + Math.random() * (b - a);
  const SPEED = 72, BRISK = 112; // world units per second: a calm walk, and a hurry (an agent that needs help)
  // where a place is, in floor units. Seats also have an approach point in front of them (ap), the desk they belong to, and the arms they use.
  function dest(p) {
    if (p.t === 'desk') { const [x, y] = inv(...S.desks[p.i]); const ap = [[x, y - 70], [x - 40, y - 39], [x + 36, y - 39]].find((c) => !VNav.rawBlocked(S.nav, c[0], c[1])) || [x, y - 70]; // behind the chair, or from its side when something (the lead desk) is in the way
      return { at: [x - 6, y - 39.2], ap, desk: p.i, arms: '--ad' }; }
    if (p.t === 'cafe') { const [x, y] = inv(...S.cafe[p.i]); return S.spotProp[p.i] === 'read' ? { at: [x, y], ap: [x, y + 40], arms: '--ar', read: true } : { at: [x, y] }; }
    if (p.t === 'helper') return { at: inv(...S.helper) };
    return { at: inv(p.xy[0], p.xy[1]) };
  }
  const seatOf = (p) => { const d = p && dest(p); return d && d.ap ? d : null; };
  const flip = (g, f) => { if (g._flip === f) return; g._flip = f; const u = g.querySelector('.body > use'); if (u) u.setAttribute('transform', f < 0 ? 'scale(-1 1)' : ''); };
  // body pose between standing (k=0) and seated (k=1): sets the pose variables inline; clearPose hands control back to the CSS poses
  const PV = ['--as', '--ad', '--ar', '--am', '--ls', '--lsit', '--sitk', '--shd'];
  function pose(g, k, arms) {
    const st = g.style, sit = k > 0.5;
    st.setProperty('--sitk', k.toFixed(2)); st.setProperty('--shd', sit ? 'none' : 'inline'); st.setProperty('--ls', sit ? 'none' : 'inline'); st.setProperty('--lsit', sit ? 'inline' : 'none');
    for (const v of ['--as', '--ad', '--ar', '--am']) st.setProperty(v, 'none');
    st.setProperty(k > 0.75 && arms ? arms : '--as', 'inline');
  }
  const clearPose = (g) => PV.forEach((v) => g.style.removeProperty(v));
  const clearGait = (g) => { g.classList.remove('walking'); g.style.removeProperty('--sl'); g.style.removeProperty('--sr'); const b = g.querySelector('.body'); if (b) b.style.transform = ''; };

  // the walker: one ticker moves everybody along their polyline at a constant speed
  const movers = new Set(), doorBusy = new Map(); let lastT = 0;
  function step(m, dt, now) {
    const g = m.g, pts = m.pts;
    if (!g.isConnected) { movers.delete(m); return; }
    if (m.wait > 0) { m.wait -= dt; return; }
    let sp = m.speed; const door = VNav.doorAt(S.nav, m.x, m.y);
    if (door >= 0) { // doorway: slow down a little, and one person at a time (the other waits a moment)
      const st = doorBusy.get(door);
      if (m.door !== door) { if (st && st.by !== m && now - st.t < 400 && m.waits < 3) { m.wait = 0.3; m.waits++; return; } m.door = door; m.waits = 0; }
      doorBusy.set(door, { by: m, t: now }); sp *= 0.7;
    } else m.door = -1;
    let rem = sp * dt;
    while (rem > 0 && m.i < pts.length - 1) { const L = m.segL[m.i] - m.off; if (rem >= L) { rem -= L; m.i++; m.off = 0; } else { m.off += rem; rem = 0; } }
    const end = m.i >= pts.length - 1, k = end ? pts.length - 2 : m.i, a = pts[k], b = pts[k + 1], L = m.segL[k] || 1, t = end ? 1 : m.off / L;
    m.x = a[0] + (b[0] - a[0]) * t; m.y = a[1] + (b[1] - a[1]) * t;
    const sdx = 0.8 * ((b[0] - a[0]) - (b[1] - a[1])); if (Math.abs(sdx) > 0.25 * L) flip(g, sdx < 0 ? -1 : 1); // face the way we walk
    m.phase += sp * dt / 26 * Math.PI; // one stride is about 26 units: legs lift in turn and the body bobs on every step (updated ~12x a second: restyling the figures every frame costs more than it shows)
    if ((m.gait -= dt) <= 0) { m.gait = 0.08; const s = Math.sin(m.phase), q = (v) => (Math.round(v * 3) / 3).toFixed(1); g.style.setProperty('--sl', q(Math.max(0, s) * -5)); g.style.setProperty('--sr', q(Math.max(0, -s) * -5)); m.body.style.transform = `translateY(${q(-Math.abs(s) * 2.4)}px)`; }
    const [sx, sy] = proj(m.x, m.y); g._pos = [sx, sy]; g.setAttribute('transform', tr(sx, sy));
    if (end) { movers.delete(m); g._mv = null; clearGait(g); m.done(); }
  }
  function moveTick() { const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; for (const m of [...movers]) step(m, dt, now); if (!movers.size) gsap.ticker.remove(moveTick); }
  function startWalk(g, pts, speed, done) {
    const segL = pts.slice(1).map((p, k) => dist(p, pts[k]));
    const m = { g, pts, segL, i: 0, off: 0, speed, x: pts[0][0], y: pts[0][1], phase: 0, gait: 0, wait: 0, waits: 0, door: -1, body: g.querySelector('.body'), done };
    g._mv = m; g.classList.add('walking'); movers.add(m); if (movers.size === 1) { lastT = performance.now(); gsap.ticker.add(moveTick); }
    if (DBG) dbgPath(pts);
  }
  function cancelMove(g) { if (g._mv) { movers.delete(g._mv); g._mv = null; } if (g._tw) { g._tw.kill(); g._tw = null; } clearGait(g); }

  // sit down / stand up: the person slides between the seat and its approach point while the body lowers or rises
  function seatMove(g, d, toSeat, done) {
    const desk = d.desk != null ? S.desks[d.desk] : null, o = { u: toSeat ? 0 : 1 }, A = toSeat ? d.ap : d.at, B = toSeat ? d.at : d.ap;
    const put = (u) => { const x = A[0] + (B[0] - A[0]) * u, y = A[1] + (B[1] - A[1]) * u, [sx, sy] = proj(x, y); g._pos = [sx, sy];
      g.setAttribute('transform', desk ? `translate(${((sx - desk[0]) / 1.1 - 24).toFixed(1)} ${((sy - desk[1]) / 1.1 + 19).toFixed(1)})` : tr(sx, sy)); pose(g, toSeat ? u : 1 - u, d.arms); };
    flip(g, 1); g.dataset.pose = ''; g.dataset.prop = '';
    if (desk) deskG(d.desk).querySelector('.seat').appendChild(g); // inside the desk group, so the desk stays in front of the person
    else if (toSeat) free.appendChild(g);
    put(0);
    g._tw = gsap.to(o, { u: 1, duration: 0.7, delay: toSeat ? 0.25 : 0.1, ease: 'power2.inOut', onUpdate: () => put(o.u), onComplete: () => {
      g._tw = null; clearPose(g);
      if (toSeat) { if (d.read) g.dataset.pose = 'read'; g._seat = d; }
      else { g._seat = null; walkL.appendChild(g); const [sx, sy] = proj(d.ap[0], d.ap[1]); g._pos = [sx, sy]; g.setAttribute('transform', tr(sx, sy)); }
      done(); } });
  }
  // ?nav=1 overlay: blocked cells (red), walled-in pockets (yellow), doors (green) and the paths people are walking (blue)
  let dbgG = null;
  function dbgScene() {
    const W = S.nav.W, D = S.nav.D, dr = (d) => `<rect x="${d.x - (d.hz ? d.w / 2 : 6)}" y="${d.y - (d.hz ? 6 : d.w / 2)}" width="${d.hz ? d.w : 12}" height="${d.hz ? 12 : d.w}" fill="#3FD07A" opacity=".6"/>`;
    svg.insertAdjacentHTML('beforeend', `<g id="nav-dbg" transform="matrix(0.8 0.462 -0.8 0.462 600 110)" pointer-events="none"><image href="${VNav.debugImage(S.nav)}" width="${W}" height="${D}" preserveAspectRatio="none" style="image-rendering:pixelated"/>${S.nav.doors.map(dr).join('')}<g id="nav-paths"></g></g>`);
    dbgG = svg.querySelector('#nav-paths');
  }
  function dbgPath(pts) { if (!dbgG || !dbgG.isConnected) return; const l = document.createElementNS(NS, 'polyline'); l.setAttribute('points', pts.map((p) => p[0].toFixed(0) + ',' + p[1].toFixed(0)).join(' ')); l.setAttribute('fill', 'none'); l.setAttribute('stroke', '#3CB4FF'); l.setAttribute('stroke-width', '3'); dbgG.appendChild(l); setTimeout(() => l.remove(), 20000); }
  // go to a place (dest()): stand up if seated, walk the open floor, sit down if it is a seat. done() runs on arrival.
  function goTo(g, d, opt, done) {
    cancelMove(g);
    const run = () => {
      walkL.appendChild(g); g.dataset.prop = ''; g.dataset.pose = '';
      const from = g._pos ? inv(g._pos[0], g._pos[1]) : d.ap || d.at, r = VNav.route(S.nav, from, d.ap || d.at);
      const sp = (opt && opt.speed) || (g.classList.contains('help') ? BRISK : SPEED + (hash(g.dataset.key || '') % 17) - 8); // 'help' (a failed run) hurries
      if (DBG) (window.__paths ||= []).push({ pts: r.pts, hs: r.hs, he: r.he, key: g.dataset.key });
      if (r.pts.length < 2) r.pts.push(r.pts[0]);
      startWalk(g, r.pts, sp, () => (d.ap ? seatMove(g, d, true, done) : (flip(g, 1), done())));
    };
    if (g._seat) seatMove(g, g._seat, false, run); else run();
  }
  // a short stroll near home and back (people who rest standing up)
  function startWander(g, hx, hy) {
    if (!window.gsap || reduced()) return; stopWander(g);
    let alive = true; g._wanderKill = () => { alive = false; };
    const h = inv(hx, hy), loop = () => { if (!alive || !g.isConnected) return;
      goTo(g, { at: VNav.nearest(S.nav, h[0] + rng(-26, 26), h[1] + rng(-26, 26)) }, null, () => { if (alive) gsap.delayedCall(rng(4, 18), () => alive && goTo(g, { at: h }, null, () => alive && gsap.delayedCall(rng(6, 20), loop))); }); };
    gsap.delayedCall(rng(0, 12), loop);
  }
  function stopWander(g) { if (g._wanderKill) { g._wanderKill(); g._wanderKill = null; } cancelMove(g); g.dataset.pose = ''; }

  // ── a resting person's day ─────────────────────────────────────────────────
  // Seated spots (prop 'read') read a book; standing spots hold a phone, a tablet or a mug and take a few steps.
  // Every so often anyone gets up, walks to a free place at the coffee counter, drinks, and walks back.
  const coffeeBusy = new Map(); // "room:point" -> time taken (stale claims expire, so a rebuilt floor never jams the counter)
  function startLife(g, spot, hx, hy) {
    if (!window.gsap || reduced()) { g.dataset.pose = S.spotProp[spot] === 'read' ? 'read' : ''; return; }
    stopWander(g);
    let alive = true, held = null; const tw = [];
    g._wanderKill = () => { alive = false; tw.forEach((t) => t.kill()); if (held) coffeeBusy.delete(held); held = null; };
    const reading = S.spotProp[spot] === 'read', room = S.spotRoom ? S.spotRoom[spot] : -1, home = dest({ t: 'cafe', i: spot });
    const counter = (room >= 0 && S.rooms[room] && S.rooms[room].coffee) || [];
    const settle = () => { g._pos = [hx, hy]; g.dataset.pose = reading ? 'read' : ''; g.dataset.prop = reading ? '' : (S.spotProp[spot] || ''); if (reading) g._seat = home; };
    const later = (sec, fn) => tw.push(gsap.delayedCall(sec, () => { if (alive && g.isConnected) fn(); }));
    const go = (d, done) => goTo(g, d, null, () => { if (alive) done(); });
    const loop = () => {
      const now = Date.now(), open = counter.map((c, k) => k).filter((k) => !(now - (coffeeBusy.get(room + ':' + k) || 0) < 60000));
      if (open.length && Math.random() < (reading ? 0.55 : 0.4)) {
        const k = open[Math.floor(Math.random() * open.length)]; held = room + ':' + k; coffeeBusy.set(held, now);
        go({ at: inv(counter[k][0], counter[k][1]) }, () => { g.dataset.pose = 'mug';
          later(rng(8, 18), () => go(home, () => { coffeeBusy.delete(held); held = null; settle(); later(rng(30, 80), loop); })); });
      } else if (!reading) {
        const h = inv(hx, hy); go({ at: VNav.nearest(S.nav, h[0] + rng(-26, 26), h[1] + rng(-26, 26)) }, () => later(rng(4, 12), () => go(home, () => { settle(); later(rng(12, 35), loop); })));
      } else later(rng(20, 50), loop);
    };
    settle();
    later(rng(reading ? 12 : 4, reading ? 70 : 30), loop);
  }

  function attach(g, p) {
    stopWander(g);
    if (p.t === 'desk') { deskG(p.i).querySelector('.seat').appendChild(g); g.setAttribute('transform', ''); }
    else if (p.t === 'helper') {
      const slot = svg.querySelector('#helper-slot'); if (slot) { slot.appendChild(g); g.setAttribute('transform', ''); } else { free.appendChild(g); g.setAttribute('transform', tr(S.helper[0], S.helper[1])); }
    }
    else { const [x, y] = posOf(p); free.appendChild(g); g.setAttribute('transform', tr(x, y)); }
    flip(g, 1); g._seat = seatOf(p);
    g.dataset.prop = p.t === 'cafe' ? (S.spotProp[p.i] || 'rest') : '';
    const [bx, by] = p.t === 'desk' ? [S.desks[p.i][0] + 26.4, S.desks[p.i][1] - 20.9] : posOf(p); g._pos = [bx, by]; g._home = [bx, by];
    // resting people live their day: read on a sofa, get up for a coffee, come back
    if (p.t === 'cafe') startLife(g, p.i, bx, by);
  }

  function walk(g, from, to) {
    stopWander(g);
    if (!window.gsap || reduced() || !from) return attachAny(g, to);
    goTo(g, dest(to), null, () => attachAny(g, to));
  }
  function leave(g) { stopWander(g); if (window.gsap) gsap.to(g, { opacity: 0, duration: 0.5, onComplete: () => g.remove() }); else g.remove(); }

  function renderRooms() {
    const cs = svg.querySelector("#ceo-slot"); if (cs && !cs.firstChild) cs.innerHTML = '<g class="ceo-g" tabindex="0" role="button" aria-label="Talk to the CEO"><g transform="scale(1.25)"><use href="#ceo"/></g><g class="tag" transform="translate(0 -104)"><rect x="-64" y="-13" width="128" height="24" rx="12" fill="#2B2416"/><text y="3" text-anchor="middle" fill="#E9C46A" font-size="12" font-weight="600">CEO · Talk to me</text></g></g>';
    renderDepts();
    S.rooms.forEach((r, i) => {
      const d = V.departments[i], slot = svg.querySelector(`.lead-slot[data-room="${i}"]`), screen = svg.querySelector(`.room-screen[data-room="${i}"]`);
      if (!slot) return;
      if (screen) screen.style.color = d ? d.color : '#3A3935';
      const fl = svg.querySelector(`.room-floor[data-room="${i}"]`), nm = svg.querySelector(`.room-name[data-room="${i}"]`);
      if (fl) { fl.setAttribute("fill", d ? d.color : "#2A2A2E"); fl.setAttribute("opacity", d ? "0.16" : "0.6"); }
      if (nm) nm.textContent = d ? d.name : "";
      const ac = svg.querySelector(`.room-accent[data-room="${i}"]`); if (ac) ac.setAttribute('fill', d ? d.color : '#55555C');
      if (d) {
        const leadA = d.lead_key ? D.agents.find((a) => a.key === d.lead_key) : null;
        const label = leadA ? (leadA.name.length > 22 ? leadA.name.slice(0, 21) + '…' : leadA.name) : d.name + ' Lead';
        const w = Math.min(label.length, 24) * 6.5 + 26;
        const body = leadA
          ? `${leadA.status === 'off' ? `<g transform="scale(1.1)" opacity="0.4"><use href="${personRef(leadA)}" style="color:${colorOf(leadA.key)}"/></g>` : ''}<g class="tag" transform="translate(0 -110)"><rect x="${-w / 2}" y="-12" width="${w}" height="22" rx="11" fill="${d.color}" stroke="${d.color}"/><text y="3" text-anchor="middle" fill="#141413" font-weight="600">${esc(label)}</text></g>`
          : `<g transform="scale(1.15)" opacity="0.35"><use href="#lead" style="color:${d.color}"/></g><g class="tag" transform="translate(0 -102)"><rect x="-62" y="-12" width="124" height="22" rx="11" fill="#FAF9F5" stroke="#B5532F" stroke-dasharray="4 3"/><text y="3" text-anchor="middle" fill="#B5532F">⭐ Set a lead</text></g>`;
        slot.innerHTML = `<g class="lead" tabindex="0" role="button" data-dept="${d.id}" aria-label="${d.lead_key ? esc(label) : 'Set a lead for ' + esc(d.name)}">${body}</g>`;
      } else {
        slot.innerHTML = `<g class="add-room" tabindex="0" role="button" aria-label="Add a department"><g class="tag" transform="translate(0 -24)"><rect x="-56" y="-12" width="112" height="22" rx="11" fill="#FAF9F5" stroke="#B0AEA5" stroke-dasharray="4 3"/><text y="3" text-anchor="middle" fill="#5E5D59">+ Department</text></g></g>`;
      }
    });
  }

  // ---------- building: apartments of 4 departments, stacked as floors ----------
  const floorCount = () => Math.max(1, Math.ceil(D.departments.length / PER));
  function floorView() {
    if (floor === null) return { departments: [], agents: [] };
    if (floor >= floorCount()) floor = floorCount() - 1;
    const deps = D.departments.slice(floor * PER, floor * PER + PER), ids = new Set(deps.map((d) => d.id)), known = new Set(D.departments.map((d) => d.id));
    // the messenger is in every apartment; agents with no department live on the ground floor
    return { departments: deps, agents: D.agents.filter((a) => isHelper(a) || ids.has(a.dept) || (floor === 0 && !known.has(a.dept))) };
  }
  function floorOfAgent(key) {
    const a = D.agents.find((x) => x.key === key); if (!a) return null;
    const i = D.departments.findIndex((d) => d.id === a.dept); return i < 0 ? 0 : Math.floor(i / PER);
  }
  function floorsInfo() {
    return Array.from({ length: floorCount() }, (_, k) => {
      const depts = D.departments.slice(k * PER, k * PER + PER).map((d) => { const m = D.agents.filter((a) => a.dept === d.id); return { id: d.id, name: d.name, color: d.color, count: m.length, working: m.filter((a) => a.status === 'working').length }; });
      return { depts, total: depts.reduce((n, d) => n + d.count, 0), working: depts.reduce((n, d) => n + d.working, 0) };
    });
  }
  function showBuilding() {
    render.over = [];
    const info = floorsInfo(), key = 'B:' + JSON.stringify(info);
    if (key !== sceneKey) {
      sceneKey = key;
      for (const k of Object.keys(els)) { els[k].remove(); delete els[k]; delete places[k]; }
      const B = VBuilding.build(info);
      svg.innerHTML = B.inner; setOutside(B); free = walkL = null; bBoxes = B.boxes;
      VB0 = { ...vbOf(B) }; Object.assign(vb, VB0); setVB();
    }
    renderDepts(); renderFloorNav();
  }
  function renderFloorNav() { renderFloorNav0(); const fb = $('#floor-badge'); if (!fb) return; if (floor === null) { fb.hidden = true; return; } fb.hidden = false; fb.textContent = 'Floor ' + (floor + 1) + ' · ' + (floorsInfo()[floor].depts.map((d) => d.name).join(' · ') || 'empty'); }
  function renderFloorNav0() {
    let nav = $('#floornav'); if (!nav) { nav = document.createElement('div'); nav.id = 'floornav'; nav.className = 'floornav'; nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', 'Building floors'); stage.appendChild(nav); }
    const n = floorCount();
    if (floor === null) {
      const info = floorsInfo();
      nav.innerHTML = '<span class="fn-title">Pick an apartment</span>' + info.map((fl, k) => `<button type="button" data-floor="${k}" aria-label="Floor ${k + 1}"><b><span class="fx">Floor </span>${k + 1}</b> <small>${fl.depts.map((d) => esc(d.name)).join(' · ') || 'empty'}</small></button>`).reverse().join('');
    } else {
      nav.innerHTML = `<button type="button" data-fn="building">🏢 Building</button><div class="fn-row"><button type="button" data-fn="up" aria-label="Floor up" ${floor >= n - 1 ? 'disabled' : ''}>▲</button><span class="fn-lbl">Floor ${floor + 1} / ${n}</span><button type="button" data-fn="down" aria-label="Floor down" ${floor <= 0 ? 'disabled' : ''}>▼</button></div>`;
    }
  }
  // select an apartment in the tower: floors above lift away, the camera drops onto it, then the apartment opens
  function selectFloor(k) {
    if (busy || k < 0 || k >= floorCount()) return;
    const fls = [...svg.querySelectorAll('.fl')], box = bBoxes[k];
    if (floor !== null || !window.gsap || !fls.length || !box) return enterFloor(k);
    busy = true;
    gsap.to(fls.filter((g) => +g.dataset.f > k), { y: -520, opacity: 0, duration: 0.55, ease: 'power2.in' });
    const nw = Math.min(VB0.w, box.w * 1.15), to = { w: nw, h: nw * VB0.h / VB0.w }; to.x = box.x + box.w / 2 - to.w / 2; to.y = box.y + box.h / 2 - to.h / 2;
    gsap.to(vb, { ...to, duration: 0.8, ease: 'power2.inOut', onUpdate: () => { clampVB(); setVB(); }, onComplete: () => {
      gsap.to(svg, { opacity: 0, duration: 0.2, onComplete: () => { enterFloor(k); gsap.to(svg, { opacity: 1, duration: 0.35, onComplete: () => { busy = false; } }); } });
    } });
  }
  function enterFloor(k) { floor = Math.max(0, Math.min(floorCount() - 1, k)); sceneKey = ''; render(); }
  function stepFloor(d) {
    if (floor === null || busy) return; const k = floor + d; if (k < 0 || k >= floorCount()) return;
    if (!window.gsap) return enterFloor(k);
    busy = true; gsap.to(svg, { opacity: 0, duration: 0.18, onComplete: () => { enterFloor(k); gsap.to(svg, { opacity: 1, duration: 0.3, onComplete: () => { busy = false; } }); } });
  }
  function showTower() {
    if (floor === null || busy) return; floor = null; sceneKey = ''; render();
    if (window.gsap) { gsap.set(svg, { opacity: 1 }); gsap.from(svg.querySelectorAll('.fl'), { y: -420, opacity: 0, duration: 0.5, stagger: 0.07, ease: 'power2.out' }); }
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-floor],[data-fn]'); if (!t || !t.closest('#floornav')) return;
    if (t.dataset.floor !== undefined) selectFloor(+t.dataset.floor); else if (t.dataset.fn === 'building') showTower(); else stepFloor(t.dataset.fn === 'up' ? 1 : -1);
  });
  svg.addEventListener('click', (e) => { const g = e.target.closest('.fl'); if (g && floor === null) selectFloor(+g.dataset.f); });
  document.addEventListener('keydown', (e) => {
    if (current || e.target.closest('input,textarea,select')) return;
    if (e.key === 'ArrowUp') { if (floor !== null) { e.preventDefault(); stepFloor(1); } } else if (e.key === 'ArrowDown') { if (floor !== null) { e.preventDefault(); stepFloor(-1); } } else if (e.key === 'Escape') showTower();
  });

  function buildScene() {
    const key = 'F' + floor + ':' + V.departments.map((d) => d.id).join(','); if (key === sceneKey) return;
    sceneKey = key; S = VScene.build(V.departments);
    for (const k of Object.keys(els)) { els[k].remove(); delete els[k]; delete places[k]; }
    svg.innerHTML = S.inner; setOutside(S); free = $('#layer-free'); walkL = $('#layer-walk'); if (DBG) dbgScene();
    VB0 = { ...vbOf(S) }; Object.assign(vb, VB0); setVB();
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
    const busy = (id) => D.agents.filter((a) => a.dept === id && a.status === 'working').length;
    box.innerHTML = '<span class="depts-h">Departments</span>' + ((floor === null ? D.departments : V.departments).map((d, i) => `<button type="button" class="dept-btn" data-room-i="${i}" data-dept="${d.id}"><span class="dd" style="background:${d.color}"></span><span class="dn">${esc(d.name)}</span><span class="dc">${count(d.id)}${busy(d.id) ? ' · ' + busy(d.id) + ' working' : ''}</span></button>`).join('') || '<p class="empty">No departments yet.</p>') + '<button type="button" class="dept-btn add" id="dept-add">+ New department</button>';
  }

  function render() {
    V = floorView();
    if (floor === null) { showBuilding(); sideRender(); return; }
    sceneRender(); renderFloorNav(); sideRender();
  }
  function sceneRender() {
    buildScene();
    const A = V.agents;
    const working = A.filter((a) => a.status === 'working' && !isHelper(a));
    const cafe = A.filter((a) => (a.status === 'idle' || a.status === 'help') && !isHelper(a));
    const off = A.filter((a) => a.status === 'off' && !isHelper(a));
    const helpers = A.filter(isHelper);

    const next = {}, used = { desk: new Set(), cafe: new Set() }, over = [];
    const roomOf = (a) => { const i = V.departments.findIndex((x) => x.id === a.dept); return i >= 0 && i < S.rooms.length ? i : -1; };
    const pick = (a, t, choices) => { const p = places[a.key]; if (p && p.t === t && choices.includes(p.i) && !used[t].has(p.i)) return p.i;
      // about half of the resting people take a sofa/armchair seat and read; the rest spread over the lounge floor
      const h = Math.imul(hash(a.key) ^ 0x9e3779b9, 2654435761) >>> 0;
      if (t === 'cafe' && h % 2 === 0) { const seats = choices.filter((i) => S.spotProp[i] === 'read' && !used[t].has(i)); if (seats.length) return seats[(h >>> 3) % seats.length]; }
      if (t === 'cafe' && choices.length) { const s0 = (h >>> 1) % choices.length; for (let k = 0; k < choices.length; k++) { const i = choices[(s0 + k * 7) % choices.length]; if (!used[t].has(i)) return i; } }
      return choices.find((i) => !used[t].has(i)); };
    // leads sit at their lead-desk when idle, not in the lounge
    const leadKeys = new Set(D.departments.map((d) => d.lead_key).filter(Boolean));
    for (const a of working) {
      const r = roomOf(a);
      // the lead runs the room: standing at the lead spot, never sitting at a desk
      if (leadKeys.has(a.key) && r >= 0) { next[a.key] = { t: 'leaddesk', xy: S.rooms[r].lead }; continue; }
      let i = pick(a, 'desk', r >= 0 ? S.rooms[r].desks : S.hot); if (i === undefined) i = pick(a, 'desk', S.hot); if (i === undefined) { over.push(a); continue; } next[a.key] = { t: 'desk', i }; used.desk.add(i);
    }
    for (const a of cafe) {
      if (leadKeys.has(a.key)) { const r = roomOf(a); if (r >= 0) { next[a.key] = { t: 'leaddesk', xy: S.rooms[r].lead }; continue; } }
      const r = roomOf(a); let i = r >= 0 ? pick(a, 'cafe', S.rooms[r].rest) : undefined; if (i === undefined) i = pick(a, 'cafe', S.cafeIdx); if (i === undefined) { over.push(a); continue; } next[a.key] = { t: 'cafe', i }; used.cafe.add(i);
    }

    // ── Office Helper: messenger corner when idle/off; first dept lead room when working ──
    for (const a of helpers) {
      if (a.status === 'working') {
        // walk to the first valid dept lead position (or fall back to helper spot)
        const targetRoom = S.rooms.find((r, i) => V.departments[i] && !r.ghost);
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
      else if (g._errand) { updateAgent(g, a); } // the Office Helper is out on a build errand; it goes to its place when back
      else { updateAgent(g, a); const o = places[a.key]; if (!o || o.t !== p.t || o.i !== p.i || o.xy !== p.xy || (p.xy && o.xy && (p.xy[0]!==o.xy[0]||p.xy[1]!==o.xy[1]))) walkAny(g, o, p); }
      places[a.key] = p;
      if (p.t === 'desk') deskG(p.i).querySelector('.desk-top').style.color = colorOf(a.key);
    }
    for (const k of Object.keys(els)) if (!A.find((a) => a.key === k)) { leave(els[k]); delete els[k]; delete places[k]; }
    renderRooms();
    // ── client view: dim everything outside access_dept ───────────────────
    if (D.role === 'client') {
      const allowed = new Set((D.access_depts || []).map(Number));
      // CEO always dimmed + no interaction for clients
      svg.querySelectorAll('.ceo-g').forEach((el) => { el.setAttribute('opacity','0.18'); el.setAttribute('pointer-events','none'); el.removeAttribute('tabindex'); });
      // rooms + leads: only allowed depts are lit + interactive
      svg.querySelectorAll('.lead-slot,.room-screen,.room-floor,.room-name,.add-room,.lead').forEach((el) => {
        const roomIdx = el.dataset.room !== undefined ? Number(el.dataset.room) : null;
        const deptId = el.dataset.dept ? Number(el.dataset.dept) : (roomIdx !== null ? V.departments[roomIdx]?.id : null);
        const mine = allowed.size > 0 && allowed.has(deptId);
        el.setAttribute('opacity', mine ? '1' : '0.08');
        el.setAttribute('pointer-events', mine ? 'auto' : 'none');
        if (!mine) el.removeAttribute('tabindex'); else el.setAttribute('tabindex','0');
        // dim the room floor colour to near-black for locked rooms
        if (el.classList.contains('room-floor') && !mine) el.setAttribute('fill', '#111115');
      });
      // agents: always dim + no click, but keep visible so names show on hover
      svg.querySelectorAll('.agent').forEach((el) => {
        el.setAttribute('opacity', '0.4');
        el.setAttribute('pointer-events', 'none');
        el.removeAttribute('tabindex');
      });
    }
    render.over = over;
  }
  function sideRender() {
    const A = D.agents, working = A.filter((a) => a.status === 'working' && !isHelper(a)), cafe = A.filter((a) => (a.status === 'idle' || a.status === 'help') && !isHelper(a)), off = A.filter((a) => a.status === 'off' && !isHelper(a));
    const over = render.over || [];
    const help = A.filter((a) => a.status === 'help').length;
    $('#n-working').textContent = working.length; $('#n-idle').textContent = cafe.length - help; $('#n-help').textContent = help;
    svg.querySelector('#board-bar1')?.setAttribute('opacity', working.length ? 1 : 0.35); svg.querySelector('#board-bar2')?.setAttribute('opacity', cafe.length ? 1 : 0.35);
    const bl = $('#board-line'); if (bl) bl.textContent = A.length ? working.length + ' working · ' + cafe.length + ' resting' : 'Connect n8n to start';
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
    if (p.t === 'leaddesk') { free.appendChild(g); g.setAttribute('transform', tr(p.xy[0], p.xy[1])); g._pos = [...p.xy]; g._home = [...p.xy]; return; }
    if (p.t === 'helperworking') {
      const [x, y] = p.xy; free.appendChild(g); g.setAttribute('transform', tr(x, y)); g._pos = [x, y];
    } else {
      attach(g, p);
    }
  }
  // every kind of place (desk, lounge spot, lead desk, messenger corner) is reached the same way: walk() -> goTo()
  const walkAny = walk;
  if (DBG) { const h = document.createElement('div'); h.id = 'dev-hud'; h.style.cssText = 'position:fixed;left:50%;bottom:4px;transform:translateX(-50%);z-index:99;font:11px/1.4 monospace;background:#000c;color:#9f9;padding:4px 7px;border-radius:6px;pointer-events:none';
    document.body.appendChild(h); let n = 0, t0 = performance.now(); const tk = (t) => { n++; if (t - t0 >= 1000) { h.textContent = Math.round(n * 1000 / (t - t0)) + ' fps · ' + svg.querySelectorAll('*').length + ' nodes · ' + S.nav.rects.length + ' rects · detail ' + (lodNear ? 'on' : 'off'); n = 0; t0 = t; } requestAnimationFrame(tk); }; requestAnimationFrame(tk); }
  if (DBG) window.__vo = { scene: () => S, els, places, dest, goTo, inv, proj, movers: () => movers.size };

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
    if (!els[key] || floor === null) { const k = floorOfAgent(key); if (k !== null && k !== floor) { enterFloor(k); setTimeout(() => focusAgent(key), 900); } return; }
    const g = els[key]; if (!g || !g._pos) return;
    document.querySelectorAll('.agent.found').forEach((x) => x.classList.remove('found')); g.classList.add('found'); setTimeout(() => g.classList.remove('found'), 4000);
    const nw = Math.min(VB0.w, VB0.w / 2.2), to = { w: nw, h: nw * VB0.h / VB0.w }; to.x = g._pos[0] - to.w / 2; to.y = g._pos[1] - 40 - to.h / 2;
    if (window.gsap) gsap.to(vb, { ...to, duration: 0.6, ease: 'power2.inOut', onUpdate: () => { clampVB(); setVB(); } }); else { Object.assign(vb, to); clampVB(); setVB(); }
  }
  // ── Office Helper errands for website builds ───────────────────────────────
  // D.builds (from /hook/build): "sent" = the helper takes the brief from the Sniper lead, carries it to PM Tech
  // (Abdallah's builder; out through the exit when PM Tech isn't on this floor) and comes back.
  // "done" = it comes back in with the live link and hands it to the lead. "failed" = it tells the lead.
  // Builds already known when the page opens are not replayed.
  const seenBuild = new Map(), errands = []; let buildsPrimed = false, errandBusy = false;
  function handleBuilds() {
    for (const b of (D && D.builds) || []) {
      if (seenBuild.get(b.job_id) === b.stage) continue;
      seenBuild.set(b.job_id, b.stage); if (buildsPrimed) errands.push(b);
    }
    buildsPrimed = true; runErrand();
  }
  function say(g, text) {
    let s = g.querySelector('.say'); if (s) s.remove(); if (!text) return;
    const w = Math.round(text.length * 6.4 + 18);
    g.insertAdjacentHTML('beforeend', `<g class="say" transform="translate(0 -124)" pointer-events="none"><rect x="${-w / 2}" y="-12" width="${w}" height="22" rx="11" fill="#FAF9F5" stroke="#9FD0D6" stroke-width="1.5"/><path d="M-5 9.5 L0 16 L5 9.5 Z" fill="#FAF9F5"/><text y="3.5" text-anchor="middle" font-size="11.5" font-weight="600" fill="#141413"></text></g>`);
    g.querySelector('.say text').textContent = text;
  }
  function runErrand() {
    if (errandBusy || !errands.length) return;
    if (!window.gsap || reduced() || !S || !walkL || !walkL.isConnected) { errands.length = 0; return; }
    const helper = D.agents.find(isHelper), g = helper && els[helper.key];
    if (!g || !g.isConnected) { errands.length = 0; return; }
    const b = errands.shift(), biz = (b.business || 'the client').slice(0, 26);
    const placed = (a) => a && places[a.key] && els[a.key] && els[a.key].isConnected ? posOf(places[a.key]) : null;
    const lead = D.agents.find((a) => a.isLead && /sniper/i.test(a.realName || a.name)) || D.agents.find((a) => a.isLead);
    const pm = D.agents.find((a) => /pm.?tech/i.test(a.realName || a.name));
    const lp = placed(lead), pp = placed(pm);
    const near = (xy) => { const w = inv(xy[0], xy[1]); return { at: VNav.nearest(S.nav, w[0] - 34, w[1] + 34) }; };
    const exit = { at: VNav.nearest(S.nav, 90, 40) };
    const go = (d) => new Promise((r) => goTo(g, d, { speed: BRISK }, r));
    const wait = (sec) => new Promise((r) => gsap.delayedCall(sec, r));
    const talk = async (t, sec) => { say(g, t); await wait(sec); say(g, ''); };
    const outAndIn = async (t) => { await go(exit); await new Promise((r) => gsap.to(g, { opacity: 0, duration: 0.5, onComplete: r })); await wait(3); gsap.to(g, { opacity: 1, duration: 0.5 }); if (t) await talk(t, 2.2); };
    errandBusy = true; stopWander(g); g._errand = true; say(g, '');
    const reset = () => { g._errand = false; errandBusy = false; }, guard = setTimeout(reset, 90000); // never stuck if the floor is rebuilt mid-errand
    (async () => {
      if (b.stage === 'sent') {
        if (lp) { await go(near(lp)); await talk('Got the brief: ' + biz, 2.6); }
        if (pp) { await go(near(pp)); await talk('New website: ' + biz, 2.6); }
        else await outAndIn('Handed to PM Tech ✓');
      } else if (b.stage === 'done') {
        if (!pp) await outAndIn('The site is live!'); else { await go(near(pp)); await talk('Site ready? Thanks!', 2); }
        if (lp) { await go(near(lp)); await talk('Here is the link: ' + biz, 3); }
      } else if (lp) { await go(near(lp)); await talk('The build failed, check the chat', 3); }
    })().catch(() => {}).finally(() => {
      const p = places[helper.key] || { t: 'helper' };
      if (!g.isConnected) { clearTimeout(guard); reset(); return; }
      goTo(g, dest(p), null, () => { clearTimeout(guard); attachAny(g, p); say(g, ''); reset(); runErrand(); });
    });
  }

  async function load() {
    try {
      D = await api('office');
      document.body.dataset.role = D.role || 'owner';
      if (D.role !== 'client') $('#btn-clients').style.display = '';
      $('#live-dot').className = 'dot ' + (D.errors.length ? 'err' : 'on'); $('#live-text').textContent = 'Live · ' + hhmm(new Date());
      render(); handleBuilds();
    } catch (e) { $('#live-dot').className = 'dot err'; $('#live-text').textContent = 'Offline, retrying'; }
    api('me').then((me) => { if (me.owners) renderOwners(me.owners); }).catch(() => {});
  }

  // ---------- drawer ----------
  const drawer = $('#drawer'), inner = $('#drawer-in'), scrim = $('#scrim');
  function open(html, name) { current = name; inner.innerHTML = html; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); scrim.hidden = false; inner.scrollTop = 0; setTimeout(() => (inner.querySelector('[autofocus]') || $('#drawer-close')).focus(), 50); }
  function close() { current = null; drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); scrim.hidden = true; }
  const botSvg = (c, s = 40, ref = '#bot') => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="-17 -79 34 34"><use href="${ref}" style="color:${c}"/></svg>`;
  const leadSvg = (c, s = 40) => `<svg aria-hidden="true" width="${s}" height="${s}" viewBox="-17 -79 34 34"><use href="#lead" style="color:${c}"/></svg>`;
  const deptName = (id) => (D.departments.find((d) => d.id === id) || {}).name;

  async function openAgent(key) {
    const a = D.agents.find((x) => x.key === key); if (!a) return;
    const avatarSvg = isHelper(a)
      ? `<svg aria-hidden="true" width="40" height="40" viewBox="-17 -79 34 34"><use href="#msgbot" style="color:${colorOf(key)}"/></svg>`
      : botSvg(colorOf(key), 40, personRef(a));
    const head = `<div class="d-head"><span class="avatar">${avatarSvg}</span><div><h2 class="d-title">${esc(a.name)} <button class="rename" type="button" id="rename" aria-label="Rename" title="Rename">✎</button></h2><div class="status ${a.status}">● ${esc(STATUS[a.status])}${a.status === 'working' && a.startedAt ? ' · for ' + dur(Date.now() - Date.parse(a.startedAt)) : ''}</div><div class="d-sub">${esc(TRIG[a.trigger] || a.trigger)} · ${esc(a.inst)} · ${a.runs24} runs today</div></div></div>`;
    open(head + '<p class="empty">Loading its work…</p>', 'agent:' + key);
    let d; try { d = await api('agent?key=' + encodeURIComponent(key)); } catch (e) { inner.innerHTML = head + `<p class="empty">${esc(e.message)}</p>`; return; }
    if (current !== 'agent:' + key) return;
    const runs = d.runs.map((r) => `<li><span class="sd ${r.status}"></span><span class="when">${r.status === 'running' ? 'Running now' : esc(r.status === 'success' ? 'Finished' : r.status)} · ${ago(r.stoppedAt || r.startedAt)}</span><span class="dur">${r.stoppedAt ? dur(Date.parse(r.stoppedAt) - Date.parse(r.startedAt)) : ''}</span><a class="see" href="${esc(d.link)}/executions/${r.id}" target="_blank" rel="noopener" aria-label="See this run in n8n">${/error|crashed/.test(r.status) ? 'See why ↗' : '↗'}</a></li>`).join('') || '<li class="empty">No runs yet.</li>';
    const steps = d.steps.slice(0, 10).map((s) => `<li>${esc(s)}</li>`).join('') + (d.steps.length > 10 ? `<li>+${d.steps.length - 10} more steps</li>` : '');
    const opts = '<option value="">No department</option>' + D.departments.map((x) => `<option value="${x.id}" ${x.id === d.dept ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    const teamOpts = (deptId) => { const x = D.departments.find((y) => y.id === Number(deptId)); return '<option value="">No team</option>' + (x ? x.teams.map((t) => `<option value="${t.id}" ${t.id === d.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('') : ''); };
    const how = d.runnable ? 'It has its own webhook, so your messages go straight to it.' : d.canRun ? 'Ask it anything. Press Run now to start it.' : d.hasHook ? 'Ask it anything. Turn it on to be able to start it from here.' : 'Ask it anything. It starts from its own trigger (' + esc(TRIG[d.trigger] || d.trigger) + ').';
    // An agent with no webhook of its own can't be started. If its department has a chat agent
    // (e.g. Sniper Lead Machine → Sniper Client Chat), Start over hands the flow over to it.
    const flow = d.runnable ? null : (() => {
      const c = D.agents.filter((x) => x.dept === d.dept && x.runnable && x.key !== key);
      return c.find((x) => /chat/i.test(x.name)) || (c.length === 1 ? c[0] : null);
    })();
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
      + `<p class="label">Talk to ${esc(d.name)}</p>`
      + chatUI('agent:' + key, 'Ask it something…')
      + `<div class="chips"><button class="pick" type="button" ${d.runnable ? 'data-say="start"' : flow ? `data-flow="${esc(flow.key)}"` : 'data-reset'}>▶ Start over</button></div>` + `<p class="help">${how}</p>`
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
    // A lead that is a real webhook agent (e.g. Sniper Client Chat) answers its own chat here,
    // so its button flow (district → business type → …) works from the department drawer too.
    const leadHook = !!(leadAgent && leadAgent.runnable);
    const leadTo = leadHook ? 'agent:' + leadAgent.key : 'lead:' + d.id;
    const leadAvatarSvg = leadAgent ? botSvg(colorOf(leadAgent.key), 40, personRef(leadAgent)) : leadSvg(d.color);
    const leadTitle = leadAgent ? esc(leadAgent.name) + ' <small class="muted">(lead)</small>' : esc(d.name) + ' Lead';
    const isClient = D.role === 'client';
    const leadPickOpts = '<option value="">— no lead —</option>' + team.map((a) => `<option value="${esc(a.key)}" ${a.key === d.lead_key ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
    open(`<div class="d-head"><span class="avatar">${leadAvatarSvg}</span><div><h2 class="d-title">${leadTitle}</h2><div class="d-sub">${team.length} employees · ${can} can take tasks${d.mission ? '<br>' + esc(d.mission) : ''}</div></div></div>
      ${isClient ? '' : `<div class="field"><label for="lead-pick">Lead</label><select class="input" id="lead-pick">${leadPickOpts}</select></div>`}
      <p class="label">Talk to the lead</p>${chatUI(leadTo, 'Ask the ' + d.name + ' lead…')}<div class="chips"><button class="pick" type="button" ${leadHook ? 'data-say="start"' : 'data-reset'}>▶ Start over</button></div>
      <form id="f-task" class="field"><label for="task">Give the lead a task</label><textarea class="input" id="task" name="t" required placeholder="Example: check vagent.online and report anything broken" ${focusTask ? 'autofocus' : ''}></textarea>
      <button class="btn primary" type="submit">Send to the team</button><p class="help">The lead sends it to every agent here that has a webhook, waits for them, and gives you one final result.</p></form>
      <div id="task-out"></div>
      ${isClient ? '' : `<p class="label">Teams</p><div class="teams">${(d.teams || []).map((t) => `<span class="pick" style="display:inline-flex;align-items:center;gap:6px">${esc(t.name)} <small class="muted">${D.agents.filter((a) => a.team === t.id).length}</small><button type="button" class="rename" data-del-team="${t.id}" aria-label="Remove team ${esc(t.name)}">✕</button></span>`).join('')}</div>
      <form id="f-team" class="row" style="flex-wrap:nowrap"><label class="sr" for="tn">New team</label><input class="input" id="tn" name="t" placeholder="New team name" required maxlength="40" style="flex:1"><button class="btn" type="submit">Add team</button></form>
      <p class="label">Employees</p><div class="items">${team.map(itemAgent).join('') || '<p class="empty">No employees yet.</p>'}</div>
      <details class="more"><summary>Move agents into ${esc(d.name)}</summary>
      <input class="input" id="pick-q" placeholder="Search agents…" autocomplete="off" aria-label="Search agents to move">
      ${(d.teams || []).length ? `<div class="field"><label for="pick-team">Put them in team</label><select class="input" id="pick-team"><option value="">No team</option>${d.teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>` : ''}
      <div class="checks" id="pick-list"></div>
      <div class="row"><button class="btn primary" type="button" id="move-sel">Move selected here</button><button class="btn" type="button" id="pick-all">Select all shown</button></div></details>`}
      <p class="label">Past tasks</p><div class="items" id="history"><p class="empty">Loading…</p></div>
      ${isClient ? '' : `<p class="label">Edit</p><form id="f-edit" class="field"><input class="input" name="n" value="${esc(d.name)}" aria-label="Department name" required><div class="sw">${DEPT_COLORS.map((c) => `<button type="button" aria-label="Color ${c}" aria-pressed="${c === d.color}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
      <div class="row"><button class="btn" type="submit">Save</button><button class="btn danger" type="button" id="del-dept">Delete department</button></div></form>`}`, 'dept:' + d.id);
    let color = d.color;
    bindChat(leadTo, leadHook ? leadAgent.name : d.name + ' lead');
    if ($('#lead-pick')) $('#lead-pick').onchange = async (e) => {
      try { await api('departments', { body: { deptId: d.id, leadKey: e.target.value || '' } }); toast(e.target.value ? 'Lead set' : 'Lead cleared'); await load(); openDept(d.id, focusTask); } catch (x) { toast(x.message); }
    };
    if (!isClient) {
      if ($('#f-team')) $('#f-team').onsubmit = async (e) => { e.preventDefault(); try { await api("departments", { body: { deptId: d.id, team: e.target.t.value } }); await load(); openDept(d.id); } catch (x) { toast(x.message); } };
      // Tick several agents anywhere in the company and move them into this department in one go.
      if ($('#pick-list')) {
        const pool = D.agents.filter((a) => a.dept !== d.id);
        const chosen = new Set(); // survives re-filtering: searching must never silently drop a tick
        const shown = () => { const s = ($('#pick-q').value || '').trim().toLowerCase(); return pool.filter((a) => !s || (a.name + ' ' + a.inst).toLowerCase().includes(s)); };
        const count = () => { $('#move-sel').textContent = chosen.size ? 'Move ' + chosen.size + ' here' : 'Move selected here'; };
        const paintPicks = () => {
          const show = shown();
          $('#pick-list').innerHTML = show.map((a) => `<label class="check-row"><input type="checkbox" value="${esc(a.key)}"${chosen.has(a.key) ? ' checked' : ''}><span>${esc(a.name)} <small class="muted">· ${esc(where(a))}</small></span></label>`).join('')
            || `<p class="empty">${pool.length ? 'No agents match.' : 'Every agent is already here.'}</p>`;
          count();
        };
        paintPicks();
        $('#pick-q').oninput = paintPicks;
        $('#pick-list').onchange = (ev) => { const c = ev.target; if (c && c.type === 'checkbox') { c.checked ? chosen.add(c.value) : chosen.delete(c.value); count(); } };
        $('#pick-all').onclick = () => { shown().forEach((a) => chosen.add(a.key)); paintPicks(); };
        $('#move-sel').onclick = async (ev) => {
          const keys = [...chosen];
          if (!keys.length) return toast('Tick at least one agent.');
          const btn = ev.target; btn.disabled = true; btn.textContent = 'Moving…';
          try {
            const r = await api('agent', { body: { action: 'assign', keys, deptId: d.id, teamId: ($('#pick-team') || {}).value || null } });
            toast('Moved ' + r.moved + ' to ' + d.name); await load(); openDept(d.id);
          } catch (x) { toast(x.message); btn.disabled = false; btn.textContent = 'Move selected here'; }
        };
      }
      inner.querySelectorAll("[data-del-team]").forEach((b) => (b.onclick = async () => { if (!confirm("Remove this team? Its employees stay in the department.")) return; await api("departments?teamId=" + b.dataset.delTeam, { method: "DELETE" }); await load(); openDept(d.id); }));
      inner.querySelectorAll('.sw button').forEach((b) => (b.onclick = () => { color = b.dataset.c; inner.querySelectorAll('.sw button').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
      if ($('#f-edit')) $('#f-edit').onsubmit = async (e) => { e.preventDefault(); try { await api('departments', { body: { id: d.id, name: e.target.n.value, color } }); toast('Saved'); await load(); openDept(d.id); } catch (x) { toast(x.message); } };
      if ($('#del-dept')) $('#del-dept').onclick = async () => { if (!confirm('Delete the ' + d.name + ' department? Its agents stay, they just leave the team.')) return; await api('departments?id=' + d.id, { method: 'DELETE' }); close(); load(); };
    }
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

  // Set just before opening a drawer: the chat there sends this message as soon as it is painted.
  let pendingSay = null;
  const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v.slice(-30))); } catch {} } };
  const ACT = { create_department: (a) => 'Create department "' + a.name + '"', rename_department: (a) => 'Rename ' + a.department + ' to "' + a.name + '"', set_mission: (a) => 'New mission for ' + a.department + ': ' + a.mission, delete_department: (a) => 'Delete department ' + a.department,
    create_team: (a) => 'New team "' + a.name + '" in ' + a.department, delete_team: (a) => 'Remove team ' + a.team + ' from ' + a.department, move_agent: (a) => 'Move ' + a.agent + ' → ' + a.department + (a.team ? ' / ' + a.team : ''),
    assign_task: (a) => 'Give ' + a.department + ' Lead the task: ' + a.task, rename_agent: (a) => 'Rename ' + a.agent + ' to "' + a.name + '"', run_agent: (a) => 'Start ' + a.agent + ' now', turn_on: (a) => 'Turn on ' + a.agent, turn_off: (a) => 'Turn off ' + a.agent,
    set_lead: (a) => (a.agent ? a.agent + ' becomes lead of ' + a.department : 'Clear lead of ' + a.department) };
  const bubble = (m) => {
    if (m.me) return `<div class="msg me">${esc(m.t)}</div>`;
    // still waiting on a reply — shown again if you reopen the drawer mid-answer
    if (m.pending) return Date.now() - (m.at || 0) > 18e4
      ? `<div class="msg it bad">That answer never came back. Send it again.</div>`
      : `<div class="msg it typing-msg">${esc(m.t)}</div>`;
    let h = `<div class="msg it${m.bad ? ' bad' : ''}">${esc(m.t)}</div>`;
    if (m.buttons && m.buttons.length) h += `<div class="chips">${m.buttons.map((b) => `<button class="pick" type="button" data-say="${esc(b.value)}">${esc(b.label)}</button>`).join('')}</div>`;
    if (m.actions && m.actions.length) h += `<div class="plan" data-plan="${m.id}"><p class="label">The CEO wants to</p><ul>${m.actions.map((a) => `<li>${esc((ACT[a.type] || ((x) => x.type))(a))}</li>`).join('')}</ul>${m.done ? `<div class="result">${esc(m.done)}</div>` : `<div class="row"><button class="btn primary" type="button" data-approve="${m.id}">Approve</button><button class="btn" type="button" data-skip="${m.id}">No thanks</button></div>`}</div>`;
    if (m.project) h += `<div class="plan"><p class="label">Project brief</p><div class="result">${esc(m.project)}</div>${m.done ? `<div class="result" style="margin-top:6px">${esc(m.done)}</div>` : `<div class="row"><button class="btn primary" type="button" data-start="${m.id}">Start with the team</button><button class="btn" type="button" data-skip="${m.id}">Not now</button></div>`}</div>`;
    if (m.prompt) h += `<div class="plan"><p class="label">Prompt for Claude</p><pre class="prompt">${esc(m.prompt)}</pre><button class="btn" type="button" data-copy="${m.id}">Copy prompt</button></div>`;
    return h;
  };
  // Every chat is kept in localStorage, so closing the drawer (or the tab) never loses the thread
  // and a reply that lands while you are away is still there when you come back.
  const chatKey = (to) => (to === 'ceo' ? 'vagent-ceo' : 'vagent-chat-' + to);
  function chatUI(to, hint) { return `<div class="chat" id="chat">${store.get(chatKey(to)).map(bubble).join('')}</div>
    <form id="f-chat" class="row" style="flex-wrap:nowrap"><label class="sr" for="cm">Message</label><input class="input" id="cm" name="m" placeholder="${esc(hint)}" required autocomplete="off" style="flex:1"><button class="btn primary" type="submit" style="flex:none">Send</button></form>`; }
  function bindChat(to, who) {
    const f = $('#f-chat'), log = () => store.get(chatKey(to));
    const save = (l) => store.set(chatKey(to), l);
    const paint = () => { const c = $('#chat'); if (!c) return; c.innerHTML = log().map(bubble).join(''); c.lastElementChild && c.lastElementChild.scrollIntoView({ block: 'nearest' }); };
    const settle = (id, entry) => { const l = log(), i = l.findIndex((x) => x.id === id); if (i >= 0) l[i] = entry; else l.push(entry); save(l); paint(); };
    const send = async (m) => {
      const id = Date.now();
      const l = log(); const history = l.slice(-8).map((x) => ({ me: !!x.me, t: x.t }));
      // the pending bubble is saved too, so it is still there if the drawer is closed and reopened
      l.push({ me: 1, t: m }); l.push({ id, pending: 1, at: id, t: who + ' is working on it…' }); save(l); paint();
      const btn = f.querySelector('button'); if (btn) btn.disabled = true;
      try { const r = await api('talk', { body: { to, message: m, history } });
        settle(id, { id, t: r.reply, buttons: r.buttons, actions: r.actions, prompt: r.prompt, project: r.project, bad: r.ok === false }); }
      catch (x) { settle(id, { id, t: x.message, bad: 1 }); }
      if (btn) btn.disabled = false;
      if (to.startsWith('agent:')) load();
    };
    f.onsubmit = (e) => { e.preventDefault(); const m = f.m.value.trim(); if (m) { f.m.value = ''; send(m); } };
    inner.onclick = async (e) => {
      const say = e.target.closest('[data-say]'); // works for chips painted after load too
      if (say) { e.preventDefault(); return send(say.dataset.say); }
      const fl = e.target.closest('[data-flow]');
      if (fl) { e.preventDefault(); pendingSay = 'start'; return openAgent(fl.dataset.flow); } // this one has no webhook: start the department's chat agent
      if (e.target.closest('[data-reset]')) { save([]); paint(); toast('Started over'); return; } // no webhook: a fresh thread
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
    if (pendingSay) { const m = pendingSay; pendingSay = null; send(m); }
  }
  // Reports agents post to /hook/daily (Sniper Daily's 9:00 list used to go to Telegram).
  async function openDaily() {
    open('<h2 class="d-title">📋 Daily reports</h2><p class="help">What your agents sent in, newest first.</p><div class="items" id="daily-list"><p class="empty">Loading…</p></div>', 'daily');
    try { const rows = await api('daily');
      $('#daily-list').innerHTML = rows.map((r) => `<details class="item" style="display:block"${r === rows[0] ? ' open' : ''}><summary style="cursor:pointer"><b style="font-weight:500">${esc(r.title)}</b> <small class="muted">· ${esc(r.source || '')} · ${ago(r.at)}</small></summary><div class="result" style="margin-top:8px;white-space:pre-wrap">${esc(r.text)}</div></details>`).join('') || '<p class="empty">Nothing yet. The first one lands tomorrow at 9:00.</p>'; }
    catch (x) { $('#daily-list').innerHTML = `<p class="empty">${esc(x.message)}</p>`; }
  }
  async function openBoard() {
    open(`<h2 class="d-title">Task board</h2><p class="help">Every project the leads ran, newest first.</p><button class="btn primary" type="button" id="board-new" style="align-self:flex-start">+ Give a task</button><div class="items" id="board-list"><p class="empty">Loading…</p></div>`, 'board');
    $('#board-new').onclick = openTask;
    try { const h = await api('tasks'); $('#board-list').innerHTML = h.map((t) => `<details class="item" style="display:block"><summary style="cursor:pointer"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(t.color || '#888')}"></span> <b style="font-weight:500">${esc(t.text.slice(0, 80))}</b> <small class="muted">· ${esc(t.dept || 'Deleted department')} · ${esc(t.status)} · ${ago(t.created_at)}</small></summary><div class="result" style="margin-top:8px">${esc(t.final || 'Still working…')}</div></details>`).join('') || '<p class="empty">No tasks yet. Give the first one.</p>'; }
    catch (x) { $('#board-list').innerHTML = `<p class="empty">${esc(x.message)}</p>`; }
  }
  async function openClients() {
    const deptChecks = (sel = []) => D.departments.length
      ? D.departments.map((d) => `<label class="check-row"><input type="checkbox" name="cl-depts" value="${d.id}"${sel.includes(d.id) ? ' checked' : ''}/> ${esc(d.name)}</label>`).join('')
      : '<p class="help">No departments yet.</p>';
    open(`<h2 class="d-title">👤 Client Accounts</h2>
      <details class="more" id="cl-new-wrap"><summary>+ New client account</summary>
        <form id="f-client" class="fields" autocomplete="off" style="margin-top:10px">
          <div class="field"><label>Email</label><input class="input" id="cl-email" type="email" placeholder="client@example.com" required/></div>
          <div class="field"><label>Password</label><div class="row" style="gap:6px"><input class="input" id="cl-pass" type="password" placeholder="Set a password" required style="flex:1"/><button class="btn" type="button" id="cl-show" style="flex:none">Show</button></div></div>
          <div class="field"><label>Department access</label><div class="checks" id="cl-checks">${deptChecks()}</div></div>
          <button class="btn primary" type="submit">Create account</button>
        </form>
      </details>
      <div class="items" id="cl-list"><p class="empty">Loading…</p></div>`, 'clients');

    const refresh = async () => {
      try {
        const list = await api('clients');
        $('#cl-list').innerHTML = list.length ? list.map((c) => {
          const deptsArr = Array.isArray(c.access_depts) ? c.access_depts : fromTxt(String(c.access_depts || ''));
          const names = c.dept_names ? (Array.isArray(c.dept_names) ? c.dept_names.join(', ') : String(c.dept_names)) : 'No access';
          return `<details class="item" style="display:block">
            <summary style="cursor:pointer;display:flex;align-items:center;gap:8px">
              <span class="grow"><b>${esc(c.email)}</b><small class="muted"> · ${esc(names)}</small></span>
              <button class="btn danger" type="button" data-del-client="${esc(c.email)}" style="flex:none">Remove</button>
            </summary>
            <div style="margin-top:10px">
              <p class="label">Edit access</p>
              <div class="checks">${deptChecks(deptsArr)}</div>
              <button class="btn primary" type="button" data-save-client="${esc(c.email)}" style="margin-top:8px">Save access</button>
            </div>
          </details>`;}).join('') : '<p class="empty">No client accounts yet.</p>';
      } catch (x) { $('#cl-list').innerHTML = `<p class="empty">${esc(x.message)}</p>`; }
    };
    refresh();
    $('#cl-show').onclick = () => { const i = $('#cl-pass'); i.type = i.type === 'password' ? 'text' : 'password'; $('#cl-show').textContent = i.type === 'password' ? 'Show' : 'Hide'; };
    $('#f-client').onsubmit = async (e) => {
      e.preventDefault();
      const depts = [...inner.querySelectorAll('#cl-checks input[name="cl-depts"]:checked')].map((cb) => Number(cb.value));
      try { await api('clients', { body: { email: $('#cl-email').value, password: $('#cl-pass').value, access_depts: depts } }); toast('Account created'); $('#cl-email').value = ''; $('#cl-pass').value = ''; inner.querySelectorAll('#cl-checks input').forEach((cb) => (cb.checked = false)); refresh(); } catch (x) { toast(x.message); }
    };
    inner.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del-client]');
      if (del) { if (!confirm('Remove ' + del.dataset.delClient + '?')) return; try { await api('clients', { method: 'DELETE', query: 'email=' + encodeURIComponent(del.dataset.delClient) }); toast('Removed'); refresh(); } catch (x) { toast(x.message); } return; }
      const save = e.target.closest('[data-save-client]');
      if (save) {
        const wrap = save.closest('details');
        const depts = [...wrap.querySelectorAll('input[name="cl-depts"]:checked')].map((cb) => Number(cb.value));
        try { await api('clients', { body: { email: save.dataset.saveClient, password: '__keep__', access_depts: depts } }); toast('Access updated'); refresh(); } catch (x) { toast(x.message); }
      }
    });
  }

  function openCEO() {
    open(`<div class="d-head"><span class="avatar" style="background:#2B2416"><svg aria-hidden="true" width="44" height="44" viewBox="-19 -86 38 38"><use href="#ceo"/></svg></span><div><h2 class="d-title">The CEO</h2><div class="d-sub">Sees the whole company live. Ask anything, or ask for a change.</div></div></div>
      <div class="row">${['How is the company doing today?', 'Organize everyone into the right departments and teams', 'Which agents failed recently and why?', 'Give a task to ', 'Create a new department for ', 'Write a Claude prompt to add a feature: '].map((s) => `<button class="pick" type="button" ${s.endsWith(' ') ? `data-fill="${esc(s)}"` : `data-say="${esc(s)}"`}>${esc(s.trim())}</button>`).join('')}</div>
      ${chatUI('ceo', 'Ask the CEO anything…')}
      <p class="help">Changes only happen after you press Approve. For new website features he writes a prompt you paste into Claude.</p>
      <div class="row"><button class="btn" type="button" id="ceo-board">Task board</button><button class="btn" type="button" id="ceo-clients">👤 Clients</button><button class="btn" type="button" id="clear-ceo">Clear chat</button></div>`, 'ceo');
    bindChat('ceo', 'The CEO');
    inner.querySelectorAll('[data-fill]').forEach((b) => (b.onclick = () => { const i = $('#cm'); i.value = b.dataset.fill; i.focus(); }));
    $('#ceo-board').onclick = openBoard;
    $('#ceo-clients').onclick = openClients;
    $('#clear-ceo').onclick = () => { store.set('vagent-ceo', []); openCEO(); };
  }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-agent],[data-dept],[data-dept-task],[data-open],[data-del-n8n],[data-reconnect],.agent,.lead,.add-room,.ceo-g,.task-board');
    if (!t) return;
    if (t.classList.contains('task-board')) return openBoard();
    // clients: block CEO + agents; only allow lead of accessible depts
    if (D.role === 'client') {
      if (t.classList.contains('ceo-g') || t.classList.contains('agent')) return;
      if (t.classList.contains('lead')) {
        const deptId = Number(t.dataset.dept);
        if (!(D.access_depts || []).includes(deptId)) return;
        return openDept(deptId);
      }
      return;
    }
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
  document.addEventListener('click', (e) => { const b = e.target.closest('.dept-btn'); if (!b) return; if (b.id === 'dept-add') return newDept(); if (floor === null) return selectFloor(Math.floor(+b.dataset.roomI / PER)); zoomRoom(+b.dataset.roomI); }, true);
  svg.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.agent,.lead,.add-room,.ceo-g,.task-board,.fl')) { e.preventDefault(); e.target.closest('.agent,.lead,.add-room,.ceo-g,.task-board,.fl').dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) close(); });
  $('#drawer-close').onclick = close; scrim.onclick = close;
  $('#btn-daily').onclick = openDaily;
  $('#btn-settings').onclick = openSettings; $('#btn-task').onclick = openCEO; $('#btn-clients').onclick = openClients;
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

  // Poll every 8s, but deduplicate: if a request is already in-flight, skip.
  // Also back off to 30s when the tab is hidden, so background tabs don't hammer the DB.
  let loading = false;
  const scheduledLoad = async () => {
    if (loading) return;
    loading = true;
    try { await load(); } finally { loading = false; }
  };
  scheduledLoad();
  setInterval(() => { if (!document.hidden) scheduledLoad(); }, 8000);
  setInterval(() => { if (document.hidden) scheduledLoad(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduledLoad(); });
})();
