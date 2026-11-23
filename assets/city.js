// V Agent City — the OUTER layer only: city overview -> building exterior (pick a floor) -> the original isometric office (scene.js / office.js).  window.VCity
// No interiors are drawn here. Entering a floor hands over to office.js, which renders the ORIGINAL scene for that floor's department + agents.
// Marketing HQ = 5 floors, Web Builder / Sniper Client / Client Voice AI = 1 floor each, plus the CEO castle (assets/castle.js).
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, r) => (r || document).querySelector(s);
  const K = 0.866;
  // ONE scale for the whole world: the ORIGINAL floor (1520 x 2200 floor units) is mounted at scale M inside every building, so footprints, people, cars and streets share it.
  const M = 0.5, K0 = 0.8 * M / 0.866, FW = Math.round(1520 * K0), FD = Math.round(2200 * K0), FH = 130, DY = FD - 460;   // DY: how far the south half of the city moved to make room for the deeper buildings
  const BLD = {
    mk: { id: 'mk', name: 'Marketing Headquarters', short: 'Marketing', match: /^(marketing|content|paid|publishing|seo)/i, floors: 5, fp: [300, 160, FW, FD], h: 5 * FH, door: 300 + FW / 2, col: '#B5532F', wall: ['#E9E5DA', '#D9D4C6', '#CBC5B5'] },
    web: { id: 'web', name: 'Web Builder', short: 'Web Builder', match: /web|site/i, floors: 1, fp: [1500, 160, FW, FD], h: FH, door: 1500 + FW / 2, col: '#2F6F9F', wall: ['#E4E8EC', '#D0D7DE', '#BFC8D1'] },
    sn: { id: 'sn', name: 'Sniper Client', short: 'Sniper Client', match: /sniper/i, floors: 1, fp: [2700, 160, FW, FD], h: FH, door: 2700 + FW / 2, col: '#3F7D58', wall: ['#E6E9E3', '#D2D8CF', '#C0C8BC'] },
    // Client Voice AI: its own building (it used to be floor 6 of Marketing HQ)
    cv: { id: 'cv', name: 'Client Voice AI', short: 'Voice AI', match: /^client voice/i, floors: 1, fp: [3900, 160, FW, FD], h: FH, door: 3900 + FW / 2, col: '#8A5BC8', wall: ['#E6E4EC', '#D3D0DE', '#C2BECF'] },
    // The CEO's castle in the middle of the city (assets/castle.js). Not a department building: no agents live here, only the CEO.
    ceo: { id: 'ceo', name: 'The CEO Castle', short: 'CEO Castle', match: /(?!)/, floors: 1, fp: [2230, 1880, 640, 340], lot: [2060, 1770, 1000, 700], h: 340, door: 2550, col: '#C9A227', castle: true },
  };
  const ORDER = ['mk', 'web', 'sn', 'cv'], ALL = ORDER.concat(['ceo']);   // ORDER = department buildings (agents live there); ALL also has the castle
  // Marketing HQ: floor n = the n-th of these departments (matched by name; a missing one leaves its floor empty). Change here if the marketing teams are renamed.
  const MK_FLOORS = [/^marketing/i, /^content/i, /^paid/i, /^publishing/i, /^seo/i];
  const CITY_W = 4800, CITY_D = 2000 + DY;
  Object.assign(BLD.mk, { st: 'orange', edge: '#EF8E3C' }); Object.assign(BLD.web, { st: 'cyan', edge: '#B53BAA' }); Object.assign(BLD.sn, { st: 'blue', edge: '#3A5DBE' }); Object.assign(BLD.cv, { st: 'teal', edge: '#8A5BC8' });
  VCityKit.init({ W: CITY_W, D: CITY_D, DY, FH, BLD });
  const P = (gx, gy, z) => [(gx - gy) * K, (gx + gy) * 0.5 - (z || 0)];
  const pp = (gx, gy, z) => P(gx, gy, z).map((n) => n.toFixed(1)).join(',');
  // ---------- street navigation (same VNav A* as the floors) ----------
  // buildings, both roads (open only at the crosswalks), every tree/lamp/bench/bush/signal and the fountain block; sidewalks, crosswalks, the plaza and the park are walkable
  const cityNav = (() => {
    const r = [], add = (a, b, c, d) => r.push([a, b, c, d]), w = VCityKit.world(), cws = VCityKit.crossings().slice().sort((a, b) => a - b);
    for (const b of ORDER) { const [x, y, fw, d] = BLD[b].fp; add(x, y, x + fw, y + d); }
    { const [lx, ly, lw, ld] = BLD.ceo.lot; add(lx, ly, lx + lw, ly + ld); }   // the castle's walled garden
    let x0 = 0; for (const c of cws) { add(x0, w.MR0 + 4, c - 46, w.MR1 - 4); x0 = c + 46; } add(x0, w.MR0 + 4, CITY_W, w.MR1 - 4);
    add(w.SX0 + 4, 0, w.SX1 - 4, w.MR0 - 116); add(w.SX0 + 4, w.MR0 - 36, w.SX1 - 4, w.MR0);   // the side street (open only at its crossing)
    add(1690, 1560 + DY, 1910, 1640 + DY);   // fountain
    for (const i of VCityKit.scenery()) add(i.bb[0], i.bb[1], i.bb[2], i.bb[3]);
    return { W: CITY_W, D: CITY_D, rects: r, doors: [] };
  })();
  const doorPt = (b) => [BLD[b].door, BLD[b].fp[1] + BLD[b].fp[3] + 30];   // sidewalk in front of the entrance

  // the department that matches a building (by name) -> its agents in a stable order (sorted by key). Nothing is invented.
  function assign(D, H) {
    const out = { mk: [], web: [], sn: [], cv: [], ceo: [], none: [] }, deps = {}; for (const b of ORDER) deps[b] = new Set(D.departments.filter((d) => BLD[b].match.test(d.name || '')).map((d) => d.id));
    for (const a of D.agents) { if (H.isHelper(a)) continue; const b = ORDER.find((x) => deps[x].has(a.dept)); (b ? out[b] : out.none).push(a); }
    for (const b of ORDER) out[b].sort((p, q) => (p.key < q.key ? -1 : 1));
    out.mkFloors = MK_FLOORS.map((re) => { const d = D.departments.find((x) => re.test(x.name || '')) || null; return { dept: d, agents: d ? out.mk.filter((a) => a.dept === d.id) : [] }; });
    return out;
  }
  const st = { H: null, D: { agents: [], departments: [] }, view: 'city', b: null, n: 1, svg: null, root: null, bar: null, vb: { x: 0, y: 0, w: 1000, h: 700 }, busy: false };

  // ---------- drawing: shared bits ----------
  const quad = (a, b, c, d, fill, extra) => `<polygon points="${[a, b, c, d].map((p) => pp(p[0], p[1], p[2])).join(' ')}" fill="${fill}" ${extra || ''}/>`;
  const plane = (gx, gy) => { const o = P(gx, gy, 0); return `translate(${o[0].toFixed(1)} ${o[1].toFixed(1)})`; };
  const defs = () => VCityKit.defs();
  // ---------- drawing: the city (procedural low-poly isometric art, assets/citykit.js) ----------
  function drawCity() {
    let s = VCityKit.ground();
    st.decor = st.decor || VCityKit.decor();
    for (const id of ALL) { const b = BLD[id], [x, y, w, d] = b.fp; if (!b.castle) s += VCityKit.shadowOf(x, y, w, d, b.h, id); }   // the castle draws its own shadow inside its garden (the lawn would cover one drawn here)   // cast shadows: long, hard, to the south-west
    for (const dd of st.decor) s += dd.shadow;
    st.cityStatic = s; return s;
  }
  // parked vehicles in the outer lanes + the kit's scenery (trees, lamps, benches, bushes, traffic lights)
  function sceneryItems() {
    const w = VCityKit.world(), it = VCityKit.scenery().map((i) => ({ bb: i.bb, h: i.h })), K8 = (x, y, a, kind, col) => { const o = P(x, y); return { bb: [x - 40, y - 18, x + 40, y + 18], h: `<g transform="translate(${o[0].toFixed(1)} ${o[1].toFixed(1)})">${VCityKit.vehicleAt(kind, col, a * Math.PI / 180)}</g>` }; };
    for (const [x, kind, col] of [[380, 'compact', '#2F7F7A'], [470, 'taxi', '#E9B93A'], [1430, 'van', '#EDEDE8'], [1560, 'suv', '#A8342F'], [2350, 'sedan', '#B8BEC6'], [3250, 'pickup', '#3F6B4F']]) it.push(K8(x, w.RYC - 97, 180, kind, col));
    for (const [x, kind, col] of [[220, 'sedan', '#2E4A7A'], [780, 'van', '#EDEDE8'], [1700, 'taxi', '#E9B93A'], [2600, 'suv', '#4A4F57'], [3300, 'compact', '#C9B896']]) it.push(K8(x, w.RYC + 97, 0, kind, col));
    return it;
  }
  // A building = stacked floor groups (.vc-fl, bottom to top) + roof group (.vc-top) + one slab per floor level (.vc-slab, shown under the open floor) + a host (.vc-host) where the ORIGINAL office scene is mounted.
  // Cutaway = the floors above the open one fade out, the open one is replaced by the real office, the floors below stay as structure.
  function buildingSvg(id) {
    if (BLD[id].castle) return VCastle.building(BLD[id], { pill: (lp) => `<g class="vc-pill" data-b="${id}" transform="translate(${lp[0].toFixed(1)} ${lp[1].toFixed(1)}) scale(1.7)"><rect x="-210" y="-34" width="420" height="68" rx="34" fill="#141413" opacity=".92"/><circle cx="-172" cy="0" r="12" fill="${BLD[id].col}"/><text class="t1" x="-148" y="-4" font-size="26" font-weight="700" fill="#FAF9F5" font-family="Inter,sans-serif">${BLD[id].short}</text><text class="t2" x="-148" y="24" font-size="19" fill="#C9C6BC" font-family="Inter,sans-serif">The CEO, at home</text></g>` });
    const b = BLD[id], [x, y, w, d] = b.fp, h = b.h, fl = b.floors, fh = FH, S = [];
    const south = `<g transform="${plane(x, y + d)} matrix(${K} .5 0 1 0 0)">`, dx = b.door - x;
    S.push(`<g class="vc-b" data-b="${id}" tabindex="0" role="button" aria-label="${b.name}" style="cursor:pointer">`);
    for (let f = 0; f < fl; f++) {
      const z0 = f * fh, z1 = z0 + fh;
      S.push(`<g class="vc-fl" data-b="${id}" data-f="${f + 1}">`, VCityKit.faces(x, y, w, d, z0, z1, b.st, { b: id, f: f + 1 }, f === 0));
      if (f === 0) S.push(south, `<rect x="${dx - 50}" y="-70" width="100" height="70" fill="#1D2433"/><rect x="${dx - 45}" y="-65" width="43" height="65" fill="#9BD3F0"/><rect x="${dx + 2}" y="-65" width="43" height="65" fill="#7FBBE0"/><rect x="${dx - 60}" y="-90" width="120" height="16" fill="#1D2433"/><text x="${dx}" y="-78" text-anchor="middle" font-size="10" font-weight="700" fill="#FAF9F5" font-family="Inter,sans-serif" letter-spacing="1.2">${b.short.toUpperCase()}</text><rect x="${dx - 70}" y="-4" width="140" height="4" fill="#CFC6AC"/>`, '</g>');
      S.push('</g>');
    }
    for (let f = 1; f <= fl; f++) { const z = (f - 1) * fh;   // slab under floor f: the concrete the open office sits on (+ its visible edge)
      S.push(`<g class="vc-slab" data-f="${f}">${quad([x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z], '#C9C2AE')}${quad([x, y + d, z - 6], [x + w, y + d, z - 6], [x + w, y + d, z + 3], [x, y + d, z + 3], '#B0A88F')}${quad([x + w, y, z - 6], [x + w, y + d, z - 6], [x + w, y + d, z + 3], [x + w, y, z + 3], '#8F8870')}</g>`); }
    S.push(`<g class="vc-host" data-b="${id}"></g>`);
    S.push(`<g class="vc-top" data-b="${id}">`, VCityKit.roof(x, y, w, d, h, b.edge, id === 'mk' ? 1 : id === 'web' ? 2 : id === 'sn' ? 3 : 4), VCityKit.crown(x, y, w, d, h, b.edge));
    S.push(south, `<rect x="${w / 2 - 175}" y="${-(h - 14) + 6}" width="350" height="38" rx="6" fill="#171B26"/><text x="${w / 2}" y="${-(h - 14) + 33}" text-anchor="middle" font-family="Newsreader,Georgia,serif" font-size="28" font-weight="600" fill="#FAF9F5">${b.short.toUpperCase()}</text>`, '</g>');
    S.push('</g>');
    S.push(bandsSvg(id));
    const lp = P(x + w / 2, y + d / 2, h + 130); S.push(`<g class="vc-pill" data-b="${id}" transform="translate(${lp[0].toFixed(1)} ${lp[1].toFixed(1)}) scale(1.7)"><rect x="-210" y="-34" width="420" height="68" rx="34" fill="#141413" opacity=".92"/><circle cx="-172" cy="0" r="12" fill="${b.col}"/><text class="t1" x="-148" y="-4" font-size="26" font-weight="700" fill="#FAF9F5" font-family="Inter,sans-serif">${b.short}</text><text class="t2" x="-148" y="24" font-size="19" fill="#C9C6BC" font-family="Inter,sans-serif"></text></g>`);
    S.push('</g>');
    return { bb: [x, y, x + w, y + d], h: S.join(''), z: h + 260 };
  }
  // sorted scenery + decorative blocks + the three department buildings (painter's order by footprint); the cars drive between the "behind the road" and "in front of the road" items
  function drawCityAll() {
    const base = st.cityStatic || drawCity(), items = VCityKit.depthSort(sceneryItems().concat(st.decor.map((q) => ({ bb: q.bb, h: q.h, z: q.z }))).concat(ALL.map(buildingSvg))), RY = VCityKit.world().RYC;
    const wrap = (i) => { const z = i.z === undefined ? 150 : i.z, sb = [P(i.bb[0], i.bb[3])[0], P(i.bb[0], i.bb[1], z)[1], P(i.bb[2], i.bb[1])[0], P(i.bb[2], i.bb[3])[1] + 30].map((n) => n.toFixed(0)).join(','); return `<g class="vc-it" data-sb="${sb}">${i.h}</g>`; };
    const back = items.filter((i) => i.bb[3] < RY).map(wrap).join(''), front = items.filter((i) => i.bb[3] >= RY).map(wrap).join('');
    return defs() + `<g id="vc-world">${base}<g id="vc-sorted">${back}<g id="vc-cars" pointer-events="none"></g>${front}</g><g id="vc-cityag"></g><g id="vc-tilepark" display="none"></g></g>`;
  }
  // clickable floor bands on a building's south face (only active in the building view, see city.css)
  function bandsSvg(id) {
    const b = BLD[id], [x, y, w, d] = b.fp; let s = `<g class="vc-bands" transform="${plane(x, y + d)} matrix(${K} .5 0 1 0 0)">`;
    for (let f = 1; f <= b.floors; f++) s += `<g class="vc-band" data-b="${id}" data-f="${f}" role="button" aria-label="${b.short} floor ${f}"><rect x="0" y="${-f * FH}" width="${w}" height="${FH}"/><circle cx="34" cy="${-f * FH + FH / 2}" r="22" fill="${b.col}"/><text x="34" y="${-f * FH + FH / 2 + 8}" text-anchor="middle" font-size="24" font-weight="700" fill="#fff" font-family="Inter,sans-serif">${f}</text></g>`;
    return s + '</g>';
  }
  function drawAll() { return drawCityAll(); }

  // ---------- camera: ONE world camera (the svg viewBox). City -> building -> floor are only different framings of it ----------
  let lodQ = false;
  // zoomed in (building / floor view) the items outside the camera are not drawn at all; the city overview draws everything
  let cullQ = false;
  function cull() { cullQ = false; if (!st.svg) return; const items = st.items || (st.items = [...st.svg.querySelectorAll('.vc-it')].map((e) => ({ e, b: e.dataset.sb.split(',').map(Number), on: true }))), v = st.vb, m = 260, all = st.view === 'city' && v.w > CITY_BOX.w * 0.5;
    for (const it of items) { const vis = all || (it.b[2] > v.x - m && it.b[0] < v.x + v.w + m && it.b[3] > v.y - m && it.b[1] < v.y + v.h + m); if (vis !== it.on) { it.on = vis; it.e.style.display = vis ? '' : 'none'; } } }
  function setVB() { const v = st.vb; st.svg.setAttribute('viewBox', `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`); if (!cullQ) { cullQ = true; requestAnimationFrame(cull); }
    if (st.view === 'floor' && st.lodFn && !lodQ) { lodQ = true; requestAnimationFrame(() => { lodQ = false; if (st.view === 'floor' && st.lodFn) st.lodFn(); }); } }
  function fitTo(box, animate) {
    const r = st.svg.getBoundingClientRect(), asp = (r.width || 1000) / (r.height || 700); let w = box.w, h = box.h; if (w / h < asp) w = h * asp; else h = w / asp;
    const to = { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
    if (st.cam) st.cam.kill();
    if (animate && window.gsap && !matchMedia('(prefers-reduced-motion:reduce)').matches) st.cam = gsap.to(st.vb, { ...to, duration: 1.1, ease: 'power2.inOut', onUpdate: setVB }); else { Object.assign(st.vb, to); setVB(); }
  }
  function boxOf(id) { if (BLD[id].castle) return VCastle.boxOf(BLD[id]); const b = BLD[id], [x, y, w, d] = b.fp, l = P(x, y + d)[0], r = P(x + w, y)[0], t = P(x, y, b.h + 200)[1], bt = P(x + w, y + d)[1] + 150; return { x: l - 100, y: t, w: r - l + 200, h: bt - t }; }
  // the open floor: the original scene's rectangle in world coordinates (+ a little ground so the building stays readable)
  const tileBox = (id, n) => { if (BLD[id].castle) return VCastle.roomBox(BLD[id]); const t = tileRect(id, n); return t ? { x: t.x - 20, y: t.y - 20, w: t.w + 40, h: t.h + 40 } : boxOf(id); };
  const CITY_BOX = { x: -1100, y: -780, w: 6500, h: 3500 };
  function frame(animate) { fitTo(st.view === 'floor' ? tileBox(st.b, st.n) : st.view === 'bld' ? boxOf(st.b) : CITY_BOX, animate); }
  function zoom(k, cx, cy) { if (st.cam) st.cam.kill(); const v = st.vb, r = st.svg.getBoundingClientRect(); const fx = cx === undefined ? 0.5 : (cx - r.left) / r.width, fy = cy === undefined ? 0.5 : (cy - r.top) / r.height; const nw = Math.max(380, Math.min(CITY_BOX.w * 1.2, v.w / k)), nh = nw * v.h / v.w; v.x += (v.w - nw) * fx; v.y += (v.h - nh) * fy; v.w = nw; v.h = nh; setVB(); }
  function bindCamera() {
    const stage = st.root; let drag = null; const pts = new Map(); let pinch = 0;
    stage.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY); }, { passive: false });
    const mv = (e) => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoom(d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch = d; return; }
      if (!drag) return; const r = st.svg.getBoundingClientRect(), k = st.vb.w / r.width, dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) { if (!drag.moved && st.cam) st.cam.kill(); drag.moved = true; }
      if (drag.moved) { st.vb.x = drag.vx - dx * k; st.vb.y = drag.vy - dy * k; setVB(); } };
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; st.dragged = !!(drag && drag.moved); if (!pts.size) { drag = null; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); } };
    stage.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target.closest('.vc-ui,.vc-bar')) return; pts.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, vx: st.vb.x, vy: st.vb.y, moved: false }; st.dragged = false; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); });
    const reframe = window.VPerf ? VPerf.debounce(() => { if (!st.busy) frame(false); }) : () => { if (!st.busy) frame(false); }; st.seen = window.VPerf ? VPerf.watch(stage) : { visible: true };
    if (window.ResizeObserver) new ResizeObserver(reframe).observe(stage);
  }

  // ---------- the original office, mounted INSIDE the world ----------
  // The office's floor is 1520 x 2200 floor units with the same isometric angle as the city, so it maps onto a building's footprint by one uniform scale (M):
  // city = M * (office screen - (600,110)) + P(building corner, floor height). Nothing is redrawn; the office svg itself is nested in the building group and clipped to its tile.
  const park = () => $('#vc-tilepark', st.svg);
  function tileRect(id, n) { const v = st.vb0 || { x: -1200, y: -10, w: 3056, h: 1878.64 }, o = P(BLD[id].fp[0], BLD[id].fp[1], (n - 1) * FH); return { x: o[0] + M * (v.x - 600), y: o[1] + M * (v.y - 110), w: M * v.w, h: M * v.h }; }
  function tile(svgEl, vb0, lodFn) {
    if (!st.svg || !svgEl) return; st.vb0 = { x: vb0.x, y: vb0.y, w: vb0.w, h: vb0.h }; st.lodFn = lodFn; st.scene = svgEl;
    if (st.view !== 'floor') { if (svgEl.parentNode !== park()) park().appendChild(svgEl); return; }
    const host = $(`.vc-host[data-b="${st.b}"]`, st.svg), t = tileRect(st.b, st.n); if (!host) return;
    if (svgEl.parentNode !== host) host.appendChild(svgEl);
    svgEl.setAttribute('x', t.x.toFixed(1)); svgEl.setAttribute('y', t.y.toFixed(1)); svgEl.setAttribute('width', t.w.toFixed(1)); svgEl.setAttribute('height', t.h.toFixed(1)); svgEl.style.width = ''; svgEl.style.height = ''; svgEl.style.overflow = 'hidden';
    svgEl.style.position = 'static'; svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet'); if (st.lodFn) st.lodFn();
  }
  // which floors show: the open floor is replaced by its office, floors above it vanish, floors below stay as structure; everything else in the city is untouched
  function applyState() {
    if (!st.svg) return; const open = st.view === 'floor';
    st.svg.querySelectorAll('.vc-b').forEach((bg) => { const id = bg.dataset.b, me = open && id === st.b; bg.classList.toggle('open', me);
      bg.querySelectorAll('.vc-fl').forEach((f) => { const n = +f.dataset.f; f.classList.toggle('gone', me && n > st.n); f.classList.toggle('cut', me && n === st.n); });
      bg.querySelectorAll('.vc-slab').forEach((s) => s.classList.toggle('on', me && +s.dataset.f === st.n)); });
    st.svg.querySelectorAll('.vc-shd[data-b]').forEach((e) => e.classList.toggle('off', open && e.dataset.b === st.b));
    st.svg.dataset.view = st.view; if (st.scene && st.scene.isConnected) { if (!open && st.scene.parentNode !== park()) park().appendChild(st.scene); }
  }

  // ---------- navigation: city -> building -> floor, one continuous scene (no screen is replaced) ----------
  function setMode() { document.body.classList.add('city-mode'); st.bar.hidden = st.view !== 'floor'; st.root.dataset.view = st.view; applyState(); }
  function showCity(animate) { st.view = 'city'; st.b = null; setMode(); frame(animate !== false); renderUI(); st.H.changed(); }
  function showBuilding(id, animate) { const wasFloor = st.view === 'floor'; st.view = 'bld'; st.b = id; setMode(); frame(animate !== false); renderUI(); st.H.changed(); if (wasFloor) st.H.changed(); }
  function enterFloor(id, n) { if (st.busy) return; st.view = 'floor'; st.b = id; st.n = n; setMode(); st.H.entered(); frame(true); renderUI(); }
  // Marketing: the escalator between floors = the cutaway moves one floor up or down inside the same building, the camera follows
  function changeFloor(n) {
    if (st.view !== 'floor' || n < 1 || n > BLD[st.b].floors || n === st.n) return; st.n = n; setMode(); st.H.entered(); frame(true); renderUI();
    if (st.scene && window.gsap) gsap.fromTo(st.scene, { opacity: 0 }, { opacity: 1, duration: 0.6 });
  }

  // what the original office renders for the current floor: that floor's department(s) and agents
  function floorCtx(D) {
    if (st.view !== 'floor' || BLD[st.b].castle) return null; const by = assign(D, st.H), id = st.b, deps = D.departments.filter((d) => BLD[id].match.test(d.name || ''));
    const live = (a) => !(window.VMove && VMove.isManaged(a.key));
    if (id === 'mk') { const fl = by.mkFloors[st.n - 1]; return { departments: fl.dept ? [fl.dept] : [], agents: fl.agents.filter(live), esc: { up: st.n < 5, down: st.n < 5, hole: st.n > 1 }, tag: 'mk' + st.n }; }
    return { departments: deps, agents: by[id].concat(id === 'sn' ? D.agents.filter(st.H.isHelper) : []).filter(live), tag: '' };
  }
  function locate(key) {
    const a = st.D.agents.find((x) => x.key === key); if (!a) return null; if (st.H.isHelper(a)) return { b: 'sn', n: 1 };
    const by = assign(st.D, st.H); for (const id of ORDER) { const x = by[id].find((q) => q.key === key), i = x ? 0 : -1; if (i >= 0) return { b: id, n: id === 'mk' ? Math.max(1, by.mkFloors.findIndex((fl) => fl.dept && fl.dept.id === x.dept) + 1) : 1 }; } return null;
  }

  // ---------- agents on the street (drawn from VMove's world state) ----------
  const figs = new Map(), FIG = '--as:inline;--ad:none;--ar:none;--am:none;--ls:inline;--lsit:none;--hs:none;--sitk:0;--shd:inline';
  const TRAIL = [[-14, '#BFE0FF', 3], [-6, '#5AA8FF', 4], [2, '#2F7BFF', 4], [10, '#5AA8FF', 3], [18, '#BFE0FF', 2]];
  function mkFig(a) {
    const g = document.createElementNS(NS, 'g'), hl = st.H.isHelper(a); g.setAttribute('class', 'vc-fig'); g.dataset.key = a.key; g.setAttribute('style', FIG); g.style.cursor = 'pointer';
    g.innerHTML = `<ellipse cx="0" cy="0" rx="16" ry="6" fill="#000" opacity=".28"/>${hl ? `<g class="trail" opacity="0">${TRAIL.map(([y, c, w]) => `<line x1="0" y1="${y * M - 30}" x2="-90" y2="${y * M - 30}" stroke="${c}" stroke-width="${w * M * 1.4}" stroke-linecap="round"/>`).join('')}</g>` : ''}<g class="sc" transform="scale(${M})"><g class="body"><use href="${st.H.personRef(a)}" style="color:${st.H.colorOf(a.key)}"/></g></g><title>${esc(a.name)}</title>`;
    g.addEventListener('click', (e) => { e.stopPropagation(); if (st.H.openAgent) st.H.openAgent(a.key); }); return { g, px: null, py: null, ph: 0, hl };
  }
  function streetDraw(list) {
    if (!st.svg) return; const layer = $('#vc-cityag', st.svg); if (!layer) return; const seen = new Set(); { const now = performance.now(), pv = st.pv || (st.pv = {}); st.peds = list.filter((s) => s.a).map((s) => { const o = pv[s.key], dtp = o ? Math.max(0.016, (now - o[2]) / 1000) : 0, vx = o ? (s.x - o[0]) / dtp : 0, vy = o ? (s.y - o[1]) / dtp : 0; pv[s.key] = [s.x, s.y, now]; return [s.x, s.y, vx, vy]; }); }
    for (const s of list) {
      if (!s.a) continue; seen.add(s.key); let f = figs.get(s.key); if (!f || !f.g.isConnected) { f = mkFig(s.a); figs.set(s.key, f); layer.appendChild(f.g); }
      const p = P(s.x, s.y), dx = f.px === null ? 0 : p[0] - f.px, dy = f.py === null ? 0 : p[1] - f.py, mv = Math.hypot(dx, dy); f.px = p[0]; f.py = p[1];
      f.g.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) scale(${s.fx} 1)`);
      if (s.moving) { f.ph += Math.min(s.speed, 300) * 0.016 / 26 * Math.PI; const sn = Math.sin(f.ph); f.g.style.setProperty('--sl', (Math.max(0, sn) * -5).toFixed(1)); f.g.style.setProperty('--sr', (Math.max(0, -sn) * -5).toFixed(1)); const b = f.g.querySelector('.body'); if (b) b.style.transform = `translateY(${(-Math.abs(sn) * 2.4).toFixed(1)}px)`; }
      else { f.g.style.removeProperty('--sl'); f.g.style.removeProperty('--sr'); const b = f.g.querySelector('.body'); if (b) b.style.transform = ''; }
      if (f.hl) { const tr = f.g.querySelector('.trail'); const k = Math.min(1, s.moving ? s.speed / 600 : 0); tr.setAttribute('opacity', (k * 0.9).toFixed(2)); if (mv > 0.01) { const ang = Math.atan2(dy, dx) * 180 / Math.PI; tr.setAttribute('transform', `scale(${s.fx} 1) rotate(${(s.fx < 0 ? 180 - ang : ang).toFixed(1)}) translate(0 0)`); } }
    }
    for (const [k, f] of figs) if (!seen.has(k)) { f.g.remove(); figs.delete(k); }
  }

  // ---------- watch an agent: the view follows it from floor to street to floor ----------
  const watch = (key) => { st.watch = key || null; st.watchAt = 0; };
  function watchTick(t) {
    if (!st.watch || !window.VMove || st.busy) return; const l = VMove.where(st.watch); if (!l || t - (st.watchAt || 0) < 700) return;
    if (l.lv === 'floor' && !(st.view === 'floor' && st.b === l.b && st.n === l.f)) { st.watchAt = t; enterFloor(l.b, l.f); }
    else if (l.lv === 'street') { if (st.view !== 'city') { st.watchAt = t; showCity(true); } else { const p = P(l.x, l.y), w = CITY_BOX.w * 0.34, h = w * st.vb.h / st.vb.w; const to = { x: p[0] - w / 2, y: p[1] - 100 - h / 2, w, h }; const k = 0.12; for (const q of ['x', 'y', 'w', 'h']) st.vb[q] += (to[q] - st.vb[q]) * k; setVB(); } }
  }

  // ---------- data ----------
  // a real department change (the owner moved the agent) = a real trip: out of the old building, across the street if needed, into the new floor
  const prevHome = {};
  function trips(D) {
    if (!window.VMove) return;
    for (const a of D.agents) {
      if (st.H.isHelper(a)) continue; const h = locate(a.key), old = prevHome[a.key]; prevHome[a.key] = h;
      if (old && h && (old.b !== h.b || old.n !== h.n) && !VMove.isManaged(a.key)) { VMove.adopt(a.key, { b: old.b, n: old.n }); VMove.goHome(a.key).catch(() => VMove.release(a.key)); }
    }
  }
  function update(D) { st.D = D; trips(D); paintLights(); renderUI(); }
  function paintLights() {
    if (!st.svg) return; const byB = assign(st.D, st.H);
    for (const b of ORDER) { const list = byB[b], w = list.filter((a) => a.status === 'working').length;
      const pill = st.svg.querySelector(`.vc-pill[data-b="${b}"]`); if (pill) pill.querySelector('.t2').textContent = list.length + ' agent' + (list.length === 1 ? '' : 's') + ' · ' + w + ' working';
      st.svg.querySelectorAll(`.vc-win[data-b="${b}"]`).forEach((r) => { const f = +r.dataset.f; const on = b === 'mk' ? byB.mkFloors[f - 1].agents.some((a) => a.status === 'working') : w > 0; r.setAttribute('fill-opacity', on ? '.4' : '0'); }); }
  }

  // ---------- UI ----------
  const esc = (t) => String(t).replace(/[<&>"]/g, '');
  function renderUI() {
    if (!st.ui) return; const u = st.ui, byB = assign(st.D, st.H);
    $('.vc-tabs', u).innerHTML = `<button type="button" data-go="city" class="${st.view === 'city' ? 'on' : ''}">City overview</button>` + ALL.map((b) => `<button type="button" data-go="${b}" class="${st.b === b ? 'on' : ''}" style="--c:${BLD[b].col}"><i></i>${BLD[b].short} <small>${BLD[b].castle ? '🏰' : byB[b].length}</small></button>`).join('');
    const fl = $('.vc-floors', u);
    if (st.view === 'bld') { const id = st.b, B = BLD[id], list = byB[id]; fl.hidden = false;
      fl.innerHTML = `<span class="vc-h">${esc(B.name)} · pick a floor</span>` + Array.from({ length: B.floors }, (_, i) => B.floors - i).map((f) => { const fl = id === 'mk' ? byB.mkFloors[f - 1] : null, cnt = id === 'mk' ? fl.agents.length : list.length, wk = (id === 'mk' ? fl.agents : list).filter((a) => a.status === 'working').length;
        return `<button type="button" data-floor="${f}"><b>${f}</b><span>${id === 'mk' ? (fl.dept ? esc(fl.dept.name) : '<em>no department</em>') : B.castle ? 'Great hall' : 'Floor 1'}<small>${B.castle ? 'The CEO is home' : cnt + ' agent' + (cnt === 1 ? '' : 's') + (wk ? ' · ' + wk + ' working' : '')}</small></span></button>`; }).join(''); }
    else fl.hidden = true;
    if (st.view === 'floor') { const B = BLD[st.b], many = B.floors > 1, fx = st.b === 'mk' ? assign(st.D, st.H).mkFloors[st.n - 1] : null, nm = fx && fx.dept ? fx.dept.name : '';
      st.bar.innerHTML = `<button type="button" data-go="city">🏙 City</button><button type="button" data-go="${st.b}">🏢 ${esc(B.short)}</button><span class="vc-here">${many ? 'Floor ' + st.n + (nm ? ' · ' + esc(nm) : '') : esc(B.name)}</span>${many ? `<span class="vc-esc"><button type="button" data-fl="${st.n + 1}" ${st.n >= B.floors ? 'disabled' : ''} aria-label="Open the floor above" title="Open the floor above (cutaway moves; agents are not carried)">▲ Up</button><button type="button" data-fl="${st.n - 1}" ${st.n <= 1 ? 'disabled' : ''} aria-label="Open the floor below" title="Open the floor below (cutaway moves; agents are not carried)">▼ Down</button></span>` : ''}`; }
  }
  function mountUI() {
    const u = document.createElement('div'); u.className = 'vc-ui';
    u.innerHTML = '<div class="vc-tabs" role="tablist" aria-label="Buildings"></div><div class="vc-floors" role="group" aria-label="Floors" hidden></div><a class="vc-switch" data-old="1" href="?old=1">Original Office</a><div class="vc-zoom" role="group" aria-label="Camera"><button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="home" aria-label="Reset camera" title="Reset camera">⌂</button></div>';
    st.root.appendChild(u); st.ui = u;
    { const l = $('.vc-switch', u), x = new URL(location.href); x.searchParams.delete('city'); x.searchParams.set('old', '1'); l.setAttribute('href', x.pathname + x.search + x.hash); }   // other query parameters are kept
    const bar = document.createElement('div'); bar.className = 'vc-bar'; bar.hidden = true; st.stage.appendChild(bar); st.bar = bar;
    const go = (t) => { if (t.dataset.go === 'city') showCity(true); else showBuilding(t.dataset.go, true); };
    u.addEventListener('click', (e) => { const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.go) go(t); else if (t.dataset.floor) enterFloor(st.b, +t.dataset.floor);
      else if (t.dataset.z) { if (t.dataset.z === 'home') frame(true); else zoom(t.dataset.z === 'in' ? 1.35 : 1 / 1.35); } });
    bar.addEventListener('click', (e) => { const t = e.target.closest('button'); if (!t || t.disabled) return; if (t.dataset.go) go(t); else if (t.dataset.fl) changeFloor(+t.dataset.fl); });
    st.svg.addEventListener('click', (e) => {
      if (st.dragged) { st.dragged = false; return; }
      if (e.target.closest('.vc-ceo')) { if (st.H.openCEO) st.H.openCEO(); return; }
      const band = e.target.closest('.vc-band'); if (band && st.view === 'bld') return enterFloor(band.dataset.b, +band.dataset.f);
      if (e.target.closest('.vc-fig')) return;
      const lower = e.target.closest('.vc-fl'); if (lower && st.view === 'floor' && lower.dataset.b === st.b) return changeFloor(+lower.dataset.f);   // click a floor below the open one = move the cutaway there
      const b = e.target.closest('.vc-b,.vc-pill'); if (b && st.view === 'city' && b.dataset.b) return showBuilding(b.dataset.b, true);
      if (!b && st.view === 'bld') showCity(true); else if (!b && st.view === 'floor') showBuilding(st.b, true);   // click outside the building = back one step
    });
    st.svg.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = e.target.closest('.vc-b'); if (b && st.view === 'city') showBuilding(b.dataset.b, true); } });
    document.addEventListener('keydown', (e) => { if (!document.body.classList.contains('city-on') || (e.target.closest && e.target.closest('input,textarea,select'))) return;
      if (e.key === 'Escape') { if (st.view === 'floor') showBuilding(st.b, true); else if (st.view === 'bld') showCity(true); }
      else if (st.view === 'floor' && BLD[st.b].floors > 1 && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); changeFloor(st.n + (e.key === 'ArrowUp' ? 1 : -1)); } });
  }
  // ---------- traffic: cars follow fixed lanes, turn smoothly at the junction, obey the lights, keep their distance and stop for people on the crossings ----------
  const RYC = 930 + DY, YE = RYC + 32, YW = RYC - 32, XS = 1125, XN = 1195;   // east-bound / west-bound inner-lane y, south-bound / north-bound lane x
  const ROUTES = [
    [[-80, YE], [XN - 40, YE], [XN, YE - 40], [XN, -860]],                 // east, left turn, north up the side street
    [[XS, -860], [XS, YW - 40], [XS - 40, YW], [-80, YW]],                 // down the side street, right turn, west
    [[-80, YE], [CITY_W + 80, YE]], [[CITY_W + 80, YW], [-80, YW]],         // straight along the main road
    [[CITY_W + 80, YW], [XN + 40, YW], [XN, YW - 40], [XN, -860]],         // west, right turn, north
  ];
  const FLEET = [['sedan', '#2E4A7A'], ['suv', '#B8BEC6'], ['compact', '#A8342F'], ['van', '#EDEDE8'], ['taxi', '#E9B93A'], ['pickup', '#3F6B4F'], ['sedan', '#4A4F57'], ['compact', '#2F7F7A'], ['suv', '#EDEDE8'], ['van', '#EDEDE8'], ['sedan', '#C9B896'], ['pickup', '#D9D9D4']];
  let cars = [], lastT = 0, clock = 0;
  const XW = [...VCityKit.crossings().map((c) => [c - 60, c + 60, 800 + DY, 1060 + DY]), [1100, 1220, 800 + DY - 116, 800 + DY - 36]];   // crosswalk zones [x0, x1, y0, y1]
  // route geometry: points along the polyline, corners rounded
  function lane(r) { const pts = []; for (let i = 0; i < r.length - 1; i++) { const a = r[i], b = r[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 20)); for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } pts.push(r[r.length - 1]);
    for (let it = 0; it < 3; it++) for (let i = 1; i < pts.length - 1; i++) pts[i] = [(pts[i - 1][0] + pts[i][0] * 2 + pts[i + 1][0]) / 4, (pts[i - 1][1] + pts[i][1] * 2 + pts[i + 1][1]) / 4];
    const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, acc, len: acc[acc.length - 1] }; }
  function laneAt(L, s) { let i = 1; while (i < L.acc.length - 1 && L.acc[i] < s) i++; const t = (s - L.acc[i - 1]) / Math.max(1e-6, L.acc[i] - L.acc[i - 1]), a = L.pts[i - 1], b = L.pts[i]; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }; }
  // main road green 9 s, then the side street green 7 s (1 s all-red between)
  const lightEW = () => ((clock % 18) < 9 ? 'g' : 'r'), seenSig = ['', ''];
  const lightNS = () => { const t = clock % 18; return t >= 10 && t < 17 ? 'g' : 'r'; };
  function mkCars() {
    const g = $("#vc-cars", st.svg); if (!g) return; cars = []; st.cars = cars; let ci = 0;
    ROUTES.map(lane).forEach((L, ri) => { const n = [2, 2, 3, 3, 2][ri]; for (let k = 0; k < n; k++) { const el = document.createElementNS(NS, 'g'), [kind, col] = FLEET[ci++ % FLEET.length]; el.innerHTML = '<g></g>'; g.appendChild(el);
      let sp0 = ((k + 0.3 * ri) * L.len / (n + 0.6)) % L.len; for (let t = 0; t < 60; t++) { const q = laneAt(L, sp0); if (!cars.some((o) => { const r = laneAt(o.L, o.s); return Math.hypot(r.x - q.x, r.y - q.y) < 170; })) break; sp0 = (sp0 + 83) % L.len; }   // never start inside another car
      cars.push({ L, ri, s: sp0, v: 0, vmax: 90 + (ci * 17) % 40 - (kind === 'bus' ? 25 : 0), len: VCityKit.VEH[kind] * 0.8, kind, col, ang: laneAt(L, sp0).ang, hb: -1, el, in: el.firstChild }); } });
  }
  function carStep(dt) {
    const lg = lightEW(), ln = lightNS(), peds = (st.peds || []).flatMap((q) => { const k = (v) => Math.max(-140, Math.min(140, v * 0.7)); return [[q[0], q[1]], [q[0] + k(q[2] || 0), q[1] + k(q[3] || 0)]]; });
    for (const c of cars) { const p = laneAt(c.L, c.s), dx = Math.cos(p.ang), dy = Math.sin(p.ang); let target = c.vmax;
      if (Math.abs(laneAt(c.L, Math.min(c.L.len, c.s + 40)).ang - p.ang) > 0.15) target = Math.min(target, 45);   // slow into a turn
      // lights: the stop line is just before the junction box (x 1100..1220, y between the two lanes' outer edges)
      const ew = Math.abs(dx) > 0.7, inBand = p.y > YW - 40 && p.y < YE + 40, dist = ew ? (dx > 0 ? 1018 - p.x : p.x - 1302) : (dy > 0 ? 800 + DY - 122 - p.y : p.y - (YE + 60));
      if ((ew ? inBand : p.x > 1080 && p.x < 1240) && dist > -4 && dist < 100 && (ew ? lg : ln) !== 'g') target = Math.min(target, Math.max(0, (dist - c.len / 2 - 10) * 1.2));
      for (const o of cars) { if (o === c) continue; const q = laneAt(o.L, o.s), rx = q.x - p.x, ry = q.y - p.y, d = Math.hypot(rx, ry); const gap = (c.len + o.len) / 2 + 26; if (d > gap + 80 || d < 1) continue; if ((rx * dx + ry * dy) / d > 0.75) target = Math.min(target, Math.max(0, (d - gap) * 1.4)); }
      for (const a of peds) { const rx = a[0] - p.x, ry = a[1] - p.y, d = Math.hypot(rx, ry), ah = rx * dx + ry * dy, lat = Math.abs(rx * -dy + ry * dx), half = c.len / 2;   // a person in the car's lane ahead (corridor 36 wide): stop 22 before the bumper; already underneath: creep out
        if (ah > half - 4 && ah < 150 + half && lat < 36) target = Math.min(target, Math.max(0, (ah - half - 22) * 1.5)); else if (d < half + 14) target = Math.max(Math.min(target, 40), 28); }
      // crossings: if anyone is on (or about to step onto) a crosswalk, the car holds at its edge
      for (const z of XW) { if (!peds.some((q) => q[0] > z[0] - 60 && q[0] < z[1] + 60 && q[1] > z[2] - 70 && q[1] < z[3] + 70)) continue; const dist = Math.abs(dx) > 0.7 ? (dx > 0 ? z[0] - p.x : p.x - z[1]) : (dy > 0 ? z[2] - p.y : p.y - z[3]);
        if (dist > 4 && dist < 220 && (Math.abs(dx) > 0.7 ? p.y > z[2] - 60 && p.y < z[3] + 60 : p.x > z[0] - 60 && p.x < z[1] + 60)) target = Math.min(target, Math.max(0, (dist - c.len / 2 - 34) * 1.5)); }
      // turning across traffic: the left turn waits for oncoming west-bound cars, the side-street turn waits for west-bound cars in its lane
      if (c.ri === 0 && p.x < 1100 && p.x > 900 && cars.some((o) => (o.ri === 3 || o.ri === 4) && laneAt(o.L, o.s).x > 1060 && laneAt(o.L, o.s).x < 1460)) target = Math.min(target, Math.max(0, (1096 - p.x - c.len / 2) * 1.5));
      if (c.ri === 1 && p.y > 1150 && p.y < YW - 50 && cars.some((o) => o.ri === 3 && laneAt(o.L, o.s).x > 1020 && laneAt(o.L, o.s).x < 1400)) target = Math.min(target, Math.max(0, (YW - 70 - p.y - c.len / 2) * 1.5));
      c.v += Math.max(-220 * dt, Math.min(60 * dt, target - c.v)); if (c.v < 0) c.v = 0; c.s += c.v * dt; if (c.s >= c.L.len) { c.s = 0; c.v = Math.min(c.v, 40); }
      const q = laneAt(c.L, c.s), sp = P(q.x, q.y), fade = Math.min(1, c.s / 60, (c.L.len - c.s) / 60);
      { let da = q.ang - c.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); c.ang += da * Math.min(1, dt * 12); }
      const vb = st.vb, vis = sp[0] > vb.x - 220 && sp[0] < vb.x + vb.w + 220 && sp[1] > vb.y - 260 && sp[1] < vb.y + vb.h + 220;   // cars off-camera are simulated but not drawn
      if (!vis) { if (c.on !== false) { c.on = false; c.el.style.display = 'none'; } continue; } if (c.on === false) { c.on = true; c.el.style.display = ''; }
      c.el.setAttribute('transform', `translate(${sp[0].toFixed(1)} ${sp[1].toFixed(1)})`); c.el.setAttribute('opacity', Math.max(0, fade).toFixed(2));
      { const hb = Math.round(c.ang / (Math.PI * 2) * 120); if (hb !== c.hb) { c.hb = hb; c.in.innerHTML = VCityKit.vehicleAt(c.kind, c.col, c.ang); } }; }
  }
  function tick(t) { requestAnimationFrame(tick); watchTick(t); const dt = Math.min(0.1, lastT ? (t - lastT) / 1000 : 0.016); lastT = t; if (document.hidden || (window.VPerf && VPerf.busy()) || (st.seen && !st.seen.visible)) return; clock += dt; carStep(dt);
    const m = clock % 18, ew = m < 8 ? 'g' : m < 9 ? 'y' : 'r', ns = m >= 10 && m < 16 ? 'g' : m >= 16 && m < 17 ? 'y' : 'r'; if (ew !== seenSig[0] || ns !== seenSig[1]) { seenSig[0] = ew; seenSig[1] = ns; VCityKit.setSignals(st.svg, ew, ns); } }
  function mount(H) {
    st.H = H; st.stage = H.stage; const old = st.stage.querySelector('#vc-root'); if (old) old.remove();
    const wrap = document.createElement('div'); wrap.id = 'vc-root'; wrap.className = 'vc'; st.stage.appendChild(wrap); st.root = wrap;
    st.svg = document.createElementNS(NS, 'svg'); st.svg.setAttribute('id', 'vc-svg'); st.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); st.svg.setAttribute('aria-label', 'V Agent City: Marketing Headquarters, Web Builder, Sniper Client, Client Voice AI and the CEO castle');
    wrap.appendChild(st.svg); st.svg.innerHTML = drawAll(); document.body.classList.add('city-on');
    const sc0 = document.getElementById('scene'); if (sc0) { park().appendChild(sc0); st.scene = sc0; }   // the original office lives inside the city svg from the start (parked until a floor opens)
    bindCamera(); mountUI(); st.view = 'city'; setMode(); frame(false); renderUI(); paintLights(); mkCars(); requestAnimationFrame(tick);
  }
  // camera helper for office.js: centre the open floor's camera on a point of the office (office screen coordinates)
  function focusScene(sx, sy) { const t = tileRect(st.b, st.n), w = Math.min(st.vb.w, t.w * 0.45), h = w * st.vb.h / st.vb.w, X = t.x + M * (sx - st.vb0.x), Y = t.y + M * (sy - st.vb0.y) - 20;
    if (st.cam) st.cam.kill(); const to = { x: X - w / 2, y: Y - h / 2, w, h }; if (window.gsap) st.cam = gsap.to(st.vb, { ...to, duration: 0.7, ease: 'power2.inOut', onUpdate: setVB }); else { Object.assign(st.vb, to); setVB(); } }
  window.VCity = { mount, update, floorCtx, locate, enter: enterFloor, view: () => st.view, st, BLD, ORDER, assign, showCity, showBuilding, changeFloor, nav: cityNav, doorPt, streetDraw, watch, tile, focusScene };
})();
