// V Agent City — the OUTER layer only: city overview -> building exterior (pick a floor) -> the original isometric office (scene.js / office.js).  window.VCity
// No interiors are drawn here. Entering a floor hands over to office.js, which renders the ORIGINAL scene for that floor's department + agents.
// Marketing HQ = 6 floors (floor n = the n-th Marketing agent, sorted by key; extra marketers join floor 1), Web Builder = 1 floor, Sniper Client = 1 floor.
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s, r) => (r || document).querySelector(s);
  const K = 0.866;
  // ONE scale for the whole world: the ORIGINAL floor (1520 x 2200 floor units) is mounted at scale M inside every building, so footprints, people, cars and streets share it.
  const M = 0.5, K0 = 0.8 * M / 0.866, FW = Math.round(1520 * K0), FD = Math.round(2200 * K0), FH = 130, DY = FD - 460;   // DY: how far the south half of the city moved to make room for the deeper buildings
  const BLD = {
    mk: { id: 'mk', name: 'Marketing Headquarters', short: 'Marketing', match: /^(marketing|content|paid|publishing|seo|client voice)/i, floors: 6, fp: [300, 160, FW, FD], h: 6 * FH, door: 300 + FW / 2, col: '#B5532F', wall: ['#E9E5DA', '#D9D4C6', '#CBC5B5'] },
    web: { id: 'web', name: 'Web Builder', short: 'Web Builder', match: /web|site/i, floors: 1, fp: [1500, 160, FW, FD], h: FH, door: 1500 + FW / 2, col: '#2F6F9F', wall: ['#E4E8EC', '#D0D7DE', '#BFC8D1'] },
    sn: { id: 'sn', name: 'Sniper Client', short: 'Sniper Client', match: /sniper/i, floors: 1, fp: [2700, 160, FW, FD], h: FH, door: 2700 + FW / 2, col: '#3F7D58', wall: ['#E6E9E3', '#D2D8CF', '#C0C8BC'] },
  };
  const ORDER = ['mk', 'web', 'sn'];
  // Marketing HQ: floor n = the n-th of these departments (matched by name; a missing one leaves its floor empty). Change here if the marketing teams are renamed.
  const MK_FLOORS = [/^marketing/i, /^content/i, /^paid/i, /^publishing/i, /^seo/i, /^client voice/i];
  const CITY_W = 3600, CITY_D = 2000 + DY;
  const P = (gx, gy, z) => [(gx - gy) * K, (gx + gy) * 0.5 - (z || 0)];
  const pp = (gx, gy, z) => P(gx, gy, z).map((n) => n.toFixed(1)).join(',');
  function TREES() { return TREES0.map(([x, y]) => [x, y > 500 ? y + DY : y]); }
  const TREES0 = [[120, 1300], [420, 1420], [250, 1620], [700, 1320], [900, 1500], [1250, 1300], [1500, 1650], [2100, 1350], [2400, 1700], [2800, 1380], [3200, 1560], [3400, 1300], [600, 1800], [1100, 1820], [2700, 1850], [3300, 1850], [60, 760], [800, 740], [1360, 740], [2380, 740], [3480, 740], [100, 120], [1000, 120], [2400, 120]];
  function LAMPS() { const a = []; for (let x = 200; x < 3600; x += 400) a.push(x); return a; }
  const LY = 1090 + DY, NLY = 784 + DY;   // south-side lamps (LY) and the lamps along the building-side kerb (NLY)
  const NLAMPS = () => LAMPS().map((x) => x + 200).filter((x) => ![1500 + FW / 2, 300 + FW / 2, 2700 + FW / 2].some((d) => Math.abs(x - d) < 90));
  // ---------- street navigation (same VNav A* as the floors) ----------
  // buildings, the middle of both roads (open only at the crosswalks), trees, lamps and the fountain block; sidewalks, crosswalks, the plaza and the park are walkable
  const cityNav = (() => {
    const r = [], add = (a, b, c, d) => r.push([a, b, c, d]);
    for (const b of ['mk', 'web', 'sn']) { const [x, y, w, d] = BLD[b].fp; add(x, y, x + w, y + d); }
    for (const [x0, x1] of [[0, 520], [640, 1800], [1920, 3000], [3120, 3600]]) add(x0, 880 + DY, x1, 980 + DY);
    add(1100, 0, 1220, 700 + DY); add(1100, 780 + DY, 1220, 880 + DY); add(1790, 1590 + DY, 1810, 1610 + DY);
    for (const [x, y] of TREES()) add(x - 12, y - 12, x + 12, y + 12);
    for (const x of LAMPS()) add(x - 5, LY - 5, x + 5, LY + 5);
    for (const x of NLAMPS()) add(x - 5, NLY - 5, x + 5, NLY + 5);
    for (const b of ['mk', 'web', 'sn']) for (const sx of [-130, 130]) { const gx = BLD[b].door + sx, gy = BLD[b].fp[1] + BLD[b].fp[3] + 22; add(gx - 20, gy - 8, gx + 20, gy + 8); }
    for (const x of [1010, 2210, 60]) add(x - 6, 1290 + DY - 6, x + 6, 1290 + DY + 6);
    return { W: CITY_W, D: CITY_D, rects: r, doors: [] };
  })();
  const doorPt = (b) => [BLD[b].door, BLD[b].fp[1] + BLD[b].fp[3] + 30];   // sidewalk in front of the entrance

  // the department that matches a building (by name) -> its agents in a stable order (sorted by key). Nothing is invented.
  function assign(D, H) {
    const out = { mk: [], web: [], sn: [], none: [] }, deps = {}; for (const b of ORDER) deps[b] = new Set(D.departments.filter((d) => BLD[b].match.test(d.name || '')).map((d) => d.id));
    for (const a of D.agents) { if (H.isHelper(a)) continue; const b = ORDER.find((x) => deps[x].has(a.dept)); (b ? out[b] : out.none).push(a); }
    for (const b of ORDER) out[b].sort((p, q) => (p.key < q.key ? -1 : 1));
    out.mkFloors = MK_FLOORS.map((re) => { const d = D.departments.find((x) => re.test(x.name || '')) || null; return { dept: d, agents: d ? out.mk.filter((a) => a.dept === d.id) : [] }; });
    return out;
  }
  const st = { H: null, D: { agents: [], departments: [] }, view: 'city', b: null, n: 1, svg: null, root: null, bar: null, vb: { x: 0, y: 0, w: 1000, h: 700 }, busy: false };

  // ---------- drawing: shared bits ----------
  const rect = (x, y, w, h, fill, extra) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra || ''}/>`;
  const defs = () => `<defs>
    <linearGradient id="vc-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9CC4E4"/><stop offset=".62" stop-color="#E4EEF3"/><stop offset="1" stop-color="#F5EEDC"/></linearGradient>
    <linearGradient id="vc-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#BFDFF2"/><stop offset=".5" stop-color="#7FA9C6"/><stop offset="1" stop-color="#5A86A6"/></linearGradient>
    <linearGradient id="vc-glass-on" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE9A8"/><stop offset="1" stop-color="#F2BE5B"/></linearGradient>
    <linearGradient id="vc-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3EFE4"/><stop offset="1" stop-color="#E4DFD0"/></linearGradient>
    <linearGradient id="vc-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9B79B"/><stop offset="1" stop-color="#B09C7C"/></linearGradient>
    <linearGradient id="vc-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="vc-pool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE7A6" stop-opacity=".55"/><stop offset="1" stop-color="#FFE7A6" stop-opacity="0"/></radialGradient>
    <pattern id="vc-grass" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="60" fill="#8DB478"/><circle cx="12" cy="16" r="2" fill="#7CA567"/><circle cx="40" cy="44" r="2.4" fill="#9CC287"/><circle cx="50" cy="12" r="1.6" fill="#7CA567"/></pattern>
    <pattern id="vc-asphalt" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" fill="#4A4D55"/><circle cx="6" cy="9" r="1.1" fill="#5A5D66"/><circle cx="30" cy="20" r="1.3" fill="#3D4048"/><circle cx="18" cy="38" r="1" fill="#5A5D66"/><circle cx="41" cy="43" r="1.2" fill="#3D4048"/><path d="M4 26 q10 -4 20 1" stroke="#42454D" stroke-width=".8" fill="none"/></pattern>
    <pattern id="vc-pave" width="40" height="24" patternUnits="userSpaceOnUse"><rect width="40" height="24" fill="#D3CFC4"/><path d="M0 .5h40M20 .5v12M0 12.5h40M0 12.5v-0M40 12.5" stroke="#C2BDB0" stroke-width="1"/><path d="M0 12.5h40M0 24h40M0 12v12" stroke="#C2BDB0" stroke-width="1"/></pattern>
    <pattern id="vc-wood" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#C2AE90"/><path d="M0 10h40M0 24h40M0 36h40" stroke="#B29E80" stroke-width="1"/></pattern>
  </defs>`;
  // hull of two translated rectangles = the cast shadow on the ground
  function hull(pts) { pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = [];
    for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of pts.slice().reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } return lo.slice(0, -1).concat(up.slice(0, -1)); }
  const quad = (a, b, c, d, fill, extra) => `<polygon points="${[a, b, c, d].map((p) => pp(p[0], p[1], p[2])).join(' ')}" fill="${fill}" ${extra || ''}/>`;
  const plane = (gx, gy) => { const o = P(gx, gy, 0); return `translate(${o[0].toFixed(1)} ${o[1].toFixed(1)})`; };

  // ---------- drawing: the city ----------
  function drawCity() {
    let s = `<rect x="-4600" y="-1600" width="9600" height="5600" fill="url(#vc-sky)"/>`;
    s += `<g class="vc-clouds">${[[-1400, -700, 1], [200, -1000, 1.3], [1800, -760, .9]].map(([x, y, k], i) => `<g class="vc-cloud c${i}" transform="translate(${x} ${y}) scale(${k})"><ellipse cx="0" cy="0" rx="150" ry="34" fill="#fff" opacity=".7"/><ellipse cx="-70" cy="-22" rx="80" ry="30" fill="#fff" opacity=".7"/><ellipse cx="60" cy="-28" rx="90" ry="34" fill="#fff" opacity=".7"/></g>`).join('')}</g>`;
    s += quad([-80, -80], [CITY_W + 80, -80], [CITY_W + 80, CITY_D + 80], [-80, CITY_D + 80], '#6E8F5C') + quad([0, 0], [CITY_W, 0], [CITY_W, CITY_D], [0, CITY_D], 'url(#vc-grass)');
    // roads + sidewalks
    const road = (x0, y0, x1, y1) => quad([x0, y0], [x1, y0], [x1, y1], [x0, y1], 'url(#vc-asphalt)');
    const walk = (x0, y0, x1, y1) => quad([x0, y0], [x1, y0], [x1, y1], [x0, y1], 'url(#vc-pave)');
    s += walk(0, 690 + DY, CITY_W, 1190 + DY) + road(0, 800 + DY, CITY_W, 1060 + DY) + walk(1040, 0, 1280, 700 + DY) + road(1100, 0, 1220, 800 + DY);
    s += `<polyline points="${[[0, 930 + DY], [CITY_W, 930 + DY]].map((p) => pp(p[0], p[1])).join(' ')}" stroke="#E9D27A" stroke-width="3" stroke-dasharray="40 30" fill="none"/>`;
    s += `<polyline points="${[[1160, 0], [1160, 800 + DY]].map((p) => pp(p[0], p[1])).join(' ')}" stroke="#E9D27A" stroke-width="3" stroke-dasharray="40 30" fill="none"/>`;
    { const L = (ax, ay, bx, by, c, w, d) => `<polyline points="${[[ax, ay], [bx, by]].map((q) => pp(q[0], q[1])).join(' ')}" stroke="${c}" stroke-width="${w}" ${d ? 'stroke-dasharray="' + d + '"' : ''} fill="none"/>`;
      s += L(0, 800 + DY, CITY_W, 800 + DY, '#E6E2D6', 5) + L(0, 1060 + DY, CITY_W, 1060 + DY, '#E6E2D6', 5) + L(0, 812 + DY, CITY_W, 812 + DY, '#F2F0EA', 2) + L(0, 1048 + DY, CITY_W, 1048 + DY, '#F2F0EA', 2) + L(1100, 0, 1100, 800 + DY, '#E6E2D6', 5) + L(1220, 0, 1220, 800 + DY, '#E6E2D6', 5);
      for (const [a, b] of [[40, 520], [1280, 1800], [1920, 3000], [3120, 3560]]) for (let x = a; x <= b; x += 74) s += L(x, 815 + DY, x, 852 + DY, '#F2F0EA', 2.2); }
    for (const cx of [300 + FW / 2, 1500 + FW / 2, 2700 + FW / 2]) for (let k = -50; k < 60; k += 20) s += quad([cx + k - 6, 808 + DY], [cx + k + 6, 808 + DY], [cx + k + 6, 1052 + DY], [cx + k - 6, 1052 + DY], '#F2F0EA', 'opacity=".9"');
    for (let k = 710 + DY; k < 780 + DY; k += 16) s += quad([1104, k], [1216, k], [1216, k + 8], [1104, k + 8], '#F2F0EA', 'opacity=".9"');
    // park
    s += quad([60, 1240 + DY], [3540, 1240 + DY], [3540, 1940 + DY], [60, 1940 + DY], '#9CC287', 'opacity=".55"');
    s += quad([300, 1480 + DY], [3300, 1480 + DY], [3300, 1540 + DY], [300, 1540 + DY], '#D8D2C2') + quad([1500, 1300 + DY], [2100, 1300 + DY], [2100, 1900 + DY], [1500, 1900 + DY], '#D8D2C2', 'opacity=".9"');
    // shadows (light from the upper left: they fall to the right and down)
    for (const id of ORDER) { const b = BLD[id], [x, y, w, d] = b.fp, sx = b.h * 0.55, sy = b.h * 0.22, pts = [[x, y], [x + w, y], [x + w, y + d], [x, y + d]]; const all = pts.concat(pts.map((p) => [p[0] + sx, p[1] + sy])).map((p) => P(p[0], p[1]));
      s += `<polygon points="${hull(all).map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="#1B2A22" opacity=".22"/>`; }
    st.cityStatic = s; return s;
  }
  // depth-sorted scenery + buildings; agents are added by update()
  function sceneryItems() {
    const it = [];
    for (const [x, y] of TREES()) it.push({ k: x + y, y, h: Math.round(x / 7) % 3 === 0 ? `<g transform="translate(${pp(x, y)})"><ellipse cx="6" cy="3" rx="26" ry="10" fill="#1B2A22" opacity=".25"/><rect x="-3" y="-30" width="6" height="32" fill="#5E4430"/><polygon points="0,-130 26,-62 -26,-62" fill="#3F6B47"/><polygon points="0,-104 32,-34 -32,-34" fill="#4B7C52"/><polygon points="0,-78 36,-14 -36,-14" fill="#5A8E5E"/></g>` : `<g transform="translate(${pp(x, y)})"><ellipse cx="6" cy="3" rx="30" ry="12" fill="#1B2A22" opacity=".25"/><rect x="-4" y="-46" width="8" height="48" fill="#6B4D35"/><ellipse cx="0" cy="-84" rx="42" ry="50" fill="#4E7A45"/><ellipse cx="-14" cy="-74" rx="30" ry="36" fill="#5F9055"/><ellipse cx="16" cy="-98" rx="24" ry="28" fill="#6EA064"/></g>` });
    for (const x of LAMPS()) { it.push({ k: x + LY, y: LY, h: `<g transform="translate(${pp(x, LY)})"><ellipse cx="0" cy="0" rx="46" ry="18" fill="url(#vc-pool)" class="vc-lamp"/><rect x="-2.5" y="-120" width="5" height="120" fill="#3B3F47"/><path d="M0 -120 q22 0 26 14" stroke="#3B3F47" stroke-width="4" fill="none"/><ellipse cx="26" cy="-104" rx="9" ry="4" fill="#FFE7A6"/></g>` });
      if (NLAMPS().includes(x + 200)) it.push({ k: x + 200 + NLY, y: NLY, h: `<g transform="translate(${pp(x + 200, NLY)})"><rect x="-2.5" y="-110" width="5" height="110" fill="#3B3F47"/><ellipse cx="0" cy="-114" rx="10" ry="5" fill="#FFE7A6"/></g>` }); }
    it.push({ k: 1800 + 1600 + DY, y: 1600 + DY, h: `<g transform="translate(${pp(1800, 1600 + DY)})"><ellipse cx="0" cy="0" rx="120" ry="60" fill="#B9B3A3"/><ellipse cx="0" cy="-6" rx="104" ry="52" fill="#6BB3D8"/><ellipse class="vc-ripple" cx="0" cy="-6" rx="70" ry="34" fill="none" stroke="#fff" stroke-width="3" opacity=".6"/><rect x="-6" y="-70" width="12" height="64" fill="#CFC9BB"/><ellipse cx="0" cy="-72" rx="28" ry="12" fill="#B9B3A3"/><path class="vc-jet" d="M0 -72 q-24 -36 -40 0 M0 -72 q24 -36 40 0 M0 -72 v-38" stroke="#E7F6FF" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>` });
    for (const [x, y] of [[700, 1500 + DY], [1100, 1500 + DY], [2500, 1500 + DY], [2900, 1500 + DY]]) it.push({ k: x + y, y, h: `<g transform="translate(${pp(x, y)})"><rect x="-44" y="-22" width="88" height="10" fill="#8A6446"/><rect x="-44" y="-44" width="88" height="8" fill="#9A7253"/><rect x="-40" y="-12" width="6" height="14" fill="#3B3F47"/><rect x="34" y="-12" width="6" height="14" fill="#3B3F47"/></g>` });
    for (const id of ORDER) { const b = BLD[id]; for (const sx of [-130, 130]) { const gx = b.door + sx, gy = b.fp[1] + b.fp[3] + 22; it.push({ k: gx + gy, y: gy, h: `<g transform="translate(${pp(gx, gy)})"><ellipse cx="4" cy="2" rx="22" ry="8" fill="#1B2A22" opacity=".25"/><rect x="-16" y="-12" width="32" height="13" rx="2" fill="#8A6446"/><ellipse cx="0" cy="-18" rx="17" ry="11" fill="#4E7A45"/><ellipse cx="-5" cy="-23" rx="10" ry="8" fill="#6EA064"/><circle cx="7" cy="-21" r="3" fill="#E0687A"/><circle cx="-9" cy="-17" r="2.6" fill="#F0C75E"/></g>` }); } }
    for (const [x, y, t] of [[1010, 1290 + DY - 556 + 556 - 120, 'ONE WAY'], [2210, 1290 + DY, 'P'], [60, 1300 + DY, 'STOP']].map((q) => [q[0], 1290 + DY, q[2]])) it.push({ k: x + y, y, h: `<g transform="translate(${pp(x, y)})"><rect x="-1.5" y="-62" width="3" height="62" fill="#55534D"/><rect x="-16" y="-78" width="32" height="18" rx="3" fill="${t === 'STOP' ? '#C23B2E' : '#2F6F9F'}"/><text y="-65" text-anchor="middle" font-size="${t.length > 3 ? 7 : 11}" font-weight="700" fill="#fff" font-family="Inter,sans-serif">${t}</text></g>` });
    for (const [x, y, c] of [[410, 833 + DY, '#2F6F9F'], [484, 833 + DY, '#E9E4D6'], [1405, 833 + DY, '#B5532F'], [1627, 833 + DY, '#6B6F78'], [2330, 833 + DY, '#3F7D58'], [3250, 833 + DY, '#D9A441']]) it.push({ k: x + y, y, h: `<g transform="translate(${pp(x, y)})"><g transform="matrix(${K} .5 ${-K} .5 0 0) scale(.8)">${carSvg(c)}</g></g>` });
    it.push({ k: 1700 + 1380 + DY, y: 1380 + DY, h: `<g class="vc-ceo" transform="translate(${pp(1700, 1380 + DY)})" tabindex="0" role="button" aria-label="Talk to the CEO" style="cursor:pointer"><ellipse cx="0" cy="2" rx="26" ry="9" fill="#000" opacity=".28"/><g transform="scale(${M * 1.1})"><use href="#ceo"/></g><g transform="translate(0 -72)"><rect x="-34" y="-14" width="68" height="26" rx="13" fill="#141413" opacity=".9"/><text y="4" text-anchor="middle" font-size="15" font-weight="700" fill="#E9C46A" font-family="Inter,sans-serif">CEO</text></g></g>` });
    return it;
  }
  // A building = stacked floor groups (.vc-fl, bottom to top) + roof group (.vc-top) + one slab per floor level (.vc-slab, shown under the open floor) + a host (.vc-host) where the ORIGINAL office scene is mounted.
  // Cutaway = the floors above the open one fade out, the open one is replaced by the real office, the floors below stay as structure.
  function buildingSvg(id) {
    const b = BLD[id], [x, y, w, d] = b.fp, h = b.h, fl = b.floors, fh = FH, c = b.wall, S = [], NP = 8;
    const south = `<g transform="${plane(x, y + d)} matrix(${K} .5 0 1 0 0)">`, east = `<g transform="${plane(x + w, y)} matrix(${-K} .5 0 1 0 0)">`;
    S.push(`<g class="vc-b" data-b="${id}" tabindex="0" role="button" aria-label="${b.name}" style="cursor:pointer">`);
    const pw = w / NP, dx = b.door - x;
    for (let f = 0; f < fl; f++) {
      const z0 = f * fh, z1 = z0 + fh, v0 = z0 + fh * 0.22, v1 = z1 - fh * 0.2;
      S.push(`<g class="vc-fl" data-b="${id}" data-f="${f + 1}">`);
      S.push(quad([x, y + d, z0], [x + w, y + d, z0], [x + w, y + d, z1], [x, y + d, z1], c[1]), quad([x + w, y, z0], [x + w, y + d, z0], [x + w, y + d, z1], [x + w, y, z1], c[2]));
      S.push(south);
      for (let k = 0; k < NP; k++) { if (f === 0 && Math.abs(k * pw + pw / 2 - dx) < 80) continue; S.push(`<rect class="vc-win" data-b="${id}" data-f="${f + 1}" x="${(k * pw + 9).toFixed(1)}" y="${-v1}" width="${(pw - 18).toFixed(1)}" height="${(v1 - v0).toFixed(1)}" rx="3" fill="url(#vc-glass)"/><rect x="${(k * pw + 9).toFixed(1)}" y="${-v1}" width="${(pw - 18).toFixed(1)}" height="${(v1 - v0).toFixed(1)}" rx="3" fill="url(#vc-shine)"/><rect x="${(k * pw + 9).toFixed(1)}" y="${-v0 - 3}" width="${(pw - 18).toFixed(1)}" height="3" fill="#8F8A7B"/>`); }
      S.push(`<rect x="0" y="${-z1}" width="${w}" height="5" fill="#A39E8F"/>`);
      if (f === 0) S.push(`<rect x="${dx - 46}" y="-66" width="92" height="66" fill="#27313B"/><rect x="${dx - 41}" y="-61" width="39" height="61" fill="url(#vc-glass)"/><rect x="${dx + 2}" y="-61" width="39" height="61" fill="url(#vc-glass)"/><rect x="${dx - 56}" y="-84" width="112" height="14" fill="${b.col}"/><text x="${dx}" y="-73.5" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" font-family="Inter,sans-serif" letter-spacing="1">${b.short.toUpperCase()}</text><rect x="${dx - 60}" y="-4" width="120" height="4" fill="#9A9586"/>`);
      S.push('</g>', east);
      const nd = 8, pd = d / nd; for (let k = 0; k < nd; k++) S.push(`<rect x="${(k * pd + 9).toFixed(1)}" y="${-v1}" width="${(pd - 18).toFixed(1)}" height="${(v1 - v0).toFixed(1)}" rx="3" fill="url(#vc-glass)" opacity=".85"/>`);
      S.push(`<rect x="0" y="${-z1}" width="${d}" height="5" fill="#8E897B"/></g></g>`);
    }
    for (let f = 1; f <= fl; f++) { const z = (f - 1) * fh;   // slab under floor f: the concrete the open office sits on (+ its visible edge)
      S.push(`<g class="vc-slab" data-f="${f}">${quad([x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z], '#BDB7A8')}${quad([x, y + d, z - 6], [x + w, y + d, z - 6], [x + w, y + d, z + 3], [x, y + d, z + 3], '#A39E8F')}${quad([x + w, y, z - 6], [x + w, y + d, z - 6], [x + w, y + d, z + 3], [x + w, y, z + 3], '#8E897B')}</g>`); }
    S.push(`<g class="vc-host" data-b="${id}"></g>`);
    S.push(`<g class="vc-top" data-b="${id}">`);
    S.push(quad([x, y, h], [x + w, y, h], [x + w, y + d, h], [x, y + d, h], c[0]), quad([x, y + d, h], [x + w, y + d, h], [x + w, y + d, h - 12], [x, y + d, h - 12], '#8F8A7B'));
    S.push(south, `<rect x="${w / 2 - 170}" y="${-(h - 12) + 10}" width="340" height="36" rx="6" fill="${b.col}"/><text x="${w / 2}" y="${-(h - 12) + 36}" text-anchor="middle" font-family="Newsreader,Georgia,serif" font-size="27" font-weight="600" fill="#FAF9F5">${b.short.toUpperCase()}</text>`, '</g>');
    for (const [rx, ry, rw, rd] of [[x + 60, y + 80, 140, 110], [x + w - 230, y + 120, 120, 100], [x + 90, y + d - 330, 160, 120]]) { S.push(quad([rx, ry, h], [rx + rw, ry, h], [rx + rw, ry + rd, h], [rx, ry + rd, h], '#9AA0A8'), quad([rx, ry + rd, h], [rx + rw, ry + rd, h], [rx + rw, ry + rd, h + 24], [rx, ry + rd, h + 24], '#B7BCC3'), quad([rx + rw, ry, h], [rx + rw, ry + rd, h], [rx + rw, ry + rd, h + 24], [rx + rw, ry, h + 24], '#8E949C'), quad([rx, ry, h + 24], [rx + rw, ry, h + 24], [rx + rw, ry + rd, h + 24], [rx, ry + rd, h + 24], '#C9CED4')); }
    const tp = P(x + w * 0.5, y + d * 0.35, h); S.push(`<line x1="${tp[0]}" y1="${tp[1]}" x2="${tp[0]}" y2="${tp[1] - 90}" stroke="#55534D" stroke-width="3"/><circle class="vc-blink" cx="${tp[0]}" cy="${tp[1] - 92}" r="5" fill="#E24B3B"/>`);
    S.push('</g>');
    S.push(bandsSvg(id));
    const lp = P(x + w / 2, y + d / 2, h + 130); S.push(`<g class="vc-pill" data-b="${id}" transform="translate(${lp[0].toFixed(1)} ${lp[1].toFixed(1)}) scale(1.7)"><rect x="-210" y="-34" width="420" height="68" rx="34" fill="#141413" opacity=".92"/><circle cx="-172" cy="0" r="12" fill="${b.col}"/><text class="t1" x="-148" y="-4" font-size="26" font-weight="700" fill="#FAF9F5" font-family="Inter,sans-serif">${b.short}</text><text class="t2" x="-148" y="24" font-size="19" fill="#C9C6BC" font-family="Inter,sans-serif"></text></g>`);
    S.push('</g>');
    return { k: x + y + d, y: y + d, h: S.join('') };
  }
  // sorted scenery + buildings; the cars drive between the "behind the road" and "in front of the road" items
  function drawCityAll() {
    const items = sceneryItems().concat(ORDER.map(buildingSvg)).sort((a, b) => a.k - b.k), RY = 930 + DY;
    const back = items.filter((i) => (i.y === undefined ? 0 : i.y) < RY).map((i) => i.h).join(''), front = items.filter((i) => (i.y === undefined ? 0 : i.y) >= RY).map((i) => i.h).join('');
    return defs() + `<g id="vc-world">${st.cityStatic || drawCity()}<g id="vc-sorted">${back}<g id="vc-cars" pointer-events="none"></g>${front}</g><g id="vc-cityag"></g><g id="vc-tilepark" display="none"></g></g>`;
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
  function setVB() { const v = st.vb; st.svg.setAttribute('viewBox', `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`);
    if (st.view === 'floor' && st.lodFn && !lodQ) { lodQ = true; requestAnimationFrame(() => { lodQ = false; if (st.view === 'floor' && st.lodFn) st.lodFn(); }); } }
  function fitTo(box, animate) {
    const r = st.svg.getBoundingClientRect(), asp = (r.width || 1000) / (r.height || 700); let w = box.w, h = box.h; if (w / h < asp) w = h * asp; else h = w / asp;
    const to = { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
    if (st.cam) st.cam.kill();
    if (animate && window.gsap && !matchMedia('(prefers-reduced-motion:reduce)').matches) st.cam = gsap.to(st.vb, { ...to, duration: 1.1, ease: 'power2.inOut', onUpdate: setVB }); else { Object.assign(st.vb, to); setVB(); }
  }
  function boxOf(id) { const b = BLD[id], [x, y, w, d] = b.fp, l = P(x, y + d)[0], r = P(x + w, y)[0], t = P(x, y, b.h + 200)[1], bt = P(x + w, y + d)[1] + 150; return { x: l - 100, y: t, w: r - l + 200, h: bt - t }; }
  // the open floor: the original scene's rectangle in world coordinates (+ a little ground so the building stays readable)
  const tileBox = (id, n) => { const t = tileRect(id, n); return t ? { x: t.x - 20, y: t.y - 20, w: t.w + 40, h: t.h + 40 } : boxOf(id); };
  const CITY_BOX = { x: -1700, y: -700, w: 5000, h: 3500 };
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
    if (window.ResizeObserver) new ResizeObserver(() => { if (!st.busy) frame(false); }).observe(stage);
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
    if (st.view !== 'floor') return null; const by = assign(D, st.H), id = st.b, deps = D.departments.filter((d) => BLD[id].match.test(d.name || ''));
    const live = (a) => !(window.VMove && VMove.isManaged(a.key));
    if (id === 'mk') { const fl = by.mkFloors[st.n - 1]; return { departments: fl.dept ? [fl.dept] : [], agents: fl.agents.filter(live), esc: { up: st.n < 6, down: st.n < 6, hole: st.n > 1 }, tag: 'mk' + st.n }; }
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
    if (!st.svg) return; const layer = $('#vc-cityag', st.svg); if (!layer) return; const seen = new Set(); st.peds = list.filter((s) => s.a).map((s) => { const q = [s.x, s.y]; return q; });
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
      st.svg.querySelectorAll(`.vc-win[data-b="${b}"]`).forEach((r) => { const f = +r.dataset.f; const on = b === 'mk' ? byB.mkFloors[f - 1].agents.some((a) => a.status === 'working') : w > 0; r.setAttribute('fill', on ? 'url(#vc-glass-on)' : 'url(#vc-glass)'); }); }
  }

  // ---------- UI ----------
  const esc = (t) => String(t).replace(/[<&>"]/g, '');
  function renderUI() {
    if (!st.ui) return; const u = st.ui, byB = assign(st.D, st.H);
    $('.vc-tabs', u).innerHTML = `<button type="button" data-go="city" class="${st.view === 'city' ? 'on' : ''}">City overview</button>` + ORDER.map((b) => `<button type="button" data-go="${b}" class="${st.b === b ? 'on' : ''}" style="--c:${BLD[b].col}"><i></i>${BLD[b].short} <small>${byB[b].length}</small></button>`).join('');
    const fl = $('.vc-floors', u);
    if (st.view === 'bld') { const id = st.b, B = BLD[id], list = byB[id]; fl.hidden = false;
      fl.innerHTML = `<span class="vc-h">${esc(B.name)} · pick a floor</span>` + Array.from({ length: B.floors }, (_, i) => B.floors - i).map((f) => { const fl = id === 'mk' ? byB.mkFloors[f - 1] : null, cnt = id === 'mk' ? fl.agents.length : list.length, wk = (id === 'mk' ? fl.agents : list).filter((a) => a.status === 'working').length;
        return `<button type="button" data-floor="${f}"><b>${f}</b><span>${id === 'mk' ? (fl.dept ? esc(fl.dept.name) : '<em>no department</em>') : 'Floor 1'}<small>${cnt} agent${cnt === 1 ? '' : 's'}${wk ? ' · ' + wk + ' working' : ''}</small></span></button>`; }).join(''); }
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
  const RYC = 930 + DY, YE = RYC + 55, YW = RYC - 55, XS = 1125, XN = 1195;   // east-bound / west-bound lane y, south-bound / north-bound lane x
  const ROUTES = [
    [[-80, YE], [XN - 40, YE], [XN, YE - 40], [XN, 30]],                   // east, left turn, north up the side street
    [[XS, 30], [XS, YW - 40], [XS - 40, YW], [-80, YW]],                   // down the side street, right turn, west
    [[-80, YE], [CITY_W + 80, YE]], [[CITY_W + 80, YW], [-80, YW]],         // straight along the main road
    [[CITY_W + 80, YW], [XN + 40, YW], [XN, YW - 40], [XN, 30]],           // west, right turn, north
  ];
  const CAR_COL = ['#B5532F', '#2F6F9F', '#E9E4D6', '#3F7D58', '#D9A441', '#6B6F78'];
  let cars = [], lastT = 0, clock = 0;
  const XW = [...ORDER.map((id) => [BLD[id].door - 60, BLD[id].door + 60, 800 + DY, 1060 + DY]), [1100, 1220, 700 + DY, 780 + DY]];   // crosswalk zones [x0, x1, y0, y1]
  // a car is drawn as a small isometric box (stacked slices in grid space), so it looks right at any heading
  const carSvg = (c) => { const sl = (L, W, z0, z1, side, top, o) => { let s = ''; for (let z = z0; z < z1; z += 3) s += `<rect x="${-L / 2 + o}" y="${-W / 2}" width="${L}" height="${W}" transform="translate(0 ${-z})" fill="${side}"/>`; return s + `<rect x="${-L / 2 + o}" y="${-W / 2}" width="${L}" height="${W}" transform="translate(0 ${-z1})" fill="${top}"/>`; };
    return `<rect x="-44" y="-20" width="88" height="40" fill="#000" opacity=".25"/>${sl(76, 34, 4, 14, c, c, 0)}${sl(36, 30, 14, 24, '#9DBFD4', '#C7DFEC', -4)}<rect x="34" y="-12" width="5" height="6" fill="#FFE7A6" transform="translate(0 -9)"/><rect x="-40" y="-12" width="5" height="6" fill="#D0392B" transform="translate(0 -9)"/>`; };
  // route geometry: points along the polyline, corners rounded
  function lane(r) { const pts = []; for (let i = 0; i < r.length - 1; i++) { const a = r[i], b = r[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 20)); for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } pts.push(r[r.length - 1]);
    for (let it = 0; it < 3; it++) for (let i = 1; i < pts.length - 1; i++) pts[i] = [(pts[i - 1][0] + pts[i][0] * 2 + pts[i + 1][0]) / 4, (pts[i - 1][1] + pts[i][1] * 2 + pts[i + 1][1]) / 4];
    const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, acc, len: acc[acc.length - 1] }; }
  function laneAt(L, s) { let i = 1; while (i < L.acc.length - 1 && L.acc[i] < s) i++; const t = (s - L.acc[i - 1]) / Math.max(1e-6, L.acc[i] - L.acc[i - 1]), a = L.pts[i - 1], b = L.pts[i]; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }; }
  // main road green 9 s, then the side street green 7 s (1 s all-red between)
  const lightEW = () => ((clock % 18) < 9 ? 'g' : 'r');
  const lightNS = () => { const t = clock % 18; return t >= 10 && t < 17 ? 'g' : 'r'; };
  function mkCars() {
    const g = $('#vc-cars', st.svg); if (!g) return; cars = []; let ci = 0;
    ROUTES.map(lane).forEach((L, ri) => { const n = ri < 2 || ri === 4 ? 1 : 2; for (let k = 0; k < n; k++) { const el = document.createElementNS(NS, 'g'); el.innerHTML = `<g>${carSvg(CAR_COL[ci++ % CAR_COL.length])}</g>`; g.appendChild(el);
      cars.push({ L, s: ((k + 0.3 * ri) * L.len / (n + 0.6)) % L.len, v: 0, vmax: 95 + (ci * 17) % 40, el, in: el.firstChild }); } });
  }
  function carStep(dt) {
    const lg = lightEW(), ln = lightNS(), peds = st.peds || [];
    for (const c of cars) { const p = laneAt(c.L, c.s), dx = Math.cos(p.ang), dy = Math.sin(p.ang); let target = c.vmax;
      if (Math.abs(laneAt(c.L, Math.min(c.L.len, c.s + 40)).ang - p.ang) > 0.15) target = Math.min(target, 45);   // slow into a turn
      // lights: the stop line is just before the junction box (x 1100..1220, y between the two lanes' outer edges)
      const ew = Math.abs(dx) > 0.7, inBand = p.y > YW - 60 && p.y < YE + 60, dist = ew ? (dx > 0 ? 1100 - p.x : p.x - 1220) : (dy > 0 ? YW - 60 - p.y : p.y - (YE + 60));
      if ((ew ? inBand : p.x > 1080 && p.x < 1240) && dist > -4 && dist < 100 && (ew ? lg : ln) !== 'g') target = Math.min(target, Math.max(0, (dist - 8) * 1.2));
      for (const o of cars) { if (o === c) continue; const q = laneAt(o.L, o.s), rx = q.x - p.x, ry = q.y - p.y, d = Math.hypot(rx, ry); if (d > 130 || d < 1) continue; if ((rx * dx + ry * dy) / d > 0.75) target = Math.min(target, Math.max(0, (d - 84) * 1.4)); }
      for (const a of peds) { const rx = a[0] - p.x, ry = a[1] - p.y, d = Math.hypot(rx, ry), ah = rx * dx + ry * dy, lat = Math.abs(rx * -dy + ry * dx);   // a person in the car's lane ahead (corridor 36 wide) or very close in any direction: stop
        if ((ah > -10 && ah < 150 && lat < 36) || d < 52) target = Math.min(target, Math.max(0, (ah - 52) * 1.5)); }
      // crossings: if anyone is on (or about to step onto) a crosswalk, the car holds at its edge
      for (const z of XW) { if (!peds.some((q) => q[0] > z[0] - 40 && q[0] < z[1] + 40 && q[1] > z[2] - 50 && q[1] < z[3] + 50)) continue; const dist = Math.abs(dx) > 0.7 ? (dx > 0 ? z[0] - p.x : p.x - z[1]) : (dy > 0 ? z[2] - p.y : p.y - z[3]);
        if (dist > -6 && dist < 140 && (Math.abs(dx) > 0.7 ? p.y > z[2] - 60 && p.y < z[3] + 60 : p.x > z[0] - 60 && p.x < z[1] + 60)) target = Math.min(target, Math.max(0, (dist - 28) * 1.5)); }
      c.v += Math.max(-220 * dt, Math.min(60 * dt, target - c.v)); if (c.v < 0) c.v = 0; c.s += c.v * dt; if (c.s >= c.L.len) { c.s = 0; c.v = Math.min(c.v, 40); }
      const q = laneAt(c.L, c.s), sp = P(q.x, q.y), fade = Math.min(1, c.s / 60, (c.L.len - c.s) / 60);
      c.el.setAttribute('transform', `translate(${sp[0].toFixed(1)} ${sp[1].toFixed(1)})`); c.el.setAttribute('opacity', Math.max(0, fade).toFixed(2));
      c.in.setAttribute('transform', `matrix(${K} .5 ${-K} .5 0 0) rotate(${(q.ang * 180 / Math.PI).toFixed(1)}) scale(.8)`); }
  }
  function tick(t) { requestAnimationFrame(tick); watchTick(t); const dt = Math.min(0.1, lastT ? (t - lastT) / 1000 : 0.016); lastT = t; if (document.hidden) return; clock += dt; carStep(dt); }
  function mount(H) {
    st.H = H; st.stage = H.stage; const old = st.stage.querySelector('#vc-root'); if (old) old.remove();
    const wrap = document.createElement('div'); wrap.id = 'vc-root'; wrap.className = 'vc'; st.stage.appendChild(wrap); st.root = wrap;
    st.svg = document.createElementNS(NS, 'svg'); st.svg.setAttribute('id', 'vc-svg'); st.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); st.svg.setAttribute('aria-label', 'V Agent City: Marketing Headquarters, Web Builder and Sniper Client');
    wrap.appendChild(st.svg); st.svg.innerHTML = drawAll(); document.body.classList.add('city-on');
    const sc0 = document.getElementById('scene'); if (sc0) { park().appendChild(sc0); st.scene = sc0; }   // the original office lives inside the city svg from the start (parked until a floor opens)
    bindCamera(); mountUI(); st.view = 'city'; setMode(); frame(false); renderUI(); paintLights(); mkCars(); requestAnimationFrame(tick);
  }
  // camera helper for office.js: centre the open floor's camera on a point of the office (office screen coordinates)
  function focusScene(sx, sy) { const t = tileRect(st.b, st.n), w = Math.min(st.vb.w, t.w * 0.45), h = w * st.vb.h / st.vb.w, X = t.x + M * (sx - st.vb0.x), Y = t.y + M * (sy - st.vb0.y) - 20;
    if (st.cam) st.cam.kill(); const to = { x: X - w / 2, y: Y - h / 2, w, h }; if (window.gsap) st.cam = gsap.to(st.vb, { ...to, duration: 0.7, ease: 'power2.inOut', onUpdate: setVB }); else { Object.assign(st.vb, to); setVB(); } }
  window.VCity = { mount, update, floorCtx, locate, enter: enterFloor, view: () => st.view, st, BLD, ORDER, assign, showCity, showBuilding, changeFloor, nav: cityNav, doorPt, streetDraw, watch, tile, focusScene };
})();
