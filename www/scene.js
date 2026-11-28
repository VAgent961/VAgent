// One set of 144 blocks that reorganises as the visitor scrolls. Formation index = section data-formation:
// 0 loose parts · 1 layered application · 2 design system grid · 3 agent pipeline · 4 server racks · 5 one calm ring
import * as T from './vendor/three.bundle.min.js';

const N = 144, TAU = Math.PI * 2;
const INK = '#2A2825', CREAM = '#F6F2E8', SAND = '#D9D1BF', CLAY = '#B5532F', PEACH = '#E39873', STONE = '#9C958A', GREEN = '#3F8F6B';
const rand = (i, s = 0) => { const x = Math.sin((i + 1) * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => t * t * (3 - 2 * t);

// camera direction (isometric-like). Flat formations are turned to face it.
const AZ = 0.62, EL = 0.46;
const DIR = new T.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
const FACE = new T.Quaternion().setFromEuler(new T.Euler(-EL * 0.8, AZ * 0.8, 0, 'YXZ'));

// pipeline path: trigger -> agent -> rules -> owner approval -> publish
const STATIONS = [[-4.6, -1.6, 1.6], [-2.4, 0.2, -1.2], [0, -0.4, 1.0], [2.3, 0.9, -0.9], [4.6, 0, 1.2]].map((p) => new T.Vector3(...p));
const PATH = new T.CatmullRomCurve3(STATIONS);
const PULSES = 9; // the last 144 - 135 blocks travel along the path

function formation(k, i) {
  const p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(1, 1, 1);
  let c = CREAM;
  if (k === 0) {
    const a = i * 2.39996, y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), d = 3.2 + rand(i, 1) * 1.5;
    p.set(Math.cos(a) * r * d, y * d * 0.82, Math.sin(a) * r * d);
    q.setFromEuler(new T.Euler(rand(i, 2) * TAU, rand(i, 3) * TAU, 0));
    const z = 0.2 + rand(i, 4) ** 2 * 0.65; s.set(z, z, z);
    c = [CREAM, CREAM, SAND, SAND, CLAY, INK, PEACH, CREAM][i % 8];
  } else if (k === 1) {
    const layer = Math.floor(i / 36), n = i % 36, x = n % 6, z = Math.floor(n / 6);
    p.set((x - 2.5) * 1.05, (layer - 1.5) * 1.75, (z - 2.5) * 1.05);
    s.set(0.96, layer === 3 && (x < 2 || z === 0) ? 0.5 : 0.26, 0.96);
    c = [INK, STONE, SAND, CREAM][layer];
    if (layer === 3 && (z === 0 || (x < 2 && z < 3))) c = CLAY;
  } else if (k === 2) {
    const x = i % 12, y = Math.floor(i / 12);
    // swatch columns on top, type bars in the middle, components below
    let col = CREAM, w = 0.66, h = 0.66, d = 0.22;
    if (y >= 9) { col = [INK, INK, '#57534B', '#57534B', STONE, STONE, SAND, SAND, PEACH, PEACH, CLAY, CLAY][x]; w = h = 0.7; }
    else if (y >= 5) { const len = [11, 7, 9, 5][8 - y]; col = x < len ? (y === 8 ? INK : '#6E695F') : SAND; w = x < len ? 0.72 : 0.12; h = x < len ? (y === 8 ? 0.5 : 0.24) : 0.12; d = 0.14; }
    else { const card = Math.floor(x / 4), btn = y === 1 && x % 4 > 0 && x % 4 < 3; col = btn ? CLAY : y === 4 ? [INK, CLAY, INK][card] : [SAND, STONE, SAND][card]; w = x % 4 === 3 ? 0.55 : 0.74; h = y === 4 ? 0.4 : 0.7; d = btn ? 0.55 : 0.18; }
    p.set((x - 5.5) * 0.7, (y - 5.5) * 0.7, y === 1 && x % 4 > 0 && x % 4 < 3 ? 0.25 : 0).applyQuaternion(FACE);
    q.copy(FACE); s.set(w, h, d); c = col;
  } else if (k === 3) {
    if (i >= N - PULSES) { PATH.getPoint((i - (N - PULSES)) / PULSES, p); s.setScalar(0.28); c = CLAY; }
    else {
      const st = i % 5, n = Math.floor(i / 5), o = STATIONS[st];
      p.set(o.x + ((n % 3) - 1) * 0.43, o.y - 0.9 + Math.floor(n / 9) * 0.43, o.z + ((Math.floor(n / 3) % 3) - 1) * 0.43);
      s.setScalar(0.39); c = st === 3 ? (n % 4 ? CLAY : PEACH) : [INK, CREAM, SAND, CLAY, STONE][st];
    }
  } else if (k === 4) {
    const rack = i % 4, n = Math.floor(i / 4), col = n % 2, row = Math.floor(n / 2); // 4 racks, 2 x 18 units
    p.set((rack - 1.5) * 2.35 + (col - 0.5) * 0.9, (row - 8.5) * 0.34, (rack % 2) * -0.7);
    s.set(0.84, 0.25, 1.35);
    c = rand(i, 7) > 0.9 ? CLAY : rand(i, 8) > 0.92 ? GREEN : row % 3 ? INK : STONE;
  } else {
    const ring = i < 96 ? 0 : 1, n = ring ? i - 96 : i, count = ring ? 48 : 96, a = (n / count) * TAU, r = ring ? 3.1 : 4.7;
    p.set(Math.cos(a) * r, Math.sin(a * (ring ? 2 : 3)) * 0.35 - (ring ? 0.4 : 1), Math.sin(a) * r);
    q.setFromEuler(new T.Euler(0, -a, 0));
    s.set(0.42, ring ? 0.42 : 0.3 + (n % 3) * 0.12, 0.22);
    c = ring ? (n % 6 ? SAND : CLAY) : (n % 12 ? CREAM : INK);
  }
  return { p, q, s, c: new T.Color(c) };
}
const RADIUS = [5.9, 5.1, 5.4, 5.5, 5.6, 5.3];

export function createScene(canvas, { onLost } = {}) {
  const small = matchMedia('(max-width: 860px), (pointer: coarse)').matches;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: !navigator.webdriver });
  renderer.toneMapping = T.NeutralToneMapping;
  let dpr = Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75);
  let shadows = !small;
  renderer.shadowMap.enabled = shadows; renderer.shadowMap.type = T.PCFShadowMap;

  const scene = new T.Scene(), camera = new T.PerspectiveCamera(28, 1, 0.1, 100), world = new T.Group();
  scene.add(world, new T.HemisphereLight('#FFF9EE', '#8D7F6C', 2.1));
  const sun = new T.DirectionalLight('#FFF3E2', 2.2);
  sun.position.set(-4, 10, 6); sun.castShadow = shadows;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.radius = 5; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  scene.add(sun);
  const floor = new T.Mesh(new T.PlaneGeometry(40, 40), new T.ShadowMaterial({ opacity: 0.11 }));
  floor.rotation.x = -Math.PI / 2; floor.material.opacity = 0.09; floor.position.y = -4.4; floor.receiveShadow = true; scene.add(floor);

  const blocks = new T.InstancedMesh(new T.RoundedBoxGeometry(1, 1, 1, small ? 1 : 2, 0.12), new T.MeshStandardMaterial({ roughness: 0.55, metalness: 0.04 }), N);
  blocks.castShadow = blocks.receiveShadow = true; blocks.frustumCulled = false;
  blocks.instanceMatrix.setUsage(T.DynamicDrawUsage); world.add(blocks);
  const tubeMat = new T.MeshBasicMaterial({ color: CLAY, transparent: true, opacity: 0 });
  const tube = new T.Mesh(new T.TubeGeometry(PATH, 120, 0.04, 6), tubeMat); tube.position.y = -0.45; world.add(tube);

  const forms = Array.from({ length: 6 }, (_, k) => Array.from({ length: N }, (_, i) => formation(k, i)));
  const o = new T.Object3D(), color = new T.Color(), along = new T.Vector3();
  let w = 0, h = 0, shown = -1, time = 0, drawn = '', px = 0, py = 0, tx = 0, ty = 0, slow = 0, count = 0;

  if (matchMedia('(pointer: fine)').matches) addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost?.(); });

  function resize() {
    const nw = canvas.clientWidth, nh = canvas.clientHeight;
    if (nw === w && nh === h) return false;
    w = nw; h = nh; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); camera.aspect = w / h; return true;
  }

  // fit the formation into its region: right part on wide screens, top part on tall ones
  function frameCamera(p) {
    const wide = !(w <= 860 || (h > w && w <= 1100)), landscapePhone = h <= 520 && w > h;
    const side = wide || landscapePhone;
    const closing = clamp(p - 4);
    const region = side ? { x: w * (landscapePhone ? 0.77 : 0.73), y: h * 0.53, w: w * (landscapePhone ? 0.44 : 0.5), h: h * 0.84 } : { x: w * 0.5, y: 64 + (h * 0.46 - 64) * 0.52, w: w * 0.96, h: h * 0.46 - 64 };
    const k = Math.min(Math.floor(p), 4), r = RADIUS[k] + (RADIUS[k + 1] - RADIUS[k]) * (p - k);
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max((r * h) / (t * region.w), (r * 0.9 * h) / (t * region.h)) * (1 + closing * 0.04);
    camera.position.copy(DIR).multiplyScalar(dist); camera.lookAt(0, 0, 0);
    camera.setViewOffset(w, h, w / 2 - region.x, h / 2 - region.y, w, h);
  }

  function pose(p, moving) {
    const k = Math.min(Math.floor(p), 4), f = p - k, A = forms[k], B = forms[k + 1];
    const pipe = clamp(1 - Math.abs(p - 3) * 2.2), loose = clamp(1 - p);
    for (let i = 0; i < N; i++) {
      const a = A[i], b = B[i], d = rand(i, 9) * 0.32, t = ease(clamp((f - d) / 0.68));
      o.position.lerpVectors(a.p, b.p, t);
      o.position.y += Math.sin(t * Math.PI) * (0.35 + rand(i, 10) * 0.9);
      o.quaternion.slerpQuaternions(a.q, b.q, t);
      o.scale.lerpVectors(a.s, b.s, t);
      if (loose > 0) o.position.y += Math.sin(time * 0.7 + i) * 0.12 * loose;
      if (pipe > 0 && i >= N - PULSES) { PATH.getPoint((time * 0.09 + (i - (N - PULSES)) / PULSES) % 1, along); o.position.lerp(along.setY(along.y - 0.45), pipe); }
      o.updateMatrix(); blocks.setMatrixAt(i, o.matrix);
      blocks.setColorAt(i, color.lerpColors(a.c, b.c, t));
    }
    blocks.instanceMatrix.needsUpdate = true; blocks.instanceColor.needsUpdate = true;
    tubeMat.opacity = pipe * 0.75; tube.visible = pipe > 0.01;
    // the loose cloud and the closing ring turn slowly; working formations only sway
    const spin = loose * time * 0.06 + clamp(p - 4) * time * 0.05;
    const sway = moving && p > 0.5 && p < 4.5 ? Math.sin(time * 0.25) * 0.06 : 0;
    world.rotation.set(py * 0.12, spin + sway + px * 0.22 + Math.sin((p % 1) * Math.PI) * 0.18, 0);
  }

  // called every tick; draws only when something changed (reduced motion and paused = still pictures)
  function frame(dt, state, force = false) {
    const resized = resize(), moving = !state.paused && !state.reduced;
    const target = state.reduced ? Math.round(state.target) : state.target;
    if (shown < 0 || !moving) shown = target; else shown += (target - shown) * (1 - Math.exp(-dt * 7));
    if (Math.abs(target - shown) < 0.0005) shown = target;
    if (moving) { time += dt; px += (tx - px) * Math.min(1, dt * 3); py += (ty - py) * Math.min(1, dt * 3); }
    const key = `${shown.toFixed(4)}|${moving ? time : 0}`;
    if (!force && !resized && key === drawn) return;
    drawn = key; pose(shown, moving); frameCamera(shown); renderer.render(scene, camera);
    // adaptive quality: sustained slow frames lower resolution, then drop shadows
    if (moving && dt > 0) {
      slow += dt > 0.024 ? 1 : 0;
      if (++count === 120) {
        if (slow > 60 && (dpr > 1 || shadows)) {
          if (dpr > 1) dpr = Math.max(1, dpr - 0.35); else { shadows = false; sun.castShadow = false; floor.visible = false; }
          w = 0;
        }
        slow = count = 0;
      }
    }
  }

  // transparent still of one formation (fallback images); draws and reads in the same task
  function still(k, rw, rh) {
    renderer.setPixelRatio(1); renderer.setSize(rw, rh, false); camera.aspect = rw / rh;
    w = rw; h = rh; time = 4; px = py = 0; pose(k, false);
    const t = Math.tan((camera.fov * Math.PI) / 360);
    camera.clearViewOffset(); camera.updateProjectionMatrix();
    camera.position.copy(DIR).multiplyScalar((RADIUS[k] * 0.98) / (t * Math.min(1, rw / rh))); camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    const url = canvas.toDataURL('image/webp', 0.86); w = 0; drawn = '';
    return url;
  }

  return { frame, still, info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, dpr, shadows }) };
}
