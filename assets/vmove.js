// V Agent City — world navigation + persistent agent movement.  window.VMove   (design: CITY-NAV.md)
// An agent that travels is MANAGED here: its location {lv:'floor'|'street', b, f, x, y} and its route (legs) live in this module and advance on one clock,
// whether or not the floor it is on is on screen. Legs:
//   walk  — A* (VNav) on one floor of the ORIGINAL scene, or on the street grid. On a visible floor the original goTo()/step() walks the agent
//           (Sonic keeps his speed, trails, acceleration and braking); on an unseen floor / the street the same route is simulated at the same speed.
//   ride  — escalator between two floors (scene.js escalator unit): phase A on the floor it leaves, phase B on the floor it arrives on.
//   door  — building entrance (floor 1 gate <-> street).
// The original interiors are never rewritten: floors are built by VScene.build exactly as before (+ the opt-in escalator), office.js only
// gets a few hooks (spawn/walk/put/…). Nothing here writes to the database or invents agents.
(function () {
  'use strict';
  const RIDE_A = 3.0, RIDE_B = 1.2, DOOR_T = 0.45, BASE = 72;
  const st = { H: null, loc: {}, jr: {}, refs: {}, lock: {}, clock: 0, stats: { journeys: 0, legs: 0, recoveries: 0, forced: 0 }, ts: 1, last: 0, log: [] };
  const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const note = (m) => { st.log.push(m); if (st.log.length > 80) st.log.shift(); };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---------- reference floors (built once; same nav on every floor of a building kind) ----------
  const DUMMY = { id: -1, name: 'ref', color: '#888', teams: [], lead_key: null };
  function ref(b) {
    if (st.refs[b]) return st.refs[b];
    const S = VScene.build([DUMMY], undefined, b === 'mk' ? { esc: { hole: true } } : undefined);
    return (st.refs[b] = { S, nav: S.nav, esc: S.esc, gate: S.gate, gateOut: S.gateOut });
  }
  const inv = (sx, sy) => { const a = (sx - 600) / 0.8, b = (sy - 110) / 0.462; return [(a + b) / 2, (b - a) / 2]; };
  // the floor point beside the department lead (Sonic's errand destination) in floor units
  function leadSpot(b) { const S = ref(b).S, r = S.rooms[0], w = inv(r.lead[0], r.lead[1]); return VNav.nearest(S.nav, w[0] - 34, w[1] + 34); }
  function helperHome(b) { const S = ref(b).S, w = inv(S.helper[0], S.helper[1]); return VNav.nearest(S.nav, w[0], w[1]); }

  // ---------- planning ----------
  const speedOf = (key) => (st.H && st.H.speedOf ? st.H.speedOf(key) : BASE);
  function plan(from, to) {
    const legs = []; let cur = { ...from }, bad = null;
    const wf = (b, f, tx, ty) => {
      const nav = ref(b).nav, q = VNav.route(nav, [cur.x, cur.y], [tx, ty]);
      if (q.bad && dist([cur.x, cur.y], [tx, ty]) > 40) { bad = bad || `no floor route ${b} F${f} (${cur.x | 0},${cur.y | 0})->(${tx | 0},${ty | 0})`; return; }
      legs.push({ t: 'walk', lv: 'floor', b, f, to: [tx, ty], pts: q.pts.map((p) => p.slice()), len: q.len, travel: 0 }); cur = { lv: 'floor', b, f, x: tx, y: ty };
    };
    const ws = (tx, ty) => {
      const q = VNav.route(VCity.nav, [cur.x, cur.y], [tx, ty]);
      if (q.bad && dist([cur.x, cur.y], [tx, ty]) > 40) { bad = bad || 'no street route'; return; }
      legs.push({ t: 'walk', lv: 'street', to: [tx, ty], pts: q.pts.map((p) => p.slice()), len: q.len, travel: 0 }); cur = { lv: 'street', x: tx, y: ty };
    };
    const climb = (b, f1) => {
      if (cur.f === f1) return; const e = ref(b).esc; if (!e) { bad = bad || b + ' has no escalator'; return; }
      while (cur.f !== f1 && !bad) {
        const up = f1 > cur.f, f2 = cur.f + (up ? 1 : -1), bd = up ? e.board.up : e.board.down, ar = up ? e.arrive.up : e.arrive.down;
        wf(b, cur.f, bd[0], bd[1]); if (bad) return;
        legs.push({ t: 'ride', b, f0: cur.f, f1: f2, dir: up ? 'up' : 'down' }); cur = { lv: 'floor', b, f: f2, x: ar[0], y: ar[1] };
      }
    };
    const out = () => { const b = cur.b; if (cur.f !== 1) climb(b, 1); if (bad) return; const g = ref(b).gate; wf(b, 1, g[0], g[1]); if (bad) return; const d = VCity.doorPt(b); legs.push({ t: 'door', dir: 'out', b, to: { lv: 'street', x: d[0], y: d[1] } }); cur = { lv: 'street', x: d[0], y: d[1] }; };
    const into = (b) => { const d = VCity.doorPt(b); ws(d[0], d[1]); if (bad) return; const go = ref(b).gateOut; legs.push({ t: 'door', dir: 'in', b, to: { lv: 'floor', b, f: 1, x: go[0], y: go[1] } }); cur = { lv: 'floor', b, f: 1, x: go[0], y: go[1] }; };
    if (cur.lv === 'floor' && to.lv === 'floor' && cur.b === to.b) { climb(to.b, to.f); if (!bad) wf(to.b, to.f, to.x, to.y); }
    else {
      if (cur.lv === 'floor') out();
      if (!bad) { if (to.lv === 'street') ws(to.x, to.y); else { into(to.b); if (!bad) { climb(to.b, to.f); if (!bad) wf(to.b, to.f, to.x, to.y); } } }
    }
    return bad ? { error: bad } : { legs };
  }

  // ---------- managing agents ----------
  const isManaged = (key) => !!st.loc[key];
  const where = (key) => st.loc[key] || null;
  const pointAt = (pts, d) => { let acc = 0; for (let k = 0; k < pts.length - 1; k++) { const L = dist(pts[k], pts[k + 1]); if (acc + L >= d || k === pts.length - 2) { const u = L ? Math.min(1, Math.max(0, (d - acc) / L)) : 1; return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * u, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * u]; } acc += L; } return pts[pts.length - 1]; };
  function agentOf(key) { return st.H.agent(key); }
  function viewIs(b, f) { const v = VCity.st; return v.view === 'floor' && v.b === b && v.n === f; }

  // start managing an agent that is currently standing on a visible floor (element exists) or at its home floor
  function adopt(key, home) {
    if (st.loc[key]) return st.loc[key];
    const g = st.H.take(key), a = agentOf(key); if (!a) return null;
    let l;
    if (g && st.H.posOf(g)) { const p = st.H.posOf(g), v = VCity.st; l = { lv: 'floor', b: v.b, f: v.n, x: p[0], y: p[1] }; }
    else { const h = home || VCity.locate(key); if (!h) return null; const sp = h.b === 'sn' && st.H.isHelper(a) ? helperHome('sn') : ref(h.b).gate; l = { lv: 'floor', b: h.b, f: h.n || 1, x: sp[0], y: sp[1] }; }
    st.loc[key] = l; return l;
  }
  // go(key, to, opts) -> Promise. to = {lv:'floor', b, f, x, y} | {lv:'street', x, y}
  function go(key, to, opts) {
    opts = opts || {}; return new Promise((resolve, reject) => {
      const l = adopt(key, opts.home); if (!l) return reject(new Error('unknown agent ' + key));
      const j = st.jr[key]; if (j) { j.cancel = true; endJourney(key, false); }
      const p = plan(l, to); if (p.error) { note(key + ': ' + p.error); return reject(new Error(p.error)); }
      st.jr[key] = { key, legs: p.legs, i: -1, leg: null, resolve, reject, why: opts.why || '', to, retries: 0 }; st.stats.journeys++; note(key + ' journey: ' + p.legs.map((q) => q.t + (q.dir ? ':' + q.dir : '')).join(' > '));
      nextLeg(st.jr[key]); sync();
    });
  }
  function endJourney(key, ok, err) { const j = st.jr[key]; if (!j) return; delete st.jr[key]; if (j.leg && j.leg.driver === 'scene') { const g = st.H.el(key); if (g) st.H.stop(g); } if (ok) j.resolve(st.loc[key]); else if (err) j.reject(err); }
  function nextLeg(j) {
    j.i++; if (j.i >= j.legs.length) { st.H.say && st.H.say(st.H.el(j.key), ''); const key = j.key; delete st.jr[key]; sync(); j.resolve(st.loc[key]); return; }
    const L = j.legs[j.i]; j.leg = L; L.el = 0; L.started = performance.now(); st.stats.legs++;
    const a = agentOf(j.key);
    if (L.t === 'walk') { L.speed = speedOf(j.key); L.driver = 'sim'; L.travel = 0; if (L.lv === 'floor') { st.loc[j.key] = { lv: 'floor', b: L.b, f: L.f, x: L.pts[0][0], y: L.pts[0][1] }; } else { st.loc[j.key] = { lv: 'street', x: L.pts[0][0], y: L.pts[0][1] }; } }
    else if (L.t === 'ride') { L.phase = 'A'; const l = st.loc[j.key]; l.b = L.b; l.f = L.f0; const k = L.b + L.f0 + L.dir; L.hold = Math.max(0, (st.lock[k] || 0) - st.clock); st.lock[k] = st.clock + L.hold + 1.2; }   // riders board one at a time
    else if (L.t === 'door') { L.fade = 0; }
    sync();
  }
  function finishWalk(j) { const L = j.leg, l = st.loc[j.key]; l.x = L.to[0]; l.y = L.to[1]; if (L.driver === 'scene') { const g = st.H.el(j.key); if (g) st.H.stop(g); } nextLeg(j); }

  // ---------- keeping the visible scene in step with the world ----------
  // called when the view changes, a floor is (re)built, or the world changes: spawn / remove elements, hand legs between the scene walker and the simulation
  function sync() {
    if (!st.H) return;
    for (const key of Object.keys(st.loc)) {
      const l = st.loc[key], j = st.jr[key], L = j && j.leg, a = agentOf(key);
      const here = l.lv === 'floor' && viewIs(l.b, l.f);
      let g = st.H.el(key);
      if (!a) { if (g) st.H.despawn(key); continue; }
      if (here && !(L && L.t === 'door' && L.dir === 'out' && L.el > DOOR_T * 0.5) && !(L && L.t === 'door' && L.dir === 'in' && L.fade < 0.5 && false)) {
        if (!g) { g = st.H.spawn(a, [l.x, l.y]); if (L && L.t === 'walk' && L.lv === 'floor') beginSceneWalk(j, g); }
        else if (L && L.t === 'walk' && L.lv === 'floor' && L.driver !== 'scene') beginSceneWalk(j, g);
      } else if (g) {
        if (L && L.t === 'walk' && L.driver === 'scene') toSim(j, g);
        st.H.despawn(key);
      }
    }
    st.H.street && st.H.street(streetList());
  }
  function beginSceneWalk(j, g) {
    const L = j.leg, l = st.loc[j.key]; L.driver = 'scene'; const p = [l.x, l.y];
    st.H.put(g, p[0], p[1], 0, 1);
    st.H.walk(g, L.to, () => { if (st.jr[j.key] === j && j.leg === L && L.driver === 'scene') finishWalk(j); }, { speed: L.speed });
  }
  function toSim(j, g) {
    const L = j.leg, p = (g && st.H.posOf(g)) || [st.loc[j.key].x, st.loc[j.key].y]; if (g) st.H.stop(g);
    const q = VNav.route(ref(L.b).nav, p, L.to); L.pts = q.pts.map((x) => x.slice()); L.len = q.len; L.travel = 0; L.driver = 'sim'; const l = st.loc[j.key]; l.x = p[0]; l.y = p[1];
  }
  function streetList() { const out = []; for (const key of Object.keys(st.loc)) { const l = st.loc[key]; if (l.lv === 'street') { const j = st.jr[key], L = j && j.leg; out.push({ key, a: agentOf(key), x: l.x, y: l.y, fx: l.fx || 1, moving: !!(L && L.t === 'walk'), speed: L && L.t === 'walk' ? L.speed : 0 }); } } return out; }

  // ---------- the world clock ----------
  function tick(dt) {
    st.clock += dt;
    for (const key of Object.keys(st.jr)) {
      const j = st.jr[key]; if (!j || !j.leg) continue; const L = j.leg, l = st.loc[key], a = agentOf(key); if (!l) continue;
      if (L.t === 'walk') {
        L.el += dt;
        if (L.driver === 'sim') {
          L.travel += L.speed * dt; const p = pointAt(L.pts, Math.min(L.travel, L.len)); const dx = p[0] - l.x, dy = p[1] - l.y;
          if (l.lv === 'street') { const sdx = dx - dy; if (Math.abs(sdx) > 1e-3) l.fx = sdx < 0 ? -1 : 1; }
          l.x = p[0]; l.y = p[1]; if (L.travel >= L.len) finishWalk(j);
        } else {
          const g = st.H.el(key), p = g && st.H.posOf(g); if (p) { l.x = p[0]; l.y = p[1]; }
          else if (!g) { if (l.lv === 'floor' && viewIs(l.b, l.f)) { note(key + ' walker lost on a visible floor: respawn'); st.stats.recoveries++; sync(); } else { note(key + ' walker lost: continue unseen'); st.stats.recoveries++; toSim(j, null); } }
          // watchdog: a scene-driven walk that is far overdue (blocked / rebuilt) is re-planned from where the agent stands; never teleports unless it fails 3 times
          const expect = L.len / L.speed * 3 + 8; if (L.el > expect) { st.stats.recoveries++; j.retries++; note(key + ' recovery #' + j.retries); if (j.retries > 3) { st.stats.forced++; note(key + ' forced to ' + L.to.map((v) => v | 0)); l.x = L.to[0]; l.y = L.to[1]; if (g) st.H.stop(g); finishWalk(j); } else { if (g) toSim(j, g); L.el = 0; } }
        }
      } else if (L.t === 'ride') {
        if (L.hold > 0) { L.hold -= dt; continue; }
        L.el += dt; const e = ref(L.b).esc, tt = L.el;
        if (L.phase === 'A') {
          const u = Math.min(1, tt / RIDE_A), g = st.H.el(key); if (g) rideFrame(g, L, 'A', u, e);
          if (tt >= RIDE_A) { L.phase = 'B'; l.f = L.f1; const ar = L.dir === 'up' ? e.arrive.up : e.arrive.down; l.x = ar[0]; l.y = ar[1]; if (g) st.H.despawn(key); sync(); const g2 = st.H.el(key); if (g2) st.H.pose(g2); }
        }
        if (L.phase === 'B') {
          const u = Math.min(1, Math.max(0, (tt - RIDE_A) / RIDE_B)), g = st.H.el(key); if (g) rideFrame(g, L, 'B', u, e);
          if (tt >= RIDE_A + RIDE_B) { if (g) st.H.put(g, l.x, l.y, 0, 1); nextLeg(j); }
        }
      } else if (L.t === 'door') {
        L.el += dt; const g = st.H.el(key);
        if (L.dir === 'out') {
          if (g && L.el < DOOR_T) st.H.put(g, l.x, l.y, 0, 1 - L.el / DOOR_T);
          if (L.el >= DOOR_T) { if (g) st.H.despawn(key); l.lv = 'street'; l.x = L.to.x; l.y = L.to.y; nextLeg(j); }
        } else {
          if (!L.moved) { L.moved = true; l.lv = 'floor'; l.b = L.b; l.f = 1; l.x = L.to.x; l.y = L.to.y; sync(); }
          const g2 = st.H.el(key); if (g2) st.H.put(g2, l.x, l.y, 0, Math.min(1, L.el / DOOR_T));
          if (L.el >= DOOR_T) { if (g2) st.H.put(g2, l.x, l.y, 0, 1); nextLeg(j); }
        }
      }
    }
    if (st.H.street) st.H.street(streetList());
  }
  // escalator ride, drawn on whichever floor is showing: A = leaving this floor, B = arriving on this floor
  function rideFrame(g, L, ph, u, e) {
    const clamp = (v) => Math.min(1, Math.max(0, v)), ease = (v) => v * v * (3 - 2 * v); let x, h, op = 1; const y = L.dir === 'up' ? e.laneUp : e.laneDn, hr = (xx) => (L.dir === 'up' ? e.H * clamp((xx - e.xa) / (e.xb - e.xa)) : e.H * (1 - clamp((xx - e.xa) / (e.xb - e.xa))));
    if (ph === 'A') {
      const bx = (L.dir === 'up' ? e.board.up : e.board.down)[0];
      if (L.dir === 'up') { x = bx + (e.xb - bx) * ease(u); h = hr(x); op = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1; }
      else { x = bx + (e.xa + 90 - bx) * ease(u); h = -Math.max(0, (x - e.xa)) * 0.4; op = u > 0.45 ? Math.max(0, 1 - (u - 0.45) / 0.35) : 1; }
    } else {
      const ax = (L.dir === 'up' ? e.arrive.up : e.arrive.down)[0];
      if (L.dir === 'up') { const sx = e.xb - 70; x = sx + (ax - sx) * ease(u); h = x < e.xb ? -(1 - (x - sx) / (e.xb - sx)) * 34 : 0; op = clamp(u / 0.35); }
      else { const sx = e.xb - 170; x = sx + (ax - sx) * ease(u); h = hr(Math.min(x, e.xb)); op = clamp(u / 0.3); }
    }
    st.H.put(g, x, y, h, op); st.H.flip(g, 1);
  }

  // ---------- public ----------
  function init(H) {
    st.H = H; if (st.timer) return; const loop = (t) => { requestAnimationFrame(loop); if (document.hidden) return; const dt = Math.min(0.1, st.last ? (t - st.last) / 1000 : 0.016); st.last = t; for (let n = 0; n < st.ts; n++) tick(dt); }; requestAnimationFrame(loop); st.timer = true;
  }
  // give a managed agent back to the original office (it will be placed by sceneRender again)
  function release(key) { const l = st.loc[key]; if (!l) return; delete st.loc[key]; delete st.jr[key]; st.H.release(key); sync(); }
  // home: walk back to the agent's own floor (department entrance), then hand control back to the original scene
  function goHome(key) {
    const h = VCity.locate(key); if (!h) return Promise.reject(new Error('no home for ' + key)); const g = ref(h.b).gate;
    return go(key, { lv: 'floor', b: h.b, f: h.n || 1, x: g[0], y: g[1] - 30 }, { why: 'home' }).then(() => release(key));
  }
  const prune = (keys) => { const set = new Set(keys); for (const k of Object.keys(st.loc)) if (!set.has(k)) { st.H.despawn(k); delete st.loc[k]; delete st.jr[k]; } };
  // test helpers: simulate an interruption (the floor was rebuilt / the walker lost) without telling the world
  function interrupt(key) { const g = st.H.el(key), j = st.jr[key]; if (g && j && j.leg && j.leg.t === 'walk') { st.H.stop(g); g.remove(); } }
  window.VMove = { init, go, goHome, release, adopt, sync, tick, plan, ref, leadSpot, helperHome, isManaged, where, prune, interrupt, st, RIDE_A, RIDE_B, journey: (k) => st.jr[k] };
})();
