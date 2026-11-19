// V Agent City art kit — procedural isometric SVG components (low-poly look): towers with patterned facades, roofs, trees, roads, markings, vehicles, traffic lights, shadows.  window.VCityKit
// Pure drawing: it returns SVG strings in the city's grid coordinates (same projection as city.js: screen = ((x-y)*0.866, (x+y)/2 - z)). No data, no interaction.
(function () {
  'use strict';
  const K = 0.866;
  const C = { W: 3600, D: 2556, DY: 556, FH: 130, BLD: {} };   // overwritten by init()
  const P = (gx, gy, z) => [(gx - gy) * K, (gx + gy) * 0.5 - (z || 0)];
  const pt = (gx, gy, z) => P(gx, gy, z).map((n) => n.toFixed(1)).join(',');
  const poly = (a, fill, ex) => `<polygon points="${a.map((q) => pt(q[0], q[1], q[2])).join(' ')}" fill="${fill}" ${ex || ''}/>`;
  const quad = (a, b, c, d, fill, ex) => poly([a, b, c, d], fill, ex);
  const flat = (x0, y0, x1, y1, fill, ex) => quad([x0, y0], [x1, y0], [x1, y1], [x0, y1], fill, ex);
  const line = (ax, ay, bx, by, col, w, dash, z) => `<polyline points="${pt(ax, ay, z)} ${pt(bx, by, z)}" stroke="${col}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''} fill="none"/>`;
  const plane = (gx, gy, z) => { const o = P(gx, gy, z || 0); return `translate(${o[0].toFixed(1)} ${o[1].toFixed(1)})`; };
  const SOUTH = (x, y, w, d) => `<g transform="${plane(x, y + d)} matrix(${K} .5 0 1 0 0)">`;
  const EAST = (x, y, w, d) => `<g transform="${plane(x + w, y)} matrix(${-K} .5 0 1 0 0)">`;
  const shade = (hex, k) => '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.substr(i, 2), 16) * k))).toString(16).padStart(2, '0')).join('');
  const FHP = 26;   // facade pattern height = one band; a functional floor (130) is exactly 5 bands

  // ---------- facade styles (south = lit side, east = shaded side) ----------
  const STY = {
    orange: { w: 26, c: ['#7CC0EE', '#3E8FD0', '#1F4C78', '#EE7B22', '#F9AA5C'], tile: (c) => `<rect width="26" height="26" fill="${c[1]}"/><rect width="26" height="6" fill="${c[0]}"/><rect y="13" width="26" height="1.2" fill="${c[2]}"/><rect y="14" width="26" height="12" fill="${c[3]}"/><rect y="14" width="26" height="3" fill="${c[4]}"/><rect x="25" width="1" height="17" fill="${c[2]}" opacity=".45"/>` },
    blue: { w: 22, c: ['#3C6FD6', '#79A7F2', '#2B4FA8'], tile: (c) => `<rect width="22" height="26" fill="${c[0]}"/><rect x="15" width="4" height="26" fill="${c[1]}"/><rect x="5" width="1.2" height="26" fill="${c[2]}" opacity=".5"/><rect y="25" width="22" height="1" fill="${c[2]}"/>` },
    cyan: { w: 26, c: ['#58C8E0', '#9BE3F2', '#B53BAA'], tile: (c) => `<rect width="26" height="26" fill="${c[0]}"/><rect width="2" height="26" fill="${c[1]}"/><rect x="13" width="1" height="26" fill="${c[1]}" opacity=".5"/><rect y="24.6" width="26" height="1.4" fill="${c[2]}"/>` },
    red: { w: 22, c: ['#D81E3E', '#EF4E66', '#A5122C'], tile: (c) => `<rect width="22" height="26" fill="${c[0]}"/><rect x="9" width="2.4" height="26" fill="${c[1]}"/><rect y="25" width="22" height="1" fill="${c[2]}"/>` },
    teal: { w: 26, c: ['#3F9FB8', '#7FD0E0', '#1F6A82', '#F08A3C'], tile: (c) => `<rect width="26" height="26" fill="${c[0]}"/><rect y="0" width="26" height="6" fill="${c[1]}" opacity=".5"/><rect y="24.5" width="26" height="1.5" fill="${c[2]}"/><rect x="25" width="1" height="26" fill="${c[2]}" opacity=".4"/>` },
  };
  function defs() {
    let s = '<defs>';
    for (const [k, v] of Object.entries(STY)) {
      s += `<pattern id="kps-${k}" width="${v.w}" height="${FHP}" patternUnits="userSpaceOnUse">${v.tile(v.c)}</pattern>`;
      s += `<pattern id="kpe-${k}" width="${v.w}" height="${FHP}" patternUnits="userSpaceOnUse">${v.tile(v.c.map((q) => shade(q, 0.68)))}</pattern>`;
    }
    s += `<pattern id="k-asph" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="60" fill="#3B3A3F"/><circle cx="8" cy="12" r="1.3" fill="#4A4A50"/><circle cx="40" cy="22" r="1.5" fill="#2F2E33"/><circle cx="22" cy="46" r="1.2" fill="#4A4A50"/><circle cx="52" cy="50" r="1.4" fill="#2F2E33"/></pattern>
      <pattern id="k-pave" width="44" height="26" patternUnits="userSpaceOnUse"><rect width="44" height="26" fill="#EAE1CA"/><path d="M0 .5h44M0 13.5h44M22 .5v13M0 13.5v0M11 13.5v12.5M33 13.5v12.5" stroke="#D9CFB4" stroke-width="1" fill="none"/></pattern>
      <pattern id="k-grass" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" fill="#79D66A"/><circle cx="9" cy="14" r="3" fill="#6BCB5C"/><circle cx="34" cy="30" r="3.4" fill="#8BE27C"/><circle cx="20" cy="40" r="2.6" fill="#6BCB5C"/><circle cx="42" cy="8" r="2" fill="#8BE27C"/></pattern>
      <linearGradient id="k-ao" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".36"/></linearGradient>
      <linearGradient id="k-sun" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0C4" stop-opacity=".28"/><stop offset=".5" stop-color="#FFF0C4" stop-opacity="0"/><stop offset="1" stop-color="#2B1F4A" stop-opacity=".16"/></linearGradient>
      <radialGradient id="vc-pool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE7A6" stop-opacity=".55"/><stop offset="1" stop-color="#FFE7A6" stop-opacity="0"/></radialGradient>
    </defs>`;
    return s;
  }

  // ---------- small solids ----------
  function box(x, y, w, d, z, h, top, left, right) {   // left = south face, right = east face
    return quad([x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h], left) + quad([x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h], right) + quad([x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h], top);
  }
  function hull(pts) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of pts.slice().reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  // long hard cast shadow on the ground: the sun is high in the north-east, so shadows fall to the south-west (screen: left and down)
  function shadowOf(x, y, w, d, h, id) {
    const sx = 0.3 * h, sy = 1.0 * h, pts = [[x, y], [x + w, y], [x + w, y + d], [x, y + d]]; const all = pts.concat(pts.map((p) => [p[0] + sx, p[1] + sy])).map((p) => P(p[0], p[1]));
    return `<polygon class="vc-shd" ${id ? `data-b="${id}"` : ''} points="${hull(all).map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="#0E0B18" opacity=".5"/>`;
  }

  // ---------- facades + roofs ----------
  function faces(x, y, w, d, z0, z1, st, lit, ao) {
    const hh = z1 - z0;
    return `${SOUTH(x, y, w, d)}<rect x="0" y="${-z1}" width="${w}" height="${hh}" fill="url(#kps-${st})"/>${lit ? `<rect class="vc-win" data-b="${lit.b}" data-f="${lit.f}" x="0" y="${-z1}" width="${w}" height="${hh}" fill="#FFD27A" fill-opacity="0"/>` : ''}<rect x="${w - 3}" y="${-z1}" width="3" height="${hh}" fill="#fff" opacity=".18"/>${ao ? `<rect x="0" y="${-z1}" width="${w}" height="${hh}" fill="url(#k-ao)"/>` : ''}</g>${EAST(x, y, w, d)}<rect x="0" y="${-z1}" width="${d}" height="${hh}" fill="url(#kpe-${st})"/>${ao ? `<rect x="0" y="${-z1}" width="${d}" height="${hh}" fill="url(#k-ao)"/>` : ''}<rect x="0" y="${-z1}" width="2.5" height="${hh}" fill="#000" opacity=".22"/></g>`;
  }
  function roof(x, y, w, d, h, edge, seed) {
    const e = edge || '#6E6D73, #3A3940'.split(',')[0].trim(), dark = shade(e, 0.6);
    let s = quad([x, y + d, h - 9], [x + w, y + d, h - 9], [x + w, y + d, h + 1], [x, y + d, h + 1], dark) + quad([x + w, y, h - 9], [x + w, y + d, h - 9], [x + w, y + d, h + 1], [x + w, y, h + 1], shade(e, 0.45));
    s += quad([x - 4, y - 4, h + 1], [x + w + 4, y - 4, h + 1], [x + w + 4, y + d + 4, h + 1], [x - 4, y + d + 4, h + 1], e);
    s += quad([x + 9, y + 9, h + 1.5], [x + w - 9, y + 9, h + 1.5], [x + w - 9, y + d - 9, h + 1.5], [x + 9, y + d - 9, h + 1.5], '#55545B');
    const px = x + w * 0.27, py = y + d * 0.27, pw = w * 0.46, pd = d * 0.4;
    s += box(px, py, pw, pd, h + 1.5, 5, '#F4F2EA', '#C9C7BE', '#A8A69E');   // white roof panel
    s += box(x + w * 0.12, y + d * 0.72, Math.min(36, w * 0.14), 18, h + 1.5, 14, '#B7B8BE', '#8E9097', '#6F7178');   // AC unit
    s += box(x + w * 0.7, y + d * 0.76, Math.min(30, w * 0.12), 16, h + 1.5, 10, '#B7B8BE', '#8E9097', '#6F7178');
    const a = P(x + w * 0.8, y + d * 0.18, h + 1.5), a2 = P(x + w * 0.8, y + d * 0.18, h + 1.5 + 34 + ((seed || 0) % 3) * 12);
    s += `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${a2[0].toFixed(1)}" y2="${a2[1].toFixed(1)}" stroke="#2B2A30" stroke-width="3"/><circle cx="${a2[0].toFixed(1)}" cy="${a2[1].toFixed(1)}" r="3" fill="#E24B3B"/>`;
    return s;
  }
  // stepped crown on a department building's roof: a smaller block in the accent colour, a white panel and rooftop machinery
  function crown(x, y, w, d, h, edge) {
    const cx = x + w * 0.3, cy = y + d * 0.34, cw = w * 0.4, cd = d * 0.3, ch = 78;
    return box(cx, cy, cw, cd, h + 1.5, ch, '#5A5961', edge, shade(edge, 0.68)) + quad([cx - 4, cy - 4, h + 1.5 + ch], [cx + cw + 4, cy - 4, h + 1.5 + ch], [cx + cw + 4, cy + cd + 4, h + 1.5 + ch], [cx - 4, cy + cd + 4, h + 1.5 + ch], '#6B6A72') + box(cx + cw * 0.25, cy + cd * 0.25, cw * 0.5, cd * 0.45, h + 1.5 + ch + 0.5, 4, '#F4F2EA', '#C9C7BE', '#A8A69E') + box(cx + cw * 0.1, cy + cd * 0.7, 34, 16, h + 1.5 + ch + 0.5, 12, '#B7B8BE', '#8E9097', '#6F7178') + box(x + w * 0.62, y + d * 0.68, 40, 20, h + 1.5, 24, '#B7B8BE', '#8E9097', '#6F7178') + box(x + w * 0.16, y + d * 0.2, 28, 28, h + 1.5, 18, '#9AA0A8', '#7B818A', '#5E646C');
  }
  // decorative tower: not interactive, no data. o = { x, y, w, d, n (bands), st, edge, up: { n, inset } }
  function tower(o) {
    const { x, y, w, d } = o, h1 = o.n * FHP; let s = faces(x, y, w, d, 0, h1, o.st, null, true);
    if (o.up) { const i = o.up.inset, ux = x + w * i, uy = y + d * i, uw = w * (1 - 2 * i), ud = d * (1 - 2 * i), h2 = h1 + o.up.n * FHP;
      s += quad([x, y, h1], [x + w, y, h1], [x + w, y + d, h1], [x, y + d, h1], '#5A5961') + faces(ux, uy, uw, ud, h1, h2, o.up.st || o.st, null, true) + roof(ux, uy, uw, ud, h2, o.edge, o.seed); return { h: s, bbox: [x, y, x + w, y + d], top: h2 }; }
    return { h: s + roof(x, y, w, d, h1, o.edge, o.seed), bbox: [x, y, x + w, y + d], top: h1 };
  }

  // ---------- plants ----------
  function conifer(x, y, s) {
    s = s || 1; const o = P(x, y); let g = `<g transform="translate(${o[0].toFixed(1)} ${o[1].toFixed(1)}) scale(${s})"><ellipse cx="9" cy="3" rx="16" ry="6" fill="#17141F" opacity=".28"/><rect x="-2.5" y="-14" width="5" height="16" fill="#7A5230"/>`;
    [[26, 0, '#3DBB55', '#27933F'], [21, -22, '#47C75E', '#2B9B43'], [15, -42, '#55D26A', '#33A64B']].forEach(([wd, by, l, r]) => { g += `<polygon points="0,${by - 38} ${-wd},${by - 8} 0,${by - 3}" fill="${l}"/><polygon points="0,${by - 38} ${wd},${by - 8} 0,${by - 3}" fill="${r}"/>`; });
    return g + '</g>';
  }
  function roundTree(x, y, s) {
    s = s || 1; const o = P(x, y);
    return `<g transform="translate(${o[0].toFixed(1)} ${o[1].toFixed(1)}) scale(${s})"><ellipse cx="9" cy="3" rx="18" ry="7" fill="#17141F" opacity=".28"/><rect x="-2.5" y="-30" width="5" height="32" fill="#7A5230"/><polygon points="-22,-50 -10,-76 10,-78 24,-54 12,-34 -12,-34" fill="#6FD35A"/><polygon points="0,-78 10,-78 24,-54 12,-34 0,-34" fill="#4DB04A"/><polygon points="-12,-62 -2,-76 8,-70 2,-56" fill="#92E878"/></g>`;
  }
  const bush = (x, y) => { const o = P(x, y); return `<g transform="translate(${o[0].toFixed(1)} ${o[1].toFixed(1)})"><ellipse cx="3" cy="1" rx="10" ry="4" fill="#17141F" opacity=".25"/><polygon points="-9,0 -6,-9 3,-11 9,-4 8,0" fill="#5BC456"/><polygon points="3,-11 9,-4 8,0 0,0" fill="#3FA444"/></g>`; };
  const bench = (x, y) => box(x - 14, y - 4, 28, 8, 0, 8, '#9A6B3F', '#7C522E', '#5E3E22') + box(x - 14, y - 6, 28, 2, 8, 10, '#A8764A', '#7C522E', '#5E3E22');
  const lamp = (x, y) => { const o = P(x, y); return `<g transform="translate(${o[0].toFixed(1)} ${o[1].toFixed(1)})"><ellipse cx="0" cy="0" rx="40" ry="15" fill="url(#vc-pool)" class="vc-lamp"/><rect x="-2" y="-96" width="4" height="96" fill="#3B3F47"/><path d="M0 -96 q18 0 22 11" stroke="#3B3F47" stroke-width="3.5" fill="none"/><ellipse cx="22" cy="-84" rx="8" ry="3.5" fill="#FFE7A6"/></g>`; };
  const bollard = (x, y) => { const o = P(x, y); return `<g transform="translate(${o[0].toFixed(1)} ${o[1].toFixed(1)})"><rect x="-1.5" y="-14" width="3" height="14" fill="#3B3F47"/><circle cx="0" cy="-16" r="3" fill="#FFF6D8"/></g>`; };
  // traffic light on a pole at (x, y); ax = 'ew' | 'ns'
  const signal = (x, y, ax) => { const o = P(x, y); return `<g class="kt-sig" data-ax="${ax}" transform="translate(${o[0].toFixed(1)} ${o[1].toFixed(1)})"><ellipse cx="2" cy="1" rx="6" ry="2.5" fill="#17141F" opacity=".3"/><rect x="-1.5" y="-70" width="3" height="70" fill="#34363D"/><rect x="-6" y="-92" width="12" height="26" rx="2.5" fill="#1F2026"/><circle class="kr" cx="0" cy="-86" r="3.4" fill="#E24B3B"/><circle class="ky" cx="0" cy="-79" r="3.4" fill="#F2C230" opacity=".25"/><circle class="kg" cx="0" cy="-72" r="3.4" fill="#3FD07A" opacity=".25"/></g>`; };
  function setSignals(root, ew, ns) {
    root.querySelectorAll('.kt-sig').forEach((g) => { const s = g.dataset.ax === 'ew' ? ew : ns; g.querySelector('.kr').setAttribute('opacity', s === 'r' ? 1 : 0.2); g.querySelector('.ky').setAttribute('opacity', s === 'y' ? 1 : 0.2); g.querySelector('.kg').setAttribute('opacity', s === 'g' ? 1 : 0.2); });
  }

  // ---------- vehicles: real low-poly 3D models, projected per heading (true isometric, same axes as the city) ----------
  // A model is built once per type (lofted body + cabin, bumpers, lights, mirrors, wheels). Each frame a car only re-projects when its heading bucket (3 degrees) changes:
  // faces are rotated, back-face culled (visible when normal . (1,1,1) > 0), painter-sorted and shaded from the same light as the buildings. Straight travel never re-renders.
  const VEH = { sedan: 76, suv: 78, compact: 58, van: 92, pickup: 82, taxi: 76 };
  const SC = 0.8, HB = 120;   // model scale in the world, heading buckets per turn
  // body sections [x, zBottom, zTop, halfWidth]; cabin sections [x, zBase, zTop, halfWidthBase, halfWidthTop]
  const MODELS = {
    sedan: { L: 76, hw: 15, r: 7.5, wx: [-24, 25], body: [[-38, 7, 13, 13], [-36, 5, 15, 14.6], [-24, 4.6, 17, 15], [0, 4.6, 16.5, 15], [20, 4.6, 15.8, 15], [32, 4.6, 14.6, 14.6], [37, 5.6, 12.5, 13.6], [38, 7.5, 10.5, 12.6]],
      cab: [[-22, 17, 19.5, 13.4, 12.2], [-14, 17, 26, 13.6, 11.4], [2, 16.3, 26, 13.6, 11.4], [15, 15.4, 17, 13.2, 12.4]], pillar: [-6], mirror: 9 },
    suv: { L: 78, hw: 16.5, r: 8.6, wx: [-24, 26], body: [[-39, 8, 19, 15], [-37, 6.5, 21, 16.3], [-20, 6.5, 22, 16.5], [10, 6.5, 21, 16.5], [26, 6.5, 19.5, 16.2], [35, 7, 17, 15.5], [39, 8.5, 13, 14.5]],
      cab: [[-35, 21.5, 25, 15.2, 13.8], [-33.5, 21.2, 32.5, 15.6, 13.4], [6, 21, 32.5, 15.6, 13.4], [22, 19.8, 22.5, 15.2, 14.6]], pillar: [-14, 0], mirror: 12, rails: true },
    compact: { L: 58, hw: 13.5, r: 6.8, wx: [-17, 18], body: [[-29, 6, 13.5, 12], [-27, 4.6, 16, 13.2], [-12, 4.6, 17.5, 13.5], [12, 4.6, 16.5, 13.5], [22, 4.6, 14.5, 13.2], [28, 5.8, 12, 12.4], [29, 7.5, 10.5, 11.5]],
      cab: [[-25, 17, 22, 12.4, 11.6], [-23.5, 16.8, 27, 12.8, 10.8], [2, 16.4, 27, 12.8, 10.8], [14, 15, 17, 12.4, 11.8]], pillar: [-8], mirror: 6 },
    van: { L: 92, hw: 18, r: 8.8, wx: [-28, 28], body: [[-46, 8, 22, 16.5], [-45, 6, 24, 18], [20, 6, 24, 18], [34, 6, 22, 17.5], [44, 6.5, 17, 16.5], [46, 8, 13, 15.5]],
      cab: [[15, 24, 38, 17.4, 15], [17, 24, 38.6, 17.4, 15], [33, 22.5, 24.5, 17.2, 16.4]], cargo: [[-46, 22, 40.5, 17.4], [-45.5, 22, 41, 17.6], [14, 22, 41, 17.6], [14.5, 22, 40.5, 17.4]], mirror: 22, white: true },
    pickup: { L: 82, hw: 16, r: 8, wx: [-26, 27], body: [[-41, 8, 18, 15], [-40, 6, 19.5, 16], [-5, 6, 19.5, 16], [2, 6, 19, 16], [10, 6, 18, 16], [30, 6, 17, 16], [38, 6.5, 14.5, 15.2], [41, 8, 12, 14]],
      cab: [[-4, 20, 24, 14.6, 13.2], [-1, 19.8, 32, 15, 12.6], [14, 19, 32, 15, 12.6], [24, 18, 21, 14.8, 14]], bed: [-41, -6], mirror: 10 },
  };
  const ROLE = { trim: '#202228', glass: '#233140', light: '#FFF1B8', tail: '#C9252D', rim: '#D3D7DE', tire: '#15161A', chrome: '#B9BEC6', white: '#F3F3EE', sign: '#FFF3B0', dark: '#17181C', bedf: '#3B3D44' };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nrm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const mean = (pts) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
  function face(p, role, center, nOv, bias) {   // outward normal from the winding, oriented away from the piece centre
    let n = nOv; if (!n) { n = nrm(crs(sub(p[1], p[0]), sub(p[2], p[0]))); const c = mean(p); if (n[0] * (c[0] - center[0]) + n[1] * (c[1] - center[1]) + n[2] * (c[2] - center[2]) < 0) n = [-n[0], -n[1], -n[2]]; }
    return { p, n, role, bias: bias || 0 };
  }
  function loft(rings, roles, caps) {
    const all = rings.flat(), center = mean(all), out = [];
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < rings[i].length - 1; j++) out.push(face([rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]], roles[j], center));
    if (caps) { out.push(face(rings[0].slice(), caps[0], center)); out.push(face(rings[rings.length - 1].slice().reverse(), caps[1], center)); }
    return out;
  }
  const ring8 = ([x, zb, zt, hw]) => { const zs = zb + (zt - zb) * 0.62; return [[x, -hw, zb], [x, -hw, zb + 3], [x, -hw, zs], [x, -hw * 0.9, zt], [x, hw * 0.9, zt], [x, hw, zs], [x, hw, zb + 3], [x, hw, zb]]; };
  const ringCab = ([x, zb, zt, hb, ht]) => [[x, -hb, zb], [x, -ht, zt], [x, ht, zt], [x, hb, zb]];
  function boxFaces(x0, x1, y0, y1, z0, z1, role, bias) {
    const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], V = (x, y, z) => [x, y, z];
    return [face([V(x0, y1, z0), V(x1, y1, z0), V(x1, y1, z1), V(x0, y1, z1)], role, c, [0, 1, 0], bias), face([V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), V(x1, y0, z1)], role, c, [1, 0, 0], bias),
      face([V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1)], role, c, [0, 0, 1], bias), face([V(x0, y0, z0), V(x0, y1, z0), V(x0, y1, z1), V(x0, y0, z1)], role, c, [-1, 0, 0], bias), face([V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1)], role, c, [0, -1, 0], bias)];
  }
  const _mesh = {};
  function meshOf(kind) {
    if (_mesh[kind]) return _mesh[kind]; const M = MODELS[kind === 'taxi' ? 'sedan' : kind], F = [], L2 = M.L / 2, hw = M.hw;
    const bodyRings = M.body.map(ring8), roles = ['trim', 'body', 'body', 'body', 'body', 'body', 'trim'];
    F.push(...loft(bodyRings, roles, ['body', 'body']));
    if (M.cargo) F.push(...loft(M.cargo.map(ring8), ['white', 'white', 'white', 'white', 'white', 'white', 'white'], ['white', 'white']));
    const cab = loft(M.cab.map(ringCab), ['glass', 'roof', 'glass'], ['glass', 'glass']); F.push(...cab);
    // pillars: body-coloured strips across the side glass; door seams on the lower side
    const cz0 = M.cab[1][1], cz1 = M.cab[1][2], hb = M.cab[1][3], ht = M.cab[1][4];
    for (const px of M.pillar || []) for (const s of [-1, 1]) F.push(face([[px - 1.3, s * (hb + 0.1), cz0], [px + 1.3, s * (hb + 0.1), cz0], [px + 1.3, s * (ht + 0.1), cz1], [px - 1.3, s * (ht + 0.1), cz1]], 'body', [0, 0, 0], [0, s, 0], 3));
    const zt0 = M.body[3][2], zb0 = M.body[3][1];
    for (const s of [-1, 1]) for (const dx of M.cargo ? [] : [-10, 8]) F.push(face([[dx - 0.35, s * (hw + 0.12), zb0 + 4], [dx + 0.35, s * (hw + 0.12), zb0 + 4], [dx + 0.35, s * (hw + 0.12), zt0 - 2], [dx - 0.35, s * (hw + 0.12), zt0 - 2]], 'trim', [0, 0, 0], [0, s, 0], 3));
    // bumpers, lights, grille, plates
    const fz = M.body[M.body.length - 1], rz = M.body[0], fhw = fz[3], rhw = rz[3];
    F.push(...boxFaces(L2 - 2.4, L2 + 0.8, -fhw - 0.4, fhw + 0.4, fz[1] - 1.2, fz[1] + 4.2, 'trim', 4), ...boxFaces(-L2 - 0.8, -L2 + 2.4, -rhw - 0.4, rhw + 0.4, rz[1] - 1.2, rz[1] + 4.2, 'trim', 4));
    for (const s of [-1, 1]) { const a = fhw - 2, b = fhw - 8; F.push(...boxFaces(L2 - 4.5, L2 + 0.5, Math.min(s * a, s * b), Math.max(s * a, s * b), fz[2] - 5.5, fz[2] - 1.8, 'light', 5), ...boxFaces(-L2 - 0.5, -L2 + 3.2, Math.min(s * (rhw - 2), s * (rhw - 8)), Math.max(s * (rhw - 2), s * (rhw - 8)), rz[2] - 5, rz[2] - 1.6, 'tail', 5)); }
    F.push(...boxFaces(L2 - 3.2, L2 + 0.7, -4.5, 4.5, fz[1] + 2.5, fz[1] + 6, 'dark', 5), ...boxFaces(-L2 - 0.8, -L2 + 1.2, -3.5, 3.5, rz[1] + 1.6, rz[1] + 4.6, 'white', 5));
    // mirrors
    const mx = M.mirror, mz = M.cab[1][1] + 1.6; for (const s of [-1, 1]) F.push(...boxFaces(mx - 1.6, mx + 1.6, Math.min(s * (hb + 0.2), s * (hb + 3.2)), Math.max(s * (hb + 0.2), s * (hb + 3.2)), mz, mz + 3, 'body', 6));
    if (M.rails) for (const s of [-1, 1]) F.push(...boxFaces(-26, 8, s * (ht - 0.6) - 0.6, s * (ht - 0.6) + 0.6, cz1, cz1 + 1.8, 'chrome', 4));
    if (M.bed) { const [b0, b1] = M.bed, bz = M.body[1][2]; for (const s of [-1, 1]) F.push(...boxFaces(b0, b1, Math.min(s * (hw - 0.4), s * (hw - 1.8)), Math.max(s * (hw - 0.4), s * (hw - 1.8)), bz, bz + 7, 'body', 3)); F.push(...boxFaces(b0, b0 + 1.4, -hw + 0.4, hw - 0.4, bz, bz + 7, 'body', 3), ...boxFaces(b1 - 1.2, b1, -hw + 0.4, hw - 0.4, bz, bz + 7, 'body', 3), ...boxFaces(b0 + 1.4, b1 - 1.2, -hw + 1.8, hw - 1.8, bz - 0.2, bz + 0.6, 'bedf', 2)); }
    if (kind === 'taxi') F.push(...boxFaces(-5, 5, -4.5, 4.5, M.cab[1][2], M.cab[1][2] + 4, 'sign', 4));
    return (_mesh[kind] = { F, M });
  }
  const _vcache = new Map();
  // the SVG for one vehicle (screen coordinates around its ground point), for a heading in radians; cached per type / colour / heading bucket
  function vehicleAt(kind, col, ang) {
    const b = ((Math.round(ang / (Math.PI * 2) * HB) % HB) + HB) % HB, key = kind + col + b; let hit = _vcache.get(key); if (hit) return hit;
    const { F, M } = meshOf(kind), th = b / HB * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), roof = shade(col, 1.07), cols = { body: col, roof };
    const rot = (p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]], proj = (p) => [((p[0] - p[1]) * K * SC).toFixed(1), (((p[0] + p[1]) / 2 - p[2]) * SC).toFixed(1)].join(',');
    const lit = (n) => 0.5 + 0.32 * Math.max(0, n[2]) + 0.42 * Math.max(0, n[1]) + 0.08 * Math.max(0, n[0]);
    const R = []; const pushFace = (f, extraBias) => { const nr = rot(f.n); if (nr[0] + nr[1] + nr[2] <= 0.02) return; const pr = f.p.map(rot), ce = mean(pr); R.push({ d: ce[0] + ce[1] + ce[2] + f.bias + (extraBias || 0), pr, nr, role: f.role }); };
    F.forEach((f) => pushFace(f));
    // near-side wheels: arch + tyre + rim + hub, drawn on the visible flank
    const side = (c - s) >= 0 ? 1 : -1, hw = M.hw;
    for (const wx of M.wx) { const wz = M.r, ring = (rad, y) => Array.from({ length: 14 }, (_, i) => [wx + Math.cos(i / 14 * Math.PI * 2) * rad, y, wz + Math.sin(i / 14 * Math.PI * 2) * rad]), nn = [0, side, 0];
      pushFace({ p: ring(M.r + 2.4, side * (hw + 0.15)), n: nn, role: 'dark', bias: 40 }); pushFace({ p: ring(M.r, side * (hw + 0.25)), n: nn, role: 'tire', bias: 41 }); pushFace({ p: ring(M.r * 0.62, side * (hw + 0.35)), n: nn, role: 'rim', bias: 42 }); pushFace({ p: ring(M.r * 0.22, side * (hw + 0.45)), n: nn, role: 'chrome', bias: 43 }); }
    R.sort((a, b2) => a.d - b2.d);
    let out = '';
    const fp = (x0, x1, y0, y1, dx, dy) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => proj(rot([x + dx, y + dy, 0]))).join(' ');
    out += `<polygon points="${fp(-M.L / 2 - 3, M.L / 2 + 3, -M.hw - 2, M.hw + 2, 3, 4)}" fill="#0E0B18" opacity=".28"/><polygon points="${fp(-M.L / 2 + 1, M.L / 2 - 1, -M.hw + 0.5, M.hw - 0.5, 0.5, 0.8)}" fill="#0E0B18" opacity=".45"/>`;
    for (const r of R) {
      const base = cols[r.role] || ROLE[r.role] || col, k = r.role === 'light' ? 1 : r.role === 'glass' ? 0.55 + 0.5 * lit(r.nr) : r.role === 'tire' || r.role === 'dark' ? 0.9 + 0.15 * lit(r.nr) : lit(r.nr) * 1.12;
      const fill = r.role === 'light' ? base : shade(base, k), pts = r.pr.map(proj).join(' ');
      out += `<polygon points="${pts}" fill="${fill}" stroke="${fill}" stroke-width=".35" stroke-linejoin="round"/>`;
      if (r.role === 'glass' && r.pr.length === 4) { const [a, b2, c2, d] = r.pr, L = (u, v, t) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t]; out += `<polygon points="${[L(a, b2, 0.16), L(a, b2, 0.5), L(d, c2, 0.5), L(d, c2, 0.16)].map(proj).join(' ')}" fill="#fff" opacity=".2"/>`; }
    }
    _vcache.set(key, out); return out;
  }

  // ---------- the world ----------
  const WORLD = () => { const DY = C.DY; return { MR0: 800 + DY, MR1: 1060 + DY, RYC: 930 + DY, BR0: -170, BR1: 50, SX0: 1100, SX1: 1220, YN: -1000 }; };
  const CW = () => [C.BLD.mk.door, 1060, 1260, C.BLD.web.door, C.BLD.sn.door];   // main-road crossings (x centres)
  function ground() {
    const { MR0, MR1, RYC, BR0, BR1, SX0, SX1, YN } = WORLD(); let s = '';
    s += flat(-2600, -2200, C.W + 2600, C.D + 1400, '#B7BAA2') + flat(-900, YN - 60, C.W + 400, C.D, 'url(#k-pave)');
    // planting strips + park
    const gaps = CW().map((c) => [c - 60, c + 60]);
    const strip = (y0, y1) => { let x = 0; for (const [a, b] of gaps.concat([[C.W + 1, C.W + 2]])) { if (a > x) s += flat(x, y0, Math.min(a, C.W), y1, 'url(#k-grass)'); x = b; } };
    strip(MR0 - 60, MR0 - 26); strip(MR1 + 26, MR1 + 60);
    for (const id of ['mk', 'web', 'sn']) { const [fx, , fw] = C.BLD[id].fp; s += flat(fx - 52, 90, fx - 8, MR0 - 70, 'url(#k-grass)') + flat(fx + fw + 8, 90, fx + fw + 52, MR0 - 70, 'url(#k-grass)'); }
    s += flat(60, MR1 + 120, C.W - 60, C.D - 40, 'url(#k-grass)') + flat(300, MR1 + 350, C.W - 300, MR1 + 410, '#EDE5CF') + flat(1500, MR1 + 170, 2100, C.D - 100, '#EDE5CF');
    // asphalt
    s += flat(-900, MR0, C.W + 400, MR1, 'url(#k-asph)') + flat(-900, BR0, C.W + 400, BR1, 'url(#k-asph)') + flat(SX0, YN, SX1, MR0, 'url(#k-asph)');
    // kerbs
    const kc = '#F6EFDC'; s += flat(-900, MR0 - 7, C.W + 400, MR0, kc) + flat(-900, MR1, C.W + 400, MR1 + 7, kc) + flat(-900, BR0 - 7, C.W + 400, BR0, kc) + flat(-900, BR1, C.W + 400, BR1 + 7, kc) + flat(SX0 - 7, YN, SX0, BR0 - 7, kc) + flat(SX1, YN, SX1 + 7, BR0 - 7, kc) + flat(SX0 - 7, BR1 + 7, SX0, MR0 - 7, kc) + flat(SX1, BR1 + 7, SX1 + 7, MR0 - 7, kc);
    // markings: main road (4 lanes), back road (2 lanes), side street (2 lanes)
    const Y = '#F2C230', Wt = '#F3EFE0';
    for (const [a, b] of [[-900, 1020], [1300, C.W + 400]]) {
      s += line(a, RYC - 3, b, RYC - 3, Y, 3) + line(a, RYC + 3, b, RYC + 3, Y, 3) + line(a, RYC - 65, b, RYC - 65, Wt, 3, '34 30') + line(a, RYC + 65, b, RYC + 65, Wt, 3, '34 30');
      s += line(a, BR0 + 110 - 3, b, BR0 + 110 - 3, Y, 3) + line(a, BR0 + 113, b, BR0 + 113, Y, 3);
    }
    s += line(0, MR0 + 8, C.W, MR0 + 8, Wt, 2) + line(0, MR1 - 8, C.W, MR1 - 8, Wt, 2);
    for (const [a, b] of [[YN, BR0 - 30], [BR1 + 30, MR0 - 120]]) s += line((SX0 + SX1) / 2 - 3, a, (SX0 + SX1) / 2 - 3, b, Y, 3) + line((SX0 + SX1) / 2 + 3, a, (SX0 + SX1) / 2 + 3, b, Y, 3);
    // zebra crossings
    for (const cx of CW()) for (let k = -44; k < 46; k += 16) s += flat(cx + k, MR0 + 14, cx + k + 8, MR1 - 14, Wt);
    for (let k = 0; k < 64; k += 16) s += flat(SX0 + 12, MR0 - 112 + k, SX1 - 12, MR0 - 104 + k, Wt);
    for (let k = 0; k < 64; k += 16) s += flat(SX0 + 12, BR1 + 24 + k, SX1 - 12, BR1 + 32 + k, Wt);
    for (const x of [1020, 1300]) s += flat(x - 3, MR0 + 8, x + 3, RYC - 8, Wt) + flat(x - 3, RYC + 8, x + 3, MR1 - 8, Wt);   // stop lines
    // fountain plaza
    s += `<g transform="${plane(1800, 1600 + C.DY)}"><ellipse cx="0" cy="0" rx="128" ry="64" fill="#D8D0B8"/><ellipse cx="0" cy="-6" rx="108" ry="54" fill="#5BC6EB"/><ellipse class="vc-ripple" cx="0" cy="-6" rx="70" ry="34" fill="none" stroke="#fff" stroke-width="3" opacity=".6"/><rect x="-6" y="-70" width="12" height="64" fill="#E4DEC9"/><ellipse cx="0" cy="-72" rx="28" ry="12" fill="#CFC8B1"/><path class="vc-jet" d="M0 -72 q-24 -36 -40 0 M0 -72 q24 -36 40 0 M0 -72 v-38" stroke="#EAF8FF" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>`;
    return s;
  }
  // everything that stands on the ground, with a footprint box for painter ordering: { bb:[x0,y0,x1,y1], h }
  function treeList() {
    const { MR0, MR1, SX0, SX1 } = WORLD(), t = [], cws = CW(), okx = (x) => cws.every((c) => Math.abs(x - c) > 80) && !(x > 1000 && x < 1330), ok2 = (x) => cws.every((c) => Math.abs(x - c) > 80);
    let i = 0; for (let x = 70; x < C.W; x += 150) if (okx(x)) t.push([x + (i++ % 2) * 20, MR0 - 43, i % 3 === 0 ? 'c' : 'r']);
    for (let x = 130; x < C.W - 60; x += 160) if (ok2(x) && !(x > 1000 && x < 1330)) t.push([x, MR1 + 43, i++ % 3 === 1 ? 'c' : 'r']);
    for (const id of ['mk', 'web', 'sn']) { const [fx, , fw] = C.BLD[id].fp; for (let y = 200; y < MR0 - 120; y += 190) { t.push([fx - 30, y, i++ % 2 ? 'c' : 'r']); t.push([fx + fw + 30, y + 60, i++ % 2 ? 'c' : 'r']); } }
    for (const [x, y] of [[300, 1980], [520, 2200], [900, 2050], [1250, 2300], [2400, 2050], [2750, 2250], [3150, 2050], [3400, 2300], [150, 2300], [1150, 1980], [2150, 2350]]) t.push([x, y + 0, 'r']);
    return t;
  }
  function scenery() {
    const { MR0, MR1, SX0, SX1 } = WORLD(), it = [];
    for (const [x, y, k] of treeList()) it.push({ bb: [x - 14, y - 14, x + 14, y + 14], h: k === 'c' ? conifer(x, y, 1.35) : roundTree(x, y, 1.35) });
    for (const x of [200, 600, 1400, 1800, 2200, 2600, 3000, 3400]) { it.push({ bb: [x - 4, MR0 - 20, x + 4, MR0 - 12], h: lamp(x, MR0 - 16) }); }
    for (const x of [400, 800, 1500, 2000, 2500, 3250]) { it.push({ bb: [x - 4, MR1 + 12, x + 4, MR1 + 20], h: lamp(x, MR1 + 16) }); }
    for (const [x, y] of [[700, MR0 - 43], [1500, MR1 + 43], [2500, MR1 + 43], [2900, MR0 - 43], [1000, MR1 + 43]]) it.push({ bb: [x - 14, y - 6, x + 14, y + 6], h: bench(x, y) });
    for (const id of ['mk', 'web', 'sn']) { const b = C.BLD[id]; for (const sx of [-130, 130]) { const gx = b.door + sx, gy = b.fp[1] + b.fp[3] + 40; it.push({ bb: [gx - 12, gy - 6, gx + 12, gy + 6], h: bush(gx - 8, gy) + bush(gx + 8, gy + 2) }); } }
    for (const [x, y, ax] of [[SX0 - 38, MR0 - 36, 'ew'], [SX1 + 38, MR0 - 36, 'ns'], [SX0 - 38, MR1 + 36, 'ns'], [SX1 + 38, MR1 + 36, 'ew']]) it.push({ bb: [x - 4, y - 4, x + 4, y + 4], h: signal(x, y, ax) });
    for (const x of [60, 3540]) for (let y = 1300; y < 1700; y += 400) it.push({ bb: [x - 4, y - 4, x + 4, y + 4], h: '' });
    return it;
  }
  // decorative city blocks (no data, never interactive): the dense skyline behind and beside the three department buildings
  function decor() {
    const T = [
      [70, -540, 300, 260, 15, 'orange', '#EF8E3C'], [430, -620, 300, 300, 12, 'blue', '#4A4A52', { n: 4, inset: 0.18 }], [770, -520, 220, 240, 9, 'cyan', '#B53BAA'], [100, -880, 250, 230, 10, 'red', '#5B5A62'], [470, -900, 250, 220, 8, 'orange', '#EF8E3C'],
      [1320, -560, 320, 260, 13, 'blue', '#4A4A52', { n: 3, inset: 0.2 }], [1700, -620, 300, 300, 11, 'orange', '#EF8E3C'], [2080, -540, 300, 240, 14, 'red', '#5B5A62'], [1340, -880, 280, 220, 9, 'orange', '#EF8E3C'], [1720, -900, 260, 230, 12, 'blue', '#4A4A52'], [2100, -900, 280, 260, 8, 'cyan', '#B53BAA'],
      [2650, -560, 300, 260, 12, 'cyan', '#B53BAA', { n: 3, inset: 0.2 }], [3020, -600, 300, 300, 15, 'orange', '#EF8E3C'], [3380, -540, 200, 240, 9, 'blue', '#4A4A52'], [2680, -880, 280, 230, 10, 'red', '#5B5A62'], [3060, -900, 300, 260, 13, 'blue', '#4A4A52', { n: 3, inset: 0.18 }],
      [-620, -560, 280, 260, 11, 'orange', '#EF8E3C'], [-290, -540, 260, 240, 9, 'cyan', '#B53BAA'], [-600, -200, 260, 300, 13, 'red', '#5B5A62', { n: 3, inset: 0.2 }], [-300, -180, 240, 260, 7, 'blue', '#4A4A52'], [-600, 300, 260, 280, 8, 'orange', '#EF8E3C'], [-300, 260, 250, 300, 6, 'cyan', '#B53BAA'], [-600, 700, 260, 280, 7, 'blue', '#4A4A52'], [-300, 660, 250, 300, 5, 'red', '#5B5A62'],
      [30, 260, 180, 280, 6, 'teal', '#EF8E3C'], [30, 640, 180, 300, 4, 'orange', '#EF8E3C'], [3440, 240, 140, 260, 5, 'cyan', '#B53BAA'], [3440, 620, 140, 280, 4, 'red', '#5B5A62'],
    ];
    return T.map(([x, y, w, d, n, st, edge, up], i) => { const t = tower({ x, y, w, d, n, st, edge, up, seed: i }); return { bb: t.bbox, h: t.h, z: t.top + 90, shadow: shadowOf(x, y, w, d, t.top, null) }; });
  }
  // painter's order for boxes on a plane: A is drawn before B when A lies entirely behind B along x or y (topological), ties by left-front corner
  function depthSort(items) {
    const n = items.length, before = (a, b) => a.bb[2] <= b.bb[0] + 0.01 || a.bb[3] <= b.bb[1] + 0.01, key = (a) => a.bb[0] + a.bb[3] + (a.bb[2] - a.bb[0]) * 0.001;
    const succ = items.map(() => []), indeg = items.map(() => 0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a = before(items[i], items[j]), b = before(items[j], items[i]); if (a && !b) { succ[i].push(j); indeg[j]++; } else if (b && !a) { succ[j].push(i); indeg[i]++; } }
    const ready = [], out = []; items.forEach((_, i) => { if (!indeg[i]) ready.push(i); });
    while (ready.length) { ready.sort((p, q) => key(items[q]) - key(items[p])); const i = ready.pop(); out.push(items[i]); for (const j of succ[i]) if (!--indeg[j]) ready.push(j); }
    if (out.length < n) { const seen = new Set(out); items.filter((q) => !seen.has(q)).sort((p, q) => key(p) - key(q)).forEach((q) => out.push(q)); }   // a cycle (overlapping footprints): fall back to the corner key
    return out;
  }
  function init(cfg) { Object.assign(C, cfg); }
  window.VCityKit = { crown, init, defs, ground, scenery, decor, depthSort, treeList, tower, faces, roof, shadowOf, vehicleAt, VEH, setSignals, world: WORLD, crossings: CW, box, quad, flat, P, plane, STY };
})();
