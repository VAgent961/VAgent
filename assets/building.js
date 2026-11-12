// window.VBuilding.build(floors) -> { inner, vb, boxes }
// The outside "cutaway tower": one slab per apartment (floor), each holding up to 4 department rooms.
// floors[0] is the ground floor (bottom of the tower). Same isometric projection as scene.js.
// floors: [{ depts: [{ id, name, color, count, working }], total, working }]
(function () {
  const P = (x, y, h = 0) => [600 + 0.8 * (x - y), 110 + 0.462 * (x + y) - h];
  const f = (n) => n.toFixed(1);
  const pts = (...a) => a.map((p) => f(p[0]) + ',' + f(p[1])).join(' ');
  const poly = (fill, ...a) => `<polygon points="${pts(...a)}" fill="${fill}"/>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const W = 1000, D = 1000, FH = 250, PER = 4;
  const WD = () => window.VWorld;

  function floorSvg(fl, i) {
    const e = (i + 1) * FH; // height of this floor's top surface
    const Q = (x, y, h = 0) => P(x, y, e + h);
    const plane = `matrix(0.8 0.462 -0.8 0.462 600 ${f(110 - e)})`;
    const slots = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const cw = (W - 80) / 2, ch = (D - 80) / 2;
    let rooms = '';
    slots.forEach(([c, r], k) => {
      const d = fl.depts[k], x0 = 40 + c * (cw + 0), y0 = 40 + r * (ch + 0), cx = x0 + cw / 2, cy = y0 + ch / 2;
      if (d) {
        const live = d.working > 0;
        rooms += `<rect x="${x0 + 8}" y="${y0 + 8}" width="${cw - 16}" height="${ch - 16}" rx="26" fill="${d.color}" opacity="${live ? 0.34 : 0.2}"/>` +
          `<rect x="${x0 + 8}" y="${y0 + 8}" width="${cw - 16}" height="${ch - 16}" rx="26" fill="none" stroke="${d.color}" stroke-width="5" opacity=".8"/>` +
          `<text x="${cx}" y="${cy - 6}" text-anchor="middle" font-family="Newsreader, Georgia, serif" font-size="56" fill="#FAF9F5">${esc(cut(d.name, 13))}</text>` +
          `<text x="${cx}" y="${cy + 56}" text-anchor="middle" font-size="38" fill="#FAF9F5" opacity=".72">${d.working} working · ${d.count} agents</text>`;
      } else {
        rooms += `<rect x="${x0 + 8}" y="${y0 + 8}" width="${cw - 16}" height="${ch - 16}" rx="26" fill="#141416" opacity=".6" stroke="#4A4A52" stroke-width="5" stroke-dasharray="26 18"/>` +
          `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="40" fill="#B0AEA5" opacity=".7">Free room</text>`;
      }
    });
    // coloured department stripe along the front rim (visible even when the floor above covers the plan)
    let stripe = '';
    for (let k = 0; k < PER; k++) {
      const d = fl.depts[k], a = (W / PER) * k, b = (W / PER) * (k + 1) - 6;
      stripe += poly(d ? d.color : '#3A3A40', Q(a, D, -4), Q(b, D, -4), Q(b, D, -22), Q(a, D, -22));
    }
    let wins = '';
    for (let k = 0; k < 3; k++) { const a = 440 + k * 190, b = a + 120; wins += poly('#3B5470', Q(a, D, -150), Q(b, D, -150), Q(b, D, -228), Q(a, D, -228)) + poly('#22344A', Q(a, D, -150), Q((a + b) / 2, D, -150), Q((a + b) / 2, D, -228), Q(a, D, -228)); }
    for (let k = 0; k < 4; k++) { const a = 70 + k * 230, b = a + 150; wins += poly('#2E4560', Q(W, a, -150), Q(W, b, -150), Q(W, b, -228), Q(W, a, -228)); }
    const label = `FLOOR ${i + 1}`, names = fl.depts.map((d) => d.name).join(' · ');
    const [lx, ly] = Q(36, D, -128);
    const text = `<g transform="matrix(0.8 0.462 0 1 ${f(lx)} ${f(ly)})"><text font-size="34" font-weight="700" letter-spacing="5" fill="#FAF9F5" opacity=".92">${label}</text><text y="30" font-size="21" fill="#D6D4CC" opacity=".62">${esc(cut(names || 'No departments yet', 44))}</text></g>`;
    const aria = `Apartment ${i + 1}: ${fl.depts.length} department${fl.depts.length === 1 ? '' : 's'}, ${fl.working} working`;
    return `<g class="fl" data-f="${i}" tabindex="0" role="button" aria-label="${esc(aria)}">` +
      // faces below the plan
      poly(WD() ? '#5A5349' : '#2A2A2F', Q(0, D), Q(W, D), Q(W, D, -FH), Q(0, D, -FH)) + poly(WD() ? '#413B33' : '#1C1C1F', Q(W, D), Q(W, 0), Q(W, 0, -FH), Q(W, D, -FH)) +
      (WD() ? poly('url(#stoneR)', Q(0, D), Q(W, D), Q(W, D, -FH), Q(0, D, -FH)) + poly('url(#stoneL)', Q(W, D), Q(W, 0), Q(W, 0, -FH), Q(W, D, -FH)) : '') +
      wins + stripe + text +
      poly('#3A3A40', Q(0, D), Q(W, D), Q(W, D, -9), Q(0, D, -9)) + poly('#2E2E33', Q(W, D), Q(W, 0), Q(W, 0, -9), Q(W, D, -9)) +
      // low back walls so the plan reads as a cut-open apartment
      poly('#2A2A2F', Q(0, 0), Q(W, 0), Q(W, 0, 70), Q(0, 0, 70)) + poly('#232327', Q(0, 0), Q(0, D), Q(0, D, 70), Q(0, 0, 70)) +
      poly('#1B1B1E', Q(0, 0), Q(W, 0), Q(W, D), Q(0, D)) +
      `<g transform="${plane}">${rooms}</g>` +
      `<polygon class="fl-hi" points="${pts(Q(0, 0), Q(W, 0), Q(W, D), Q(0, D))}" fill="#fff"/>` +
      `</g>`;
  }

  function build(floors) {
    const n = Math.max(1, floors.length);
    const list = floors.length ? floors : [{ depts: [], total: 0, working: 0 }];
    // ground slab / shadow
    const wd = WD();
    const ground = wd ? `<defs>${wd.defs()}</defs>` :
      `<ellipse cx="600" cy="${f(P(W / 2, D / 2)[1] + 20)}" rx="900" ry="470" fill="#141413" opacity=".16"/>` + poly('#202024', P(-60, -60), P(W + 60, -60), P(W + 60, D + 60), P(-60, D + 60));
    const body = list.map((fl, i) => floorSvg(fl, i)).join('') + '';
    const top = n * FH;
    const minX = P(0, D)[0] - 80, maxX = P(W, 0)[0] + 80, y0 = P(0, 0, top + 90)[1] - 40, y1 = P(W + 60, D + 60)[1] + 40;
    const vbCore = { x: minX, y: y0, w: maxX - minX, h: y1 - y0 };
    const dep = 300, vb = wd ? { x: P(-100, D + 100)[0] - 140, y: y0 - 120, w: P(W + 100, -100)[0] + 140 - (P(-100, D + 100)[0] - 140), h: P(W + 100, D + 100, -dep)[1] + 300 - (y0 - 120) } : vbCore;
    const boxes = list.map((fl, i) => { const e = (i + 1) * FH, ya = P(0, 0, e)[1], yb = P(W, D, e - FH)[1]; return { x: P(0, D)[0], y: ya, w: P(W, 0)[0] - P(0, D)[0], h: yb - ya }; });
    return { inner: `<g id="building">${ground}${body}</g>`, outside: wd ? wd.platform(W, D, 0, 100) + wd.mist(W, D, 0) : '', outsideTop: wd ? wd.gate(700, D, 0, 'VAGENT HQ') + wd.core(W, 0, n * FH + 30) : '', vb, vbCore, boxes };
  }
  window.VBuilding = { build, PER };
})();
