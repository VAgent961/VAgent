// Floating Old-World HQ: the shared "outside" of the office, used by the floor view (scene.js) and the tower view (building.js).
// Everything here is decoration only: it never touches the nav data (people never walk on it) and it uses few, reusable shapes
// (patterns, gradients, a tuft symbol). CSS hides it in steps: .fx-deco (tablet and phone), .fx-all (phone).
// Projection is the same as scene.js: X = 600 + 0.8(x - y), Y = 110 + 0.462(x + y) - height.
(function () {
  const P = (x, y, h = 0) => [600 + 0.8 * (x - y), 110 + 0.462 * (x + y) - h];
  const f = (n) => n.toFixed(1);
  const pts = (...a) => a.map((p) => f(p[0]) + ',' + f(p[1])).join(' ');
  const poly = (fill, ...a) => `<polygon points="${pts(...a)}" fill="${fill}"/>`;
  const box = (x0, y0, x1, y1, h, [top, front, side], z = 0) =>
    poly(side, P(x1, y0, z), P(x1, y1, z), P(x1, y1, z + h), P(x1, y0, z + h)) +
    poly(front, P(x0, y1, z), P(x1, y1, z), P(x1, y1, z + h), P(x0, y1, z + h)) +
    poly(top, P(x0, y0, z + h), P(x1, y0, z + h), P(x1, y1, z + h), P(x0, y1, z + h));
  const STONE = ['#8B8275', '#6F675B', '#554F45'], STONE_D = ['#6F675B', '#554F45', '#403B33'];
  const lerp = (a, b, t) => a + (b - a) * t;
  const depth = (W, D) => Math.max(300, Math.min(560, 0.09 * (W + D))); // how far the rock hangs below the ground

  // patterns and gradients shared by both views
  const defs = () => `
  <pattern id="stoneR" width="132" height="52" patternUnits="userSpaceOnUse" patternTransform="skewY(30)"><path d="M0 26H132M0 52H132M0 0H132M44 0V26M110 0V26M22 26V52M88 26V52" stroke="#000" stroke-opacity=".3" stroke-width="2" fill="none"/><rect x="2" y="2" width="40" height="22" fill="#fff" opacity=".05"/><rect x="46" y="28" width="40" height="22" fill="#000" opacity=".07"/><rect x="90" y="2" width="20" height="22" fill="#fff" opacity=".04"/></pattern>
  <pattern id="stoneL" width="132" height="52" patternUnits="userSpaceOnUse" patternTransform="skewY(-30)"><path d="M0 26H132M0 52H132M0 0H132M44 0V26M110 0V26M22 26V52M88 26V52" stroke="#000" stroke-opacity=".3" stroke-width="2" fill="none"/><rect x="2" y="28" width="40" height="22" fill="#fff" opacity=".05"/><rect x="46" y="2" width="40" height="22" fill="#000" opacity=".07"/><rect x="90" y="28" width="20" height="22" fill="#fff" opacity=".04"/></pattern>
  <pattern id="rock" width="110" height="64" patternUnits="userSpaceOnUse"><path d="M0 20L40 12L70 24L110 14M0 52L36 44L74 56L110 46" stroke="#000" stroke-opacity=".28" stroke-width="2" fill="none"/><path d="M20 30L50 36L90 28" stroke="#fff" stroke-opacity=".08" stroke-width="2" fill="none"/></pattern>
  <linearGradient id="stain" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1D1A14" stop-opacity=".5"/></linearGradient>
  <linearGradient id="wglass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6E8FB5"/><stop offset="1" stop-color="#2A3F5C"/></linearGradient>
  <radialGradient id="mist"><stop offset="0" stop-color="#C9D2F2" stop-opacity=".22"/><stop offset="1" stop-color="#C9D2F2" stop-opacity="0"/></radialGradient>
  <radialGradient id="pshadow"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <symbol id="tuft" overflow="visible"><path d="M-7 0 Q-8 -9 -11 -14 Q-5 -9 -3 0 M-2 0 Q-2 -12 0 -18 Q3 -11 3 0 M4 0 Q6 -9 11 -13 Q8 -6 8 0Z" fill="#6F9A6C"/></symbol>`;

  // an arched stone window on a back (y = 0) or left (x = 0) wall; a = start, b = end along the wall, h0..h1 = height on the wall
  const arch = (wall, a, b, h0, h1) => {
    const [X, Y] = wall === 'R' ? P(a, 0, h0) : P(0, a, h0), w = (b - a) * 0.924, H = h1 - h0, r = w / 2, k = H - r;
    const m = wall === 'R' ? '0.866 0.5 0 1' : '-0.866 0.5 0 1';
    const d = `M0 0V${f(-k)}A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(-k)}V0Z`;
    return `<g transform="matrix(${m} ${f(X)} ${f(Y)})"><path d="${d}" fill="url(#wglass)" stroke="#9C9384" stroke-width="7"/><path d="M${f(r)} 0V${f(-H + 4)}M0 ${f(-k)}H${f(w)}" stroke="#4B463E" stroke-width="3"/><rect x="-7" y="0" width="${f(w + 14)}" height="7" fill="#9C9384"/></g>`;
  };

  // outer walls: aged stone with courses, stains, windows, dentil cornice (replaces the dark flat walls)
  const walls = (W, D, fx, H = 100) => {
    let s = poly('#6A6258', P(0, 0), P(W, 0), P(W, 0, H), P(0, 0, H)) + poly('#58514A', P(0, 0), P(0, D), P(0, D, H), P(0, 0, H));
    s += poly('url(#stoneR)', P(0, 0), P(W, 0), P(W, 0, H), P(0, 0, H)) + poly('url(#stoneL)', P(0, 0), P(0, D), P(0, D, H), P(0, 0, H));
    s += poly('url(#stain)', P(0, 0), P(W, 0), P(W, 0, 40), P(0, 0, 40)) + poly('url(#stain)', P(0, 0), P(0, D), P(0, D, 40), P(0, 0, 40));
    // cornice + dentils along both wall tops
    s += poly('#8B8275', P(0, 0, H), P(W, 0, H), P(W, 0, H + 8), P(0, 0, H + 8)) + poly('#7A7165', P(0, 0, H), P(0, D), P(0, D, H + 8), P(0, 0, H + 8));
    s += `<polyline points="${pts(P(0, 0, H - 4), P(W, 0, H - 4))}" stroke="#4B463E" stroke-width="6" stroke-dasharray="9 8" fill="none"/><polyline points="${pts(P(0, 0, H - 4), P(0, D, H - 4))}" stroke="#4B463E" stroke-width="6" stroke-dasharray="9 8" fill="none"/>`;
    for (let x = 120; x < fx - 160; x += 330) s += arch('R', x, x + 100, 30, 92);
    for (let y = 120; y < D - 200; y += 360) s += arch('L', y, y + 110, 30, 92);
    return s;
  };

  // the slab the building stands on: worn stone fascia with a lighter edge line (replaces the dark rim)
  const slab = (W, D, t = 30) =>
    poly('#5E574D', P(0, D), P(W, D), P(W, D, -t), P(0, D, -t)) + poly('#463F37', P(W, D), P(W, 0), P(W, 0, -t), P(W, D, -t)) +
    poly('url(#stoneR)', P(0, D), P(W, D), P(W, D, -t), P(0, D, -t)) + poly('url(#stoneL)', P(W, D), P(W, 0), P(W, 0, -t), P(W, D, -t)) +
    `<polyline points="${pts(P(0, D), P(W, D), P(W, 0))}" stroke="#A39A8B" stroke-width="3" fill="none"/>`;

  // the floating ground: stone and soil, tapering to a rocky underside, with a soft shadow far below.
  // z0 = height of the ground surface (the slab bottom); m = how far it reaches past the building
  const platform = (W, D, z0, m = 80) => {
    const x0 = -m, y0 = -m, x1 = W + m, y1 = D + m, cx = W / 2, cy = D / 2, dep = depth(W, D), sc = Math.max(1, Math.min(1.7, (W + D) / 3600));
    const T = [0, 10, 40, 90, 160].map((v) => v * sc), Z = [0, -22, -22 - (dep - 22) * 0.35, -22 - (dep - 22) * 0.7, -dep];
    const at = (k) => ({ fl: [x0 + T[k], y1 - T[k]], fr: [x1 - T[k], y1 - T[k]], br: [x1 - T[k], y0 + T[k]] });
    const tone = [['#4A3524', '#3A2A1C'], ['#7A7062', '#5E564B'], ['#665D50', '#4E473D'], ['#554D42', '#413B32'], ['#463F36', '#342F28']];
    let s = '';
    const sh = P(cx + 40, cy + 40, z0 - dep - 160);
    s += `<ellipse cx="${f(sh[0])}" cy="${f(sh[1] + 40)}" rx="${f(0.43 * (W + D))}" ry="${f(0.17 * (W + D))}" fill="url(#pshadow)" class="fx-deco"/>`;
    for (let k = 1; k < T.length; k++) {
      const a = at(k - 1), b = at(k), za = z0 + Z[k - 1], zb = z0 + Z[k];
      s += poly(tone[k - 1][0], P(...a.fl, za), P(...a.fr, za), P(...b.fr, zb), P(...b.fl, zb)) + poly(tone[k - 1][1], P(...a.fr, za), P(...a.br, za), P(...b.br, zb), P(...b.fr, zb));
    }
    const e = at(4), zE = z0 + Z[4];
    // rock texture over both faces, and a few hanging stones at the bottom
    s += `<polygon points="${pts(P(...at(0).fl, z0 + Z[0]), P(...at(0).fr, z0), P(...at(0).br, z0), P(...e.br, zE), P(...e.fr, zE), P(...e.fl, zE))}" fill="url(#rock)" opacity=".7"/>`;
    for (const [t, len] of [[0.15, 70 * sc], [0.38, 110 * sc], [0.6, 60 * sc], [0.82, 90 * sc]]) {
      const bx = lerp(e.fl[0], e.fr[0], t), by = lerp(e.fl[1], e.fr[1], t); s += poly('#342F28', P(bx - 26, by, zE), P(bx + 26, by, zE), P(bx + 4, by + 4, zE - len));
    }
    s += poly('#4B5B48', P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)) + poly('#6A6358', P(-34, -34, z0), P(W + 34, -34, z0), P(W + 34, D + 34, z0), P(-34, D + 34, z0));
    // soil + grass lip on the top edge, then tufts along the near edges
    s += poly('#4A3524', P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z0 - 22), P(x0, y1, z0 - 22)) + poly('#3A2A1C', P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z0 - 22), P(x1, y1, z0 - 22));
    s += poly('#5F8560', P(x0, y1 - 18, z0), P(x1, y1 - 18, z0), P(x1, y1, z0), P(x0, y1, z0)) + poly('#527552', P(x1 - 18, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x1 - 18, y1, z0));
    let t = ''; for (let x = x0 + 60; x < x1 - 20; x += 170) { const [X, Y] = P(x, y1 - 6, z0); t += `<use href="#tuft" x="${f(X)}" y="${f(Y)}"/>`; }
    for (let y = y0 + 90; y < y1 - 40; y += 190) { const [X, Y] = P(x1 - 8, y, z0); t += `<use href="#tuft" x="${f(X)}" y="${f(Y)}"/>`; }
    return s + `<g class="fx-deco">${t}</g>`;
  };

  // mist and a few clouds drifting around the base (a handful of soft ellipses)
  const mist = (W, D, z0) => {
    const spots = [[W * 0.1, D * 1.05, 520, 90], [W * 0.95, D * 0.7, 430, 80], [W * 0.5, D * 1.18, 700, 110], [-60, D * 0.4, 380, 70]];
    return `<g class="fx-deco" pointer-events="none">${spots.map(([x, y, rx, ry]) => { const [X, Y] = P(x, y, z0 - 120); return `<ellipse cx="${f(X)}" cy="${f(Y)}" rx="${rx}" ry="${ry}" fill="url(#mist)"/>`; }).join('')}</g>`;
  };

  // lantern post: stone base, iron pole, warm glow
  const lantern = (x, y, z) => { const [X, Y] = P(x, y, z); return `<g transform="translate(${f(X)} ${f(Y)})"><ellipse rx="22" ry="8" cy="-70" fill="url(#glow)"/><rect x="-5" y="-12" width="10" height="12" fill="#6F675B"/><rect x="-1.5" y="-64" width="3" height="52" fill="#2A2B2F"/><rect x="-6" y="-78" width="12" height="16" rx="3" fill="#F7D9A8"/><path d="M-8 -78 L0 -86 L8 -78Z" fill="#2A2B2F"/></g>`; };

  // entrance gate on the front edge (y = D) at x: steps up from the ground, two pilasters, a lintel with the name plate, lanterns, and a runner carpet on the floor
  const gate = (x, D, z0, label) => {
    const w = 190, x0 = x - w / 2, x1 = x + w / 2; let s = '';
    s += box(x0 - 10, D + 4, x1 + 10, D + 40, 10, STONE, z0) + box(x0 + 8, D + 4, x1 - 8, D + 22, 10, STONE, z0 + 10);
    s += box(x0 - 4, D + 2, x0 + 16, D + 22, 110, STONE, z0 + 20) + box(x1 - 16, D + 2, x1 + 4, D + 22, 110, STONE, z0 + 20);
    s += box(x0 - 8, D + 2, x1 + 8, D + 22, 14, STONE_D, z0 + 130);
    const [lx, ly] = P(x - 70, D + 22, z0 + 142);
    s += `<g transform="matrix(0.866 0.5 0 1 ${f(lx)} ${f(ly)})"><text x="0" y="-6" font-family="Newsreader, Georgia, serif" font-size="17" font-weight="600" letter-spacing="2" fill="#E9DCC3">${label}</text></g>`;
    s += lantern(x0 - 30, D + 30, z0) + lantern(x1 + 30, D + 30, z0);
    return s;
  };

  // stairwell and elevator core standing at the right corner: a tall stone tower with a lift door and a roof cap
  const core = (W, z0, h = 260) => {
    const x0 = W + 6, x1 = W + 78, y0 = 6, y1 = 86; let s = box(x0, y0, x1, y1, h, STONE, z0);
    s += poly('url(#stoneR)', P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z0 + h), P(x0, y1, z0 + h)) + poly('url(#stoneL)', P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z0 + h), P(x1, y0, z0 + h));
    s += poly('#2A2B2F', P(x0 + 14, y1, z0), P(x1 - 14, y1, z0), P(x1 - 14, y1, z0 + 74), P(x0 + 14, y1, z0 + 74)) + poly('#B9BEC6', P(x0 + 20, y1, z0), P(x0 + 36, y1, z0), P(x0 + 36, y1, z0 + 68), P(x0 + 20, y1, z0 + 68)) + poly('#9AA0A9', P(x0 + 38, y1, z0), P(x1 - 20, y1, z0), P(x1 - 20, y1, z0 + 68), P(x0 + 38, y1, z0 + 68));
    s += poly('#F7D9A8', P(x0 + 20, y1, z0 + 82), P(x1 - 20, y1, z0 + 82), P(x1 - 20, y1, z0 + 90), P(x0 + 20, y1, z0 + 90));
    for (let k = 0; k < 3; k++) { const zz = z0 + 120 + k * 46; s += poly('#2A3F5C', P(x0 + 26, y1, zz), P(x1 - 26, y1, zz), P(x1 - 26, y1, zz + 28), P(x0 + 26, y1, zz + 28)); }
    s += box(x0 - 6, y0 - 6, x1 + 6, y1 + 6, 12, STONE_D, z0 + h);
    const [sx, sy] = P(x0 + 6, y1, z0 + 104);
    s += `<g transform="matrix(0.866 0.5 0 1 ${f(sx)} ${f(sy)})"><rect x="0" y="-18" width="62" height="20" rx="3" fill="#141413" stroke="#55555C"/><text x="31" y="-4" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="1.5" fill="#D6D4CC">LIFT · STAIRS</text></g>`;
    return s;
  };

  // a green EXIT sign on a back wall at x, and a framed picture
  const exitSign = (x, h = 74) => { const [X, Y] = P(x, 0, h); return `<g transform="matrix(0.866 0.5 0 1 ${f(X)} ${f(Y)})" style="display:var(--dt,inline)"><rect x="0" y="-12" width="34" height="14" rx="2" fill="#0F3D24" stroke="#3FD07A" stroke-width="1"/><text x="17" y="-2" text-anchor="middle" font-size="9" font-weight="700" letter-spacing="1" fill="#7DF0A8">EXIT</text></g>`; };
  const frame = (x, h, w = 46, ht = 30, tone = '#B5532F') => { const [X, Y] = P(x, 0, h); return `<g transform="matrix(0.866 0.5 0 1 ${f(X)} ${f(Y)})" style="display:var(--dt,inline)"><rect x="0" y="${-ht}" width="${w}" height="${ht}" fill="#2A2420" stroke="#8B7B5E" stroke-width="2.5"/><rect x="4" y="${-ht + 4}" width="${w - 8}" height="${ht - 8}" fill="${tone}" opacity=".65"/><path d="M4 ${-6} L${w * 0.4} ${-ht * 0.55} L${w * 0.62} ${-12} L${w - 4} ${-ht * 0.45} V${-4} H4Z" fill="#141413" opacity=".5"/></g>`; };

  window.VWorld = { depth, defs, walls, slab, platform, mist, gate, core, exitSign, frame, lantern, P };
})();
