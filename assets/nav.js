// Walkable-floor navigation for the office: a coarse grid over the floor plan, A*, path smoothing. All in WORLD coordinates (see scene.js).
// VScene.build() gives nav = { W, D, rects[[x0,y0,x1,y1]] (walls + furniture), doors[{x,y,hz,w}] }. VNav.route(nav, a, b) -> { pts, len, hs, he }:
// pts is the polyline to walk; the first hs / last he units are the "stand up" / "step in" hops to and from a seat or a spot inside furniture.
(function () {
  const CELL = 8, INF = 5, SQ = Math.SQRT2, ROUND = 10; // INF: furniture and walls are grown by this much (half a person's width)

  function grid(nav) {
    if (nav.grid) return nav.grid;
    const w = Math.ceil(nav.W / CELL), h = Math.ceil(nav.D / CELL), n = w * h, blocked = new Uint8Array(n);
    const mark = (x0, y0, x1, y1, r) => {
      const i0 = Math.max(0, Math.floor((x0 - r) / CELL - 0.5)), i1 = Math.min(w - 1, Math.ceil((x1 + r) / CELL - 0.5));
      const j0 = Math.max(0, Math.floor((y0 - r) / CELL - 0.5)), j1 = Math.min(h - 1, Math.ceil((y1 + r) / CELL - 0.5));
      for (let j = j0; j <= j1; j++) { const cy = (j + 0.5) * CELL; if (cy < y0 - r || cy > y1 + r) continue;
        for (let i = i0; i <= i1; i++) { const cx = (i + 0.5) * CELL; if (cx >= x0 - r && cx <= x1 + r) blocked[j * w + i] = 1; } }
    };
    for (const r of nav.rects) mark(r[0], r[1], r[2], r[3], INF);
    mark(-60, -60, nav.W + 60, 4, INF); mark(-60, -60, 4, nav.D + 60, INF); mark(nav.W - 4, -60, nav.W + 60, nav.D + 60, INF); mark(-60, nav.D - 4, nav.W + 60, nav.D + 60, INF);
    // connected floor: the biggest open region is "the office"; pockets walled in by furniture are never routed to
    const comp = new Int32Array(n), q = new Int32Array(n); let best = 0, bestN = 0, id = 0;
    for (let s = 0; s < n; s++) {
      if (blocked[s] || comp[s]) continue;
      id++; let a = 0, b = 0; q[b++] = s; comp[s] = id;
      while (a < b) { const c = q[a++], i = c % w, j = (c / w) | 0;
        if (i > 0 && !blocked[c - 1] && !comp[c - 1]) { comp[c - 1] = id; q[b++] = c - 1; }
        if (i < w - 1 && !blocked[c + 1] && !comp[c + 1]) { comp[c + 1] = id; q[b++] = c + 1; }
        if (j > 0 && !blocked[c - w] && !comp[c - w]) { comp[c - w] = id; q[b++] = c - w; }
        if (j < h - 1 && !blocked[c + w] && !comp[c + w]) { comp[c + w] = id; q[b++] = c + w; } }
      if (b > bestN) { bestN = b; best = id; }
    }
    return (nav.grid = { w, h, n, blocked, comp, main: best, cache: new Map(), gs: null });
  }

  const cellAt = (g, x, y) => [Math.min(g.w - 1, Math.max(0, Math.floor(x / CELL))), Math.min(g.h - 1, Math.max(0, Math.floor(y / CELL)))];
  const open = (g, i, j) => i >= 0 && j >= 0 && i < g.w && j < g.h && !g.blocked[j * g.w + i];
  // nearest cell of the office floor to a world point (rings of growing size); null if none within ~150 units
  function snap(g, x, y) {
    const [ci, cj] = cellAt(g, x, y); let best = null, bd = Infinity;
    for (let r = 0; r <= 18; r++) {
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (r && Math.abs(i - ci) !== r && Math.abs(j - cj) !== r) continue;
        if (i < 0 || j < 0 || i >= g.w || j >= g.h || g.comp[j * g.w + i] !== g.main) continue;
        const d = ((i + 0.5) * CELL - x) ** 2 + ((j + 0.5) * CELL - y) ** 2; if (d < bd) { bd = d; best = [i, j]; }
      }
      if (best && Math.sqrt(bd) <= r * CELL) break; // nothing in a bigger ring can be nearer
    }
    return best;
  }
  const centre = (c) => [(c[0] + 0.5) * CELL, (c[1] + 0.5) * CELL];
  // is the straight line between two world points all open floor?
  function clear(g, x0, y0, x1, y1) {
    const L = Math.hypot(x1 - x0, y1 - y0), k = Math.max(1, Math.ceil(L / 3));
    for (let s = 0; s <= k; s++) { const t = s / k, c = cellAt(g, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t); if (g.blocked[c[1] * g.w + c[0]]) return false; }
    return true;
  }

  function astar(g, si, sj, ti, tj) {
    const w = g.w, n = g.n;
    if (!g.gs) { g.gs = new Float32Array(n); g.seen = new Uint32Array(n); g.par = new Int32Array(n); g.hi = new Int32Array(n * 3); g.hf = new Float32Array(n * 3); g.closed = new Uint32Array(n); g.run = 0; }
    const run = ++g.run, { gs, seen, par, hi, hf, closed, blocked } = g, cap = hi.length; let hs = 0;
    const push = (c, f) => { let k = hs++; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hi[k] = hi[p]; hf[k] = hf[p]; k = p; } hi[k] = c; hf[k] = f; };
    const pop = () => { const top = hi[0], c = hi[--hs], f = hf[hs]; let k = 0; for (;;) { let l = 2 * k + 1; if (l >= hs) break; if (l + 1 < hs && hf[l + 1] < hf[l]) l++; if (hf[l] >= f) break; hi[k] = hi[l]; hf[k] = hf[l]; k = l; } hi[k] = c; hf[k] = f; return top; };
    const hh = (i, j) => { const dx = Math.abs(i - ti), dy = Math.abs(j - tj); return 1.8 * (dx + dy + (SQ - 2) * Math.min(dx, dy)); };
    const s = sj * w + si, t = tj * w + ti; gs[s] = 0; seen[s] = run; par[s] = -1; push(s, hh(si, sj));
    while (hs > 0 && hs < cap - 8) {
      const c = pop(); if (closed[c] === run) continue; closed[c] = run;
      if (c === t) { const out = []; for (let k = t; k !== -1; k = par[k]) out.push(k); return out.reverse(); }
      const i = c % w, j = (c / w) | 0, gc = gs[c];
      for (let d = 0; d < 8; d++) {
        const ni = i + (d === 0 || d === 4 || d === 5 ? -1 : d === 1 || d === 6 || d === 7 ? 1 : 0), nj = j + (d === 2 || d === 4 || d === 6 ? -1 : d === 3 || d === 5 || d === 7 ? 1 : 0);
        if (ni < 0 || nj < 0 || ni >= w || nj >= g.h) continue;
        const nc = nj * w + ni; if (blocked[nc] || closed[nc] === run) continue;
        if (d > 3 && (blocked[j * w + ni] || blocked[nj * w + i])) continue; // no cutting corners
        const ng = gc + (d > 3 ? SQ : 1);
        if (seen[nc] !== run || ng < gs[nc]) { seen[nc] = run; gs[nc] = ng; par[nc] = c; push(nc, ng + hh(ni, nj)); }
      }
    }
    return null;
  }

  // drop waypoints that a straight line can skip, then round the corners a little (never more than ROUND * .3 off the line, well inside INF)
  function smooth(g, pts) {
    const out = [pts[0]]; let a = 0;
    while (a < pts.length - 1) { let b = a + 1; while (b + 1 < pts.length && clear(g, pts[a][0], pts[a][1], pts[b + 1][0], pts[b + 1][1])) b++; out.push(pts[b]); a = b; } // reach as far as the eye can see, then turn
    if (out.length < 3) return out;
    const r = [out[0]];
    for (let k = 1; k < out.length - 1; k++) {
      const p = out[k - 1], v = out[k], nx = out[k + 1], l1 = Math.hypot(p[0] - v[0], p[1] - v[1]), l2 = Math.hypot(nx[0] - v[0], nx[1] - v[1]), d = Math.min(ROUND, l1 / 2, l2 / 2);
      if (d < 2) { r.push(v); continue; }
      const A = [v[0] + (p[0] - v[0]) / l1 * d, v[1] + (p[1] - v[1]) / l1 * d], B = [v[0] + (nx[0] - v[0]) / l2 * d, v[1] + (nx[1] - v[1]) / l2 * d], M = [A[0] * 0.25 + v[0] * 0.5 + B[0] * 0.25, A[1] * 0.25 + v[1] * 0.5 + B[1] * 0.25];
      if (clear(g, A[0], A[1], M[0], M[1]) && clear(g, M[0], M[1], B[0], B[1])) r.push(A, M, B); else r.push(v);
    }
    r.push(out[out.length - 1]); return r;
  }

  // a -> b in world units. Start/end inside furniture (a chair, a spot beside a table) hop to the nearest open floor first/last.
  function route(nav, a, b) {
    const g = grid(nav), sa = snap(g, a[0], a[1]), sb = snap(g, b[0], b[1]);
    if (!sa || !sb) return { pts: [a, b], len: Math.hypot(b[0] - a[0], b[1] - a[1]), hs: 0, he: 0, bad: true };
    const key = sa[0] + ',' + sa[1] + '>' + sb[0] + ',' + sb[1]; let mid = g.cache.get(key);
    if (!mid) {
      const cells = astar(g, sa[0], sa[1], sb[0], sb[1]); if (!cells) return { pts: [a, b], len: Math.hypot(b[0] - a[0], b[1] - a[1]), hs: 0, he: 0, bad: true };
      mid = smooth(g, cells.map((c) => centre([c % g.w, (c / g.w) | 0])));
      if (g.cache.size > 3000) g.cache.clear(); g.cache.set(key, mid);
    }
    const s0 = mid[0], e0 = mid[mid.length - 1], pts = [], hs = Math.hypot(s0[0] - a[0], s0[1] - a[1]), he = Math.hypot(b[0] - e0[0], b[1] - e0[1]);
    if (hs > 0.5) pts.push(a); for (const p of mid) pts.push(p); if (he > 0.5) pts.push(b);
    let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    return { pts, len, hs: hs > 0.5 ? hs : 0, he: he > 0.5 ? he : 0 };
  }
  const nearest = (nav, x, y) => { const g = grid(nav), c = snap(g, x, y); return c ? centre(c) : [x, y]; };
  // which door (if any) the point is standing in: used to slow down in doorways and to let one person through at a time
  const doorAt = (nav, x, y) => { const D = nav.doors; for (let k = 0; k < D.length; k++) { const d = D[k], hw = d.hz ? d.w / 2 : 18, hh = d.hz ? 18 : d.w / 2; if (Math.abs(x - d.x) <= hw && Math.abs(y - d.y) <= hh) return k; } return -1; };
  const rawBlocked = (nav, x, y) => nav.rects.some((r) => x > r[0] && x < r[2] && y > r[1] && y < r[3]);

  // debug (?nav=1): one translucent picture of the grid (blocked cells red, doors green) in the floor plane
  function debugImage(nav) {
    const g = grid(nav), cv = document.createElement('canvas'); cv.width = g.w; cv.height = g.h; const cx = cv.getContext('2d'), im = cx.createImageData(g.w, g.h);
    for (let k = 0; k < g.n; k++) { const o = k * 4; if (g.blocked[k]) { im.data[o] = 220; im.data[o + 1] = 60; im.data[o + 2] = 40; im.data[o + 3] = 120; } else if (g.comp[k] !== g.main) { im.data[o] = 240; im.data[o + 1] = 200; im.data[o + 2] = 0; im.data[o + 3] = 90; } }
    cx.putImageData(im, 0, 0); return cv.toDataURL();
  }
  window.VNav = { CELL, INF, grid, route, nearest, doorAt, rawBlocked, clear: (nav, a, b) => clear(grid(nav), a[0], a[1], b[0], b[1]), debugImage };
})();
