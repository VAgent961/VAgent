// V Agent City — the CEO villa: a walled Mediterranean-Lebanese estate in the middle of the city (limestone, arched windows, terracotta hip roofs, pool, fountain court,
// cypress drive) and, when you open it, a cut-away living room where the CEO sits on a sofa watching TV.  window.VVilla
// Pure drawing in the city's grid (screen = ((x-y)*0.866, (x+y)/2 - z)); city.js plugs it in as a normal building (.vc-b with .vc-fl walls, .vc-in interior, .vc-top roof, .vc-bands).
// The interior is hidden until the building is open (city.css: .vc-b:not(.open) .vc-in). The CEO figure carries class "vc-ceo": city.js already turns a click on it into "talk to the CEO".
(function () {
  'use strict';
  const K = 0.866, KK = window.VCityKit;
  const P = (gx, gy, z) => [(gx - gy) * K, (gx + gy) * 0.5 - (z || 0)];
  const f1 = (n) => (+n).toFixed(1);
  const pt = (gx, gy, z) => P(gx, gy, z).map(f1).join(',');
  const poly = (a, fill, ex) => `<polygon points="${a.map((q) => pt(q[0], q[1], q[2])).join(' ')}" fill="${fill}" ${ex || ''}/>`;
  const quad = (a, b, c, d, fill, ex) => poly([a, b, c, d], fill, ex);
  const flat = (x0, y0, x1, y1, fill, z, ex) => quad([x0, y0, z || 0], [x1, y0, z || 0], [x1, y1, z || 0], [x0, y1, z || 0], fill, ex);
  const shade = (hex, k) => '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.substr(i, 2), 16) * k))).toString(16).padStart(2, '0')).join('');
  const box = (x, y, w, d, z, h, top, left, right) => KK.box(x, y, w, d, z, h, top, left, right);
  const tr = (x, y, z) => { const o = P(x, y, z); return `translate(${f1(o[0])} ${f1(o[1])})`; };
  const SF = (x, y, z) => `<g transform="${tr(x, y, z)} matrix(${K} .5 0 1 0 0)">`;    // a plane facing south at grid y: local u runs along +x, up is -v
  const EF = (x, y, z) => `<g transform="${tr(x, y, z)} matrix(${-K} .5 0 1 0 0)">`;   // a plane facing east/west at grid x: local u runs along +y
  const circ = (cx, cy, r, z, fill, ex) => { const a = []; for (let i = 0; i < 32; i++) { const t = i / 32 * Math.PI * 2; a.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r, z || 0]); } return poly(a, fill, ex); };
  const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  const C = { wall: '#F2E8D2', wallE: '#DCCFB1', stone: '#D6C7A3', stoneE: '#BDAE8B', tileS: '#CB5B30', tileE: '#A8451F', tileL: '#7A2E12', glass: '#8FC9E8', wood: '#5B3A22', shut: '#35705A' };
  const geo = (b) => { const [HX, HY, HW, HD] = b.fp, WW = 150; return { HX, HY, HW, HD, WW, WL: { x: HX, y: HY + 50, w: WW, d: HD - 50, h: 118 }, CN: { x: HX + WW, y: HY, w: HW - 2 * WW, d: HD, h: 200 }, ER: { x: HX + HW - WW, y: HY + 50, w: WW, d: HD - 50, h: 118 }, cx: HX + HW / 2 }; };

  // ---------------------------------------------------------------- facade details (drawn in a face's local frame, base = floor of the plane)
  const shutter = (u, base, w, h) => `<rect x="${f1(u)}" y="${f1(-base - h)}" width="${f1(w)}" height="${f1(h)}" fill="${C.shut}" stroke="#244E3F" stroke-width="1"/>` + [0.25, 0.5, 0.75].map((k) => `<line x1="${f1(u + 1)}" y1="${f1(-base - h * k)}" x2="${f1(u + w - 1)}" y2="${f1(-base - h * k)}" stroke="#244E3F" stroke-width="1.3"/>`).join('');
  function arch(u, base, w, h, o) {
    o = o || {}; const r = w / 2, v0 = -base; let s = '';
    if (o.shutters) { const sw = w * 0.42; s += shutter(u - r - sw - 3, base, sw, h - 2) + shutter(u + r + 3, base, sw, h - 2); }
    s += `<path d="M${f1(u - r - 4)},${f1(v0)} v${f1(-(h - r))} a${f1(r + 4)},${f1(r + 4)} 0 0 1 ${f1(w + 8)},0 v${f1(h - r)} z" fill="#EADFC4"/>`;
    s += `<path d="M${f1(u - r)},${f1(v0)} v${f1(-(h - r))} a${f1(r)},${f1(r)} 0 0 1 ${f1(w)},0 v${f1(h - r)} z" fill="${o.glass || C.glass}"/>`;
    s += `<polygon points="${f1(u - r + 4)},${f1(v0 - 3)} ${f1(u - r + 4)},${f1(v0 - h * 0.55)} ${f1(u + 3)},${f1(v0 - h * 0.78)} ${f1(u + 3)},${f1(v0 - 3)}" fill="#fff" opacity=".24"/>`;
    s += `<line x1="${f1(u)}" y1="${f1(v0)}" x2="${f1(u)}" y2="${f1(v0 - h + 2)}" stroke="#7A5C3A" stroke-width="2"/><line x1="${f1(u - r)}" y1="${f1(v0 - h * 0.45)}" x2="${f1(u + r)}" y2="${f1(v0 - h * 0.45)}" stroke="#7A5C3A" stroke-width="2"/>`;
    s += `<rect x="${f1(u - r - 6)}" y="${f1(v0)}" width="${f1(w + 12)}" height="4" fill="#CDBF9E"/>`;
    return s;
  }
  const plinth = (w, col) => `<rect x="0" y="-14" width="${f1(w)}" height="14" fill="${col}"/>`;
  const quoins = (w, h, col) => { let s = ''; for (let k = 0; k * 22 < h; k++) { const ww = k % 2 ? 14 : 20; s += `<rect x="0" y="${f1(-(k + 1) * 22)}" width="${ww}" height="20" fill="${col}"/><rect x="${f1(w - ww)}" y="${f1(-(k + 1) * 22)}" width="${ww}" height="20" fill="${col}"/>`; } return s; };

  // hip roof over a box; ridge along the longer side; overhang only on the free sides (so it never covers its neighbour)
  function hip(x, y, w, d, z, rh, o, free) {
    free = free || { w: 1, e: 1, n: 1, s: 1 };
    const bx0 = x - (free.w ? o : 0), bx1 = x + w + (free.e ? o : 0), by0 = y - (free.n ? o : 0), by1 = y + d + (free.s ? o : 0), zr = z + rh;
    let r0, r1; if (w >= d) { r0 = [x + d / 2, y + d / 2, zr]; r1 = [x + w - d / 2, y + d / 2, zr]; } else { r0 = [x + w / 2, y + w / 2, zr]; r1 = [x + w / 2, y + d - w / 2, zr]; }
    const southQ = w >= d ? [[bx0, by1, z], [bx1, by1, z], r1, r0] : [[bx0, by1, z], [bx1, by1, z], r1];
    const eastQ = w >= d ? [[bx1, by0, z], [bx1, by1, z], r1] : [[bx1, by0, z], [bx1, by1, z], r1, r0];
    let s = poly(southQ, C.tileS) + poly(eastQ, C.tileE);
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    for (let k = 1; k <= 7; k++) { const t = k / 8; const a = lerp([bx0, by1, z], r0, t), b = lerp([bx1, by1, z], r1, t); s += `<polyline points="${pt(...a)} ${pt(...b)}" fill="none" stroke="${C.tileL}" stroke-opacity=".28" stroke-width="1.4"/>`;
      const c = lerp([bx1, by1, z], r1, t), e = lerp([bx1, by0, z], w >= d ? r1 : r0, t); s += `<polyline points="${pt(...c)} ${pt(...e)}" fill="none" stroke="${C.tileL}" stroke-opacity=".28" stroke-width="1.4"/>`; }
    s += `<polyline points="${pt(bx0, by1, z)} ${pt(bx1, by1, z)} ${pt(bx1, by0, z)}" fill="none" stroke="${C.tileL}" stroke-width="3"/>`;   // eave edge
    s += `<polyline points="${pt(...r0)} ${pt(...r1)}" fill="none" stroke="#E9B08F" stroke-width="2.5" stroke-linecap="round"/>`;                 // ridge cap
    return s;
  }

  // ---------------------------------------------------------------- the house: walls (.vc-fl), roofs (.vc-top)
  function walls(b) {
    const g = geo(b), { WL, CN, ER, HX, HY, HW, HD } = g; let s = '';
    const solid = (q) => box(q.x, q.y, q.w, q.d, 0, q.h, C.wall, C.wall, C.wallE);
    const wingFront = (q) => SF(q.x, q.y + q.d, 0) + plinth(q.w, '#D8CAA8') + quoins(q.w, q.h, '#E9DDC0') + arch(q.w / 2, 34, 38, 66, { shutters: true }) + `<rect x="-3" y="${f1(-q.h)}" width="${f1(q.w + 6)}" height="7" fill="${C.stone}"/></g>`;
    const wingEast = (q, u0) => EF(q.x + q.w, q.y, 0) + plinth(q.d, '#C7B892') + [u0, u0 + 110].map((u) => arch(u, 34, 32, 58, {})).join('') + '</g>';
    // west wing (behind the centre block)
    s += solid(WL) + wingFront(WL);
    // centre block
    s += solid(CN);
    s += SF(CN.x, CN.y + CN.d, 0) + plinth(CN.w, '#D8CAA8') + quoins(CN.w, CN.h, '#E9DDC0');
    s += arch(58, 30, 38, 66, { shutters: true }) + arch(CN.w - 58, 30, 38, 66, { shutters: true });
    s += `<rect x="-4" y="-108" width="${CN.w + 8}" height="7" fill="${C.stone}"/>`;                                   // string course between the floors
    s += arch(52, 122, 32, 54, { shutters: true }) + arch(CN.w - 52, 122, 32, 54, { shutters: true });
    s += `<rect x="108" y="-190" width="124" height="86" fill="#7F5E3F" opacity=".35"/>`;                              // loggia recess
    for (const u of [136, 170, 204]) s += arch(u, 112, 26, 70, { glass: '#9ED4EE' });
    s += `<rect x="-5" y="-203" width="${CN.w + 10}" height="9" fill="${C.stone}"/><rect x="-5" y="-194" width="${CN.w + 10}" height="3" fill="${C.stoneE}"/>`;   // cornice
    // front door under the porch
    s += `<path d="M${f1(CN.w / 2 - 34)},0 v-70 a34,34 0 0 1 68,0 v70 z" fill="#EADFC4"/><path d="M${f1(CN.w / 2 - 27)},0 v-68 a27,27 0 0 1 54,0 v68 z" fill="${C.wood}"/>`
      + `<path d="M${f1(CN.w / 2 - 27)},-68 a27,27 0 0 1 54,0" fill="#9ED4EE" opacity=".7"/><line x1="${f1(CN.w / 2)}" y1="0" x2="${f1(CN.w / 2)}" y2="-95" stroke="#3E2715" stroke-width="2.5"/>`
      + `<circle cx="${f1(CN.w / 2 - 8)}" cy="-36" r="2.6" fill="#E6C25A"/><circle cx="${f1(CN.w / 2 + 8)}" cy="-36" r="2.6" fill="#E6C25A"/>`;
    s += '</g>';
    s += EF(CN.x + CN.w, CN.y, 0) + [60, 190, 285].map((u) => arch(u, 124, 30, 54, {})).join('') + '</g>';   // east side of the centre block, above the wing roof
    // east wing (in front of the centre block)
    s += solid(ER) + wingFront(ER) + wingEast(ER, 60);
    // porch: columns, balcony slab with balustrade, steps, lanterns
    const px0 = g.cx - 92, pw = 184, py = HY + HD;
    s += box(px0 - 6, py + 22, pw + 12, 10, 0, 6, '#E8DCC0', '#CFC09F', '#B8A987') + box(px0 - 2, py + 12, pw + 4, 10, 0, 12, '#EFE4CB', '#D6C8A6', '#BDAE8B');
    s += box(px0, py, pw, 40, 100, 7, '#EFE4CB', '#D9CCAA', '#BDAE8B');
    for (const cx of [px0 + 8, px0 + 56, px0 + pw - 66, px0 + pw - 18]) s += box(cx, py + 28, 10, 10, 6, 94, '#F6EEDB', '#E4D8BC', '#C9BB98') + box(cx - 2, py + 26, 14, 14, 98, 4, '#F6EEDB', '#E4D8BC', '#C9BB98');
    for (let u = px0 + 4; u < px0 + pw; u += 15) s += box(u, py + 36, 4, 4, 107, 15, '#F6EEDB', '#E4D8BC', '#C9BB98');
    s += box(px0, py + 34, pw, 6, 121, 4, '#F6EEDB', '#E4D8BC', '#C9BB98');
    for (const lx of [g.cx - 50, g.cx + 50]) { const o = P(lx, py + 6, 66); s += `<g transform="translate(${f1(o[0])} ${f1(o[1])})"><ellipse cx="0" cy="0" rx="22" ry="12" fill="url(#vc-pool)" opacity=".8"/><rect x="-3" y="-8" width="6" height="12" rx="2" fill="#F5D77A" stroke="#7A5C3A" stroke-width="1.5"/></g>`; }
    return s;
  }
  function roofs(b) {
    const g = geo(b), { WL, CN, ER } = g; let s = '';
    s += hip(WL.x, WL.y, WL.w, WL.d, WL.h, 52, 9, { w: 1, e: 0, n: 1, s: 1 });
    s += hip(CN.x, CN.y, CN.w, CN.d, CN.h, 98, 12, { w: 0, e: 0, n: 1, s: 1 });
    s += hip(ER.x, ER.y, ER.w, ER.d, ER.h, 52, 9, { w: 0, e: 1, n: 1, s: 1 });
    s += box(CN.x + 70, CN.y + 70, 24, 24, CN.h + 38, 62, '#CDBF9E', '#E0D3B5', '#BDAE8B') + box(CN.x + 67, CN.y + 67, 30, 30, CN.h + 98, 6, '#B9A883', '#CDBF9E', '#9C8D6B');   // chimney
    return s;
  }
  function shadow(b) { const [x, y, w, d] = b.fp; return KK.shadowOf(x, y, w, d, 215, b.id) + KK.shadowOf(b.lot[0] + 330, b.lot[1] + 360, 40, 40, 150, null); }

  // ---------------------------------------------------------------- the garden
  const treeBase = (x, y, s) => { const o = P(x, y); return `<g transform="translate(${f1(o[0])} ${f1(o[1])}) scale(${s})">`; };
  const cypress = (x, y, s) => treeBase(x, y, s || 1) + '<ellipse cx="9" cy="3" rx="14" ry="5" fill="#17141F" opacity=".28"/><rect x="-2" y="-14" width="4" height="16" fill="#6B4A2A"/><polygon points="0,-122 -13,-64 -17,-30 -9,-12 9,-12 17,-30 13,-64" fill="#2E8A4A"/><polygon points="0,-122 13,-64 17,-30 9,-12 0,-12" fill="#24703C"/><polygon points="0,-100 -6,-56 -4,-30 0,-20" fill="#3AA35A" opacity=".55"/></g>';
  const roundTree = (x, y, s) => treeBase(x, y, s || 1.4) + '<ellipse cx="9" cy="3" rx="18" ry="7" fill="#17141F" opacity=".28"/><rect x="-2.5" y="-30" width="5" height="32" fill="#7A5230"/><polygon points="-22,-50 -10,-76 10,-78 24,-54 12,-34 -12,-34" fill="#6FD35A"/><polygon points="0,-77 10,-78 24,-54 12,-34 0,-34" fill="#52B843"/><polygon points="-14,-62 -4,-74 6,-70 -2,-54" fill="#8BE27C" opacity=".7"/></g>';
  function palm(x, y, s) {
    let f = ''; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, dx = Math.cos(a) * 30, dy = Math.sin(a) * 11; f += `<path d="M0,-72 Q${f1(dx * 0.5)},${f1(-96 + dy * 0.2)} ${f1(dx)},${f1(-70 + dy)} Q${f1(dx * 0.5)},${f1(-84 + dy * 0.4)} 0,-72 Z" fill="${i % 2 ? '#3F9E4E' : '#58B65E'}"/>`; }
    return treeBase(x, y, s || 1.2) + '<ellipse cx="8" cy="3" rx="16" ry="6" fill="#17141F" opacity=".26"/><path d="M0,0 Q-6,-34 2,-72" fill="none" stroke="#8A6A45" stroke-width="6" stroke-linecap="round"/>' + f + '<circle cx="-3" cy="-70" r="3.2" fill="#6B4A2A"/><circle cx="4" cy="-68" r="3.2" fill="#6B4A2A"/></g>';
  }
  const hedge = (x, y, w, d) => box(x, y, w, d, 0, 14, '#4FAE55', '#2F8F4B', '#26773D');
  function bed(x0, y0, x1, y1, seed) {
    let s = flat(x0, y0, x1, y1, '#7A5636', 0.5); const cols = ['#E8506A', '#F5C542', '#F28BC0', '#FFFFFF', '#B07BE0'];
    for (let i = 0; i < 22; i++) { const x = x0 + 5 + rnd(seed + i) * (x1 - x0 - 10), y = y0 + 4 + rnd(seed + i + 50) * (y1 - y0 - 8), o = P(x, y, 4); s += `<circle cx="${f1(o[0])}" cy="${f1(o[1])}" r="${f1(2.4 + rnd(seed + i + 9) * 1.6)}" fill="${cols[i % cols.length]}"/>`; }
    return s;
  }
  function lounger(x, y) { return box(x, y, 38, 14, 0, 7, '#FFFFFF', '#E6E6E6', '#CFCFCF') + box(x + 2, y + 1, 26, 12, 7, 3, '#4FA8D8', '#3F8DB8', '#2F6F94') + quad([x + 28, y + 1, 7], [x + 36, y + 1, 7], [x + 36, y + 13, 19], [x + 28, y + 13, 19], '#4FA8D8'); }
  function fountain(cx, cy) {
    const o = P(cx, cy);
    return circ(cx, cy, 52, 0, '#CBBF9F') + circ(cx, cy, 52, 9, '#E8DEC3') + circ(cx, cy, 44, 9.5, '#5BC6EB') + circ(cx, cy, 28, 9.8, '#7BD8F2', 'opacity=".8"')
      + `<g transform="translate(${f1(o[0])} ${f1(o[1] - 9)})"><ellipse class="vc-ripple" cx="0" cy="0" rx="34" ry="17" fill="none" stroke="#fff" stroke-width="2.4" opacity=".6"/><rect x="-5" y="-44" width="10" height="44" fill="#E4DEC9"/><ellipse cx="0" cy="-46" rx="22" ry="9" fill="#CFC8B1"/><ellipse cx="0" cy="-47" rx="18" ry="7" fill="#7BD8F2"/><path class="vc-jet" d="M0,-48 q-2,-30 0,-44 q2,14 0,44z" fill="#fff" opacity=".8"/><path d="M-12,-48 q-10,-16 -22,-6 M12,-48 q10,-16 22,-6" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/></g>`;
  }

  function garden(b) {
    const g = geo(b), [LX, LY, LW, LH] = b.lot, LX1 = LX + LW, LY1 = LY + LH, gx0 = 2085, gx1 = 2127, ctX = g.cx, ctY = 2352;
    let ground = '';
    ground += `<defs>
      <pattern id="vv-lawn" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="matrix(.866 .5 -.866 .5 0 0)"><rect width="80" height="80" fill="#7AD66A"/><rect width="40" height="80" fill="#70CC60"/><circle cx="14" cy="20" r="2" fill="#8BE27C"/><circle cx="58" cy="52" r="2" fill="#63BF54"/></pattern>
      <pattern id="vv-gravel" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="matrix(.866 .5 -.866 .5 0 0)"><rect width="30" height="30" fill="#E6D8B5"/><circle cx="6" cy="8" r="1.6" fill="#D2C29C"/><circle cx="21" cy="19" r="1.8" fill="#F3E8CB"/><circle cx="12" cy="25" r="1.4" fill="#CDBB92"/></pattern>
      <pattern id="vv-water" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="matrix(.866 .5 -.866 .5 0 0)"><rect width="40" height="40" fill="#4FC3E8"/><path d="M0,10 q10,-6 20,0 t20,0 M0,30 q10,-6 20,0 t20,0" fill="none" stroke="#9BE6F7" stroke-width="2" opacity=".7"/></pattern>
    </defs>`;
    ground += flat(LX - 10, LY - 10, LX1 + 10, LY1 + 10, '#6CBF5C', 0) + flat(LX, LY, LX1, LY1, 'url(#vv-lawn)', 0.2);
    // paving: drive from the gate (north-west), around to the fountain court, and the path to the porch steps
    const pave = (x0, y0, x1, y1) => flat(x0 - 4, y0 - 4, x1 + 4, y1 + 4, '#CDBF9E', 0.4) + flat(x0, y0, x1, y1, 'url(#vv-gravel)', 0.6);
    ground += pave(gx0, LY, gx1, ctY + 22) + pave(gx0, ctY - 22, ctX, ctY + 22) + circ(ctX, ctY, 98, 0.4, '#CDBF9E') + circ(ctX, ctY, 94, 0.6, 'url(#vv-gravel)') + pave(ctX - 26, g.HY + g.HD + 40, ctX + 26, ctY - 60);
    // pool deck + pool (east of the house)
    ground += flat(2888, 1912, 3046, 2176, '#EFE6D0', 0.6) + flat(2900, 1924, 3034, 2128, '#FFFFFF', 0.8) + flat(2905, 1929, 3029, 2123, 'url(#vv-water)', 1);
    ground += flat(2905, 1929, 3029, 1950, '#000', 1.1, 'opacity=".12"');
    // inner lawn island of the court + flower beds under the front windows
    ground += circ(ctX, ctY, 62, 0.8, '#6FCB60');
    ground += bed(g.HX + 6, g.HY + g.HD + 6, g.HX + 134, g.HY + g.HD + 24, 3) + bed(g.HX + g.HW - 134, g.HY + g.HD + 6, g.HX + g.HW - 6, g.HY + g.HD + 24, 17);
    // back (north) and west walls belong to the ground layer; the front walls are drawn last
    const wallC = ['#EDE4CC', '#E0D5B8', '#C9BC9A'], wall = (x, y, w, d, h) => box(x, y, w, d, 0, h || 16, wallC[0], wallC[1], wallC[2]);
    const pillar = (x, y) => box(x - 7, y - 7, 14, 14, 0, 34, '#F3EBD6', '#E0D5B8', '#C9BC9A') + box(x - 9, y - 9, 18, 18, 34, 4, '#F3EBD6', '#E0D5B8', '#C9BC9A') + `<g transform="${tr(x, y, 44)}"><circle r="5" fill="#E6C25A"/></g>`;
    let back = wall(LX, LY, gx0 - LX - 8, 8) + wall(gx1 + 8, LY, LX1 - gx1 - 8, 8) + wall(LX, LY, 8, LH) + pillar(gx0 - 6, LY + 4) + pillar(gx1 + 6, LY + 4) + pillar(LX + 4, LY + 4) + pillar(LX1 - 4, LY + 4);
    let front = wall(LX, LY1 - 8, LW, 8) + wall(LX1 - 8, LY, 8, LH) + pillar(LX + 4, LY1 - 4) + pillar(LX1 - 4, LY1 - 4);
    // solid things, painter-sorted: { bb, h }
    const it = [];
    const add = (x0, y0, x1, y1, h) => it.push({ bb: [x0, y0, x1, y1], h });
    add(g.HX - 12, g.HY - 12, g.HX + g.HW + 12, g.HY + g.HD + 42, '__HOUSE__');
    for (const [x, y] of [[2158, 1850], [2158, 1980], [2158, 2110], [2158, 2240], [2830, 1830], [3040, 1840]]) add(x - 14, y - 12, x + 14, y + 12, cypress(x, y, 1.15));
    for (const [x, y] of [[2190, 2400], [2890, 2300], [2420, 1815]]) add(x - 22, y - 16, x + 22, y + 16, roundTree(x, y, 1.5));
    for (const [x, y] of [[2300, 2420], [2800, 2420], [2975, 2230]]) add(x - 20, y - 14, x + 20, y + 14, palm(x, y, 1.25));
    add(ctX - 56, ctY - 56, ctX + 56, ctY + 56, fountain(ctX, ctY));
    add(2915, 2178, 2995, 2196, lounger(2915, 2180) + lounger(2958, 2180));
    { const k = P(2290, 2352); add(2250, 2334, 2330, 2370, `<g transform="translate(${f1(k[0])} ${f1(k[1])})">${KK.vehicleAt('sedan', '#1B1B22', 0)}</g>`); }
    for (const x of [2300, 2790]) add(x, 2272, x + 64, 2286, hedge(x, 2272, 64, 14));
    for (const [x, y] of [[ctX - 118, ctY - 44], [ctX + 118, ctY - 44]]) add(x - 8, y - 6, x + 8, y + 6, `<g transform="${tr(x, y, 0)}"><ellipse cx="0" cy="0" rx="34" ry="13" fill="url(#vc-pool)" class="vc-lamp"/><rect x="-1.5" y="-46" width="3" height="46" fill="#3A3A40"/><rect x="-5" y="-56" width="10" height="11" rx="2" fill="#F5D77A" stroke="#3A3A40" stroke-width="1.5"/></g>`);
    return { ground: ground + back, items: it, front };
  }

  // ---------------------------------------------------------------- the interior (the living room, shown when the villa is open)
  function interior(b) {
    const g = geo(b), x0 = g.HX, x1 = g.HX + g.HW, y0 = g.HY, y1 = g.HY + g.HD, Z = 4, H = 150, W = x1 - x0, D = y1 - y0, tvx = g.cx; let s = '';
    s += `<defs>
      <pattern id="vv-parq" width="48" height="24" patternUnits="userSpaceOnUse" patternTransform="matrix(.866 .5 -.866 .5 0 0)"><rect width="48" height="24" fill="#B98B5A"/><rect width="24" height="12" fill="#C69868"/><rect x="24" y="12" width="24" height="12" fill="#C69868"/><path d="M0 12H48M0 0V24M24 0V24" stroke="#8E6841" stroke-width="1" opacity=".55"/></pattern>
      <linearGradient id="vv-screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1D2B4F"/><stop offset=".6" stop-color="#2E5C9E"/><stop offset="1" stop-color="#7FB5F0"/></linearGradient>
      <linearGradient id="vv-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6FB3E8"/><stop offset="1" stop-color="#FBD9A0"/></linearGradient>
      <radialGradient id="vv-warm" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFD98A" stop-opacity=".55"/><stop offset="1" stop-color="#FFD98A" stop-opacity="0"/></radialGradient>
      <radialGradient id="vv-tv" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#9FD0FF" stop-opacity=".5"/><stop offset="1" stop-color="#9FD0FF" stop-opacity="0"/></radialGradient>
    </defs>`;
    // floor slab + parquet + the rug
    s += box(x0 - 4, y0 - 4, W + 8, D + 8, 0, Z, '#B98B5A', '#8E6841', '#6E4F31');
    s += flat(x0, y0, x1, y1, 'url(#vv-parq)', Z);
    s += flat(tvx - 150, 1996, tvx + 150, 2168, '#7C2530', Z + 0.4) + flat(tvx - 142, 2004, tvx + 142, 2160, '#B8424A', Z + 0.6) + flat(tvx - 124, 2022, tvx + 124, 2142, '#8E2B36', Z + 0.8) + flat(tvx - 118, 2028, tvx + 118, 2136, 'none', Z + 0.9, 'stroke="#D9B36A" stroke-width="2"');
    // the TV's light pooling on the floor and the lamp glow
    s += `<g transform="${tr(tvx, 1990, Z)}"><ellipse cx="0" cy="0" rx="170" ry="62" fill="url(#vv-tv)" class="vv-glow"/></g>`;
    // north wall (the TV wall): cream wall, oak wainscot, skirting, cornice, bookcase, TV, painting, sconces
    s += SF(x0, y0, Z) + `<rect x="0" y="-${H}" width="${W}" height="${H}" fill="#EADFC8"/><rect x="0" y="-44" width="${W}" height="44" fill="#8B6B4A"/>`
      + Array.from({ length: Math.floor(W / 58) }, (_, i) => `<rect x="${f1(8 + i * 58)}" y="-38" width="46" height="30" fill="none" stroke="#6E5238" stroke-width="2"/>`).join('')
      + `<rect x="0" y="-8" width="${W}" height="8" fill="#E9DFC8"/><rect x="0" y="-${H}" width="${W}" height="9" fill="#D6C7A3"/><rect x="0" y="-${H - 9}" width="${W}" height="3" fill="#BDAE8B"/>`;
    // bookcase (left of the TV)
    s += `<rect x="30" y="-132" width="150" height="124" fill="#5B3A22" stroke="#3E2715" stroke-width="2"/>`;
    for (let r = 0; r < 4; r++) { const v = -16 - r * 30; s += `<rect x="34" y="${v - 22}" width="142" height="26" fill="#3E2715"/>`; let u = 37; for (let k = 0; k < 14 && u < 170; k++) { const w = 6 + rnd(r * 20 + k) * 7, h = 16 + rnd(r * 9 + k + 3) * 9; s += `<rect x="${f1(u)}" y="${f1(v + 2 - h)}" width="${f1(w)}" height="${f1(h)}" fill="${['#B5532F', '#2F6F9F', '#C9A227', '#3F7D58', '#8A5BC8', '#E9DDC0'][(r + k) % 6]}"/>`; u += w + 1.2; } }
    // the TV (wall mounted, glowing): ticker + little chart
    const tx = tvx - x0 - 66;
    s += `<rect x="${tx - 5}" y="-118" width="142" height="82" rx="4" fill="#15151A"/><rect x="${tx}" y="-113" width="132" height="72" fill="url(#vv-screen)"/>`
      + `<g class="vv-chart" opacity=".95"><polyline points="${tx + 10},-54 ${tx + 32},-68 ${tx + 52},-60 ${tx + 76},-86 ${tx + 98},-78 ${tx + 122},-98" fill="none" stroke="#7CF0A8" stroke-width="3" stroke-linecap="round"/><circle cx="${tx + 122}" cy="-98" r="4" fill="#7CF0A8"/></g>`
      + `<rect x="${tx}" y="-50" width="132" height="9" fill="#0F1426" opacity=".85"/><clipPath id="vv-tvclip"><rect x="${tx}" y="-50" width="132" height="9"/></clipPath><g clip-path="url(#vv-tvclip)"><text class="vv-tick" x="${tx + 132}" y="-42.5" font-size="7" font-weight="700" fill="#FFD66B" font-family="Inter,sans-serif">VAGENT HQ · ALL AGENTS ONLINE · SNIPER +3 LEADS · VOICE AI TOOK 12 CALLS</text></g>`
      + `<rect x="${tx + 52}" y="-36" width="28" height="4" fill="#2A2A30"/>`;
    // painting + sconces
    s += `<rect x="${W - 150}" y="-122" width="86" height="64" fill="#C9A227"/><rect x="${W - 145}" y="-117" width="76" height="54" fill="#F2D9A8"/><circle cx="${W - 120}" cy="-96" r="11" fill="#E9873A"/><polygon points="${W - 145},-63 ${W - 118},-92 ${W - 100},-76 ${W - 84},-100 ${W - 69},-63" fill="#3F7D58"/>`;
    for (const u of [tvx - x0 - 108, tvx - x0 + 108]) s += `<g transform="translate(${u} -96)"><ellipse cx="0" cy="0" rx="26" ry="22" fill="url(#vv-warm)"/><rect x="-3" y="-8" width="6" height="14" rx="3" fill="#E6C25A"/><path d="M-9,-2 l9,-16 l9,16 z" fill="#F5E3B0"/></g>`;
    s += '</g>';
    // west wall: two arched windows onto the city, a fireplace with a living fire
    s += EF(x0, y0, Z) + `<rect x="0" y="-${H}" width="${D}" height="${H}" fill="#DDD0B4"/><rect x="0" y="-44" width="${D}" height="44" fill="#7C5E40"/><rect x="0" y="-8" width="${D}" height="8" fill="#D9CCAF"/><rect x="0" y="-${H}" width="${D}" height="9" fill="#C9BA96"/>`;
    for (const u of [60, 280]) s += `<path d="M${u - 30},-40 v-72 a30,30 0 0 1 60,0 v72 z" fill="url(#vv-sky)"/><polygon points="${u - 30},-40 ${u - 30},-66 ${u - 18},-66 ${u - 18},-86 ${u - 6},-86 ${u - 6},-60 ${u + 6},-60 ${u + 6},-78 ${u + 20},-78 ${u + 20},-54 ${u + 30},-54 ${u + 30},-40" fill="#6C7FA8" opacity=".85"/><path d="M${u - 30},-40 v-72 a30,30 0 0 1 60,0 v72 z" fill="none" stroke="#F1E6CB" stroke-width="5"/><line x1="${u}" y1="-40" x2="${u}" y2="-142" stroke="#F1E6CB" stroke-width="3"/><rect x="${u - 36}" y="-40" width="72" height="5" fill="#F1E6CB"/>`
      + `<path d="M${u - 44},-146 q-4,52 -2,106 h22 q4,-50 12,-100 z" fill="#8A2B3A" opacity=".92"/><path d="M${u + 44},-146 q4,52 2,106 h-22 q-4,-50 -12,-100 z" fill="#8A2B3A" opacity=".92"/><rect x="${u - 50}" y="-150" width="100" height="5" rx="2.5" fill="#C9A227"/>`;
    s += `<rect x="128" y="-96" width="84" height="88" fill="#E8DFC9" stroke="#BDAE8B" stroke-width="3"/><rect x="144" y="-70" width="52" height="62" fill="#2A1F1A"/><rect x="120" y="-104" width="100" height="9" fill="#F3EBD6" stroke="#BDAE8B" stroke-width="2"/>`
      + `<g class="vv-fire"><path d="M158,-8 q-10,-22 2,-40 q4,16 14,8 q10,14 -2,32 z" fill="#F28A2E"/><path d="M168,-8 q-6,-14 2,-26 q6,10 8,26 z" fill="#FFD25A"/></g><ellipse cx="170" cy="-6" rx="40" ry="10" fill="url(#vv-warm)" opacity=".7"/>`
      + `<g transform="translate(140 -104)"><rect x="-4" y="-18" width="8" height="18" rx="3" fill="#8A5BC8"/><circle cx="-8" cy="-22" r="3" fill="#F28BC0"/><circle cx="6" cy="-24" r="3" fill="#F5C542"/></g></g>`;
    // furniture: console under the TV, coffee table, side table + lamp, armchair, plants
    s += box(tvx - 84, y0 + 6, 168, 24, Z, 32, '#7B5836', '#6B4A2E', '#52381F') + box(tvx - 78, y0 + 8, 74, 20, Z + 2, 22, '#5E4128', '#4A3320', '#3A2818') + box(tvx + 4, y0 + 8, 74, 20, Z + 2, 22, '#5E4128', '#4A3320', '#3A2818');
    s += box(tvx - 56, 1996, 112, 40, Z, 16, '#CFE8F3', '#9CC0D2', '#7BA2B6') + box(tvx - 56, 1996, 112, 40, Z, 4, '#7B5836', '#6B4A2E', '#52381F');
    { const o = P(tvx - 20, 2014, Z + 16); s += `<g transform="translate(${f1(o[0])} ${f1(o[1])})"><ellipse cx="0" cy="0" rx="11" ry="5" fill="#F4F0E6"/><ellipse cx="0" cy="-5" rx="9" ry="4" fill="#F4F0E6"/><ellipse cx="0" cy="-8" rx="8" ry="3" fill="#6B3E22"/></g>` + `<g transform="translate(${f1(o[0] + 36)} ${f1(o[1] + 2)})"><rect x="-12" y="-5" width="24" height="5" fill="#2F6F9F"/><rect x="-10" y="-9" width="20" height="4" fill="#C9A227"/></g>`; }
    // sofa (faces the TV, i.e. north): seat, west arm, then the CEO, then the backrest and east arm in front of him
    const sx = tvx - 80, sy = 2064, sw = 160, sd = 50, cl = ['#3E6396', '#2F4E78', '#233B5C'];
    s += box(sx, sy, sw, sd, Z, 16, '#4A72A8', cl[1], cl[2]) + [0, 1, 2].map((i) => box(sx + 14 + i * 44, sy + 3, 42, sd - 14, Z + 16, 7, '#5A84BC', '#3E6396', '#2F4E78')).join('') + box(sx + 18, sy + 30, 20, 12, Z + 23, 12, '#E9C46A', '#C9A227', '#A8851C') + box(sx + sw - 40, sy + 30, 20, 12, Z + 23, 12, '#E9873A', '#C96F28', '#A85A1F');
    s += box(sx, sy, 14, sd, Z, 34, cl[0], cl[1], cl[2]);
    s += ceo(tvx, sy + 26, Z + 22);
    s += box(sx + 14, sy + sd - 12, sw - 14, 12, Z, 42, '#4A72A8', cl[1], cl[2]);
    s += box(sx + sw - 14, sy, 14, sd, Z, 34, cl[0], cl[1], cl[2]);
    // side table + lamp, floor plants
    s += box(sx + sw + 18, sy + 14, 26, 26, Z, 26, '#7B5836', '#6B4A2A', '#52381F');
    { const o = P(sx + sw + 31, sy + 27, Z + 26); s += `<g transform="translate(${f1(o[0])} ${f1(o[1])})"><ellipse cx="0" cy="-30" rx="42" ry="34" fill="url(#vv-warm)"/><rect x="-2" y="-30" width="4" height="30" fill="#6B4A2A"/><path d="M-14,-28 l14,-26 l14,26 z" fill="#F5E3B0" stroke="#C9A227" stroke-width="1.5"/></g>`; }
    for (const [px, py] of [[x0 + 30, y0 + 30], [x1 - 40, y0 + 38], [x1 - 30, y1 - 40]]) { const o = P(px, py, Z); s += `<g transform="translate(${f1(o[0])} ${f1(o[1])})"><ellipse cx="3" cy="2" rx="16" ry="6" fill="#000" opacity=".2"/><path d="M-11,0 l3,-20 h16 l3,20 z" fill="#B5532F"/><path d="M0,-20 q-22,-8 -26,-34 q16,6 26,34 M0,-20 q-4,-30 8,-44 q6,22 -8,44 M0,-20 q24,-6 28,-30 q-18,4 -28,30" fill="#3F9E4E"/><path d="M0,-20 q-8,-22 -16,-30 M0,-20 q8,-20 14,-34" stroke="#2F7F3E" stroke-width="2" fill="none"/></g>`; }
    // the dog asleep on the rug (tail wags)
    { const o = P(tvx - 108, 2128, Z + 1); s += `<g transform="translate(${f1(o[0])} ${f1(o[1])})"><ellipse cx="2" cy="3" rx="22" ry="7" fill="#000" opacity=".2"/><ellipse cx="0" cy="-5" rx="20" ry="9" fill="#D9A15A"/><circle cx="-18" cy="-8" r="8" fill="#E2B070"/><path d="M-25,-12 q-5,8 0,14 q4,-6 3,-12z" fill="#9A6A32"/><g class="vv-tail"><path d="M18,-8 q12,-6 14,-16 q-8,2 -16,10z" fill="#D9A15A"/></g></g>`; }
    // a warm glow over the sofa area, so the room feels lived in
    s += `<g transform="${tr(tvx, 2090, Z)}" pointer-events="none"><ellipse cx="0" cy="0" rx="210" ry="80" fill="url(#vv-warm)" opacity=".35"/></g>`;
    return s;
  }

  // The CEO, seen from behind on the sofa (a back view, since he faces the TV): gold blazer, dark hair, a mug in his hand. Clickable = talk to the CEO.
  function ceo(x, y, z) {
    const o = P(x, y, z);
    return `<g class="vc-ceo" role="button" tabindex="0" aria-label="Talk to the CEO" style="cursor:pointer" transform="translate(${f1(o[0])} ${f1(o[1])})">`
      + '<rect x="-56" y="-120" width="112" height="124" fill="#fff" opacity="0"/>'
      + '<ellipse cx="0" cy="4" rx="30" ry="9" fill="#000" opacity=".18"/>'
      + '<path d="M-17,0 L-19,-30 Q-19,-44 -6,-46 L6,-46 Q19,-44 19,-30 L17,0 Z" fill="#C9A227"/><path d="M0,-46 L0,0" stroke="#A8851C" stroke-width="2"/>'
      + '<path d="M-19,-30 Q-27,-22 -24,-4 L-17,-6 Z" fill="#B38E1E"/><path d="M19,-30 Q27,-22 24,-4 L17,-6 Z" fill="#B38E1E"/>'
      + '<rect x="-4.5" y="-52" width="9" height="8" fill="#C58C6B"/><path d="M-7,-46 L0,-41 L7,-46 L5,-48 L-5,-48 Z" fill="#F6E7B0"/>'
      + '<circle cx="0" cy="-62" r="11.5" fill="#C58C6B"/><ellipse cx="-11" cy="-61" rx="2.6" ry="4" fill="#B97D5C"/><ellipse cx="11" cy="-61" rx="2.6" ry="4" fill="#B97D5C"/>'
      + '<path d="M-12,-64 Q-12,-76 0,-76 Q12,-76 12,-64 Q10,-56 0,-55 Q-10,-56 -12,-64 Z" fill="#3A2E26"/><path d="M-12,-64 Q-13,-58 -9,-54 L-8,-62 Z" fill="#8A8A90"/><path d="M12,-64 Q13,-58 9,-54 L8,-62 Z" fill="#8A8A90"/>'
      + '<g transform="translate(22 -18)"><rect x="-5" y="-6" width="10" height="9" rx="2" fill="#F4F0E6"/><path d="M5,-4 q5,0 5,3 q0,3 -5,3" fill="none" stroke="#F4F0E6" stroke-width="2"/><path class="vv-steam" d="M-1,-8 q-3,-5 0,-9 M2,-8 q3,-5 0,-9" fill="none" stroke="#fff" stroke-width="1.5" opacity=".7"/></g>'
      + '<g class="tag" transform="translate(0 -104) scale(1.25)"><rect x="-64" y="-13" width="128" height="24" rx="12" fill="#2B2416"/><text y="3" text-anchor="middle" fill="#E9C46A" font-size="12" font-weight="600" font-family="Inter,sans-serif">CEO · Talk to me</text></g>'
      + '</g>';
  }

  // ---------------------------------------------------------------- the building, as city.js expects it
  function building(b, ctx) {
    const g = geo(b), { HX, HY, HW, HD } = g, id = b.id, gd = garden(b);
    const house = `<g class="vc-house"><g class="vc-fl" data-b="${id}" data-f="1">${walls(b)}</g><g class="vc-in" data-b="${id}">${interior(b)}</g><g class="vc-top" data-b="${id}">${roofs(b)}</g></g>`;
    const sorted = KK.depthSort(gd.items.map((i) => ({ bb: i.bb, h: i.h === '__HOUSE__' ? house : i.h }))).map((i) => i.h).join('');
    // click target for "pick a floor": the whole front of the house (only active in the building view, see city.css)
    const bands = `<g class="vc-bands" transform="translate(${f1(P(HX, HY + HD)[0])} ${f1(P(HX, HY + HD)[1])}) matrix(${K} .5 0 1 0 0)"><g class="vc-band" data-b="${id}" data-f="1" role="button" aria-label="CEO villa living room"><rect x="0" y="-205" width="${HW}" height="205"/><circle cx="34" cy="-102" r="22" fill="${b.col}"/><text x="34" y="-94" text-anchor="middle" font-size="24" font-weight="700" fill="#fff" font-family="Inter,sans-serif">1</text></g></g>`;
    const lp = P(HX + HW / 2, HY + HD / 2, b.h + 140);
    const out = `<g class="vc-b" data-b="${id}" tabindex="0" role="button" aria-label="${b.name}" style="cursor:pointer">${gd.ground}${sorted}${gd.front}${bands}${ctx.pill(lp)}</g>`;
    return { bb: [b.lot[0], b.lot[1], b.lot[0] + b.lot[2], b.lot[1] + b.lot[3]], h: out, z: b.h + 260 };
  }
  // camera boxes: the building (house + front court) and the open room
  function boxOf(b) { const g = geo(b), l = P(g.HX, g.HY + g.HD)[0], r = P(g.HX + g.HW, g.HY)[0], t = P(g.HX, g.HY, b.h + 130)[1], bt = P(g.HX + g.HW, g.HY + g.HD)[1] + 300; return { x: l - 300, y: t, w: r - l + 600, h: bt - t }; }
  function roomBox(b) { const g = geo(b), l = P(g.HX, g.HY + g.HD)[0], r = P(g.HX + g.HW, g.HY)[0], t = P(g.HX, g.HY, 4 + 150)[1], bt = P(g.HX + g.HW, g.HY + g.HD)[1]; return { x: l - 30, y: t - 90, w: r - l + 60, h: bt - t + 130 }; }

  window.VVilla = { building, shadow, boxOf, roomBox };
})();
