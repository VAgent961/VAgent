// Builds a complete world from a parameter set, for a video that has no hand-made world yet (see newworld.py).
import { W, H, fill, box, pop, cells, rng, ease, hex } from './lib.mjs';
const PALETTES = [ // [background, stripe, accent, soft, light theme]
  ['#241238', '#33204D', '#F29E6D', '#C7B2FF', 0], ['#06303A', '#0B4350', '#5FD7C6', '#E9FFF9', 0], ['#33141A', '#471F27', '#F6B65C', '#FFE5C7', 0],
  ['#101B3D', '#1A2A57', '#FF8E72', '#BFD0FF', 0], ['#1D2612', '#2A361B', '#C8E06A', '#F2FFD0', 0], ['#EAF1F4', '#D6E4EA', '#B5532F', '#3E7C8C', 1], ['#F7E9EE', '#EDD5DE', '#B5532F', '#7A4A8C', 1]];
const MOTIFS = [
  (p, t, [, , a, s]) => { for (let i = 0; i < 6; i++) { const q = (t * .12 + i / 6) % 1; p.ring(i % 2 ? 250 : 20, 90 + i * 70, 8 + q * 70, 1, hex(i % 2 ? a : s), (1 - q) * .5); } },
  (p, t, [, , a, s]) => { for (let i = 0; i < 60; i++) { const r = rng(61, i); box(p, r.next() * W, (r.next() * H + t * (50 + r.next() * 70)) % H, 1, 6, i % 4 ? s : a, .4); } },
  (p, t, [, b, a]) => { for (let j = 0; j < 3; j++) for (let x = 0; x < W; x += 3) { const y = 330 + j * 40 + Math.sin((x + t * (8 + j * 6)) / (26 + j * 9) + j) * 18; box(p, x, y, 3, H - y, j === 1 ? a : b, j === 1 ? .22 : .6); } },
  (p, t, [, b, a, s]) => { for (let i = 0; i < 9; i++) { const x = i * 32 - (t * 4) % 32, h = 60 + rng(62, i).next() * 120; box(p, x, H - h, 27, h, b); for (let y = H - h + 8; y < H - 10; y += 16) box(p, x + 6, y, 5, 6, rng(63, i * 40 + y).next() > .6 ? a : s, .35); } },
  (p, t, [, , a, s]) => { for (let i = 0; i < 28; i++) { const r = rng(64, i), y = (r.next() * H - t * (8 + r.next() * 18) + H * 9) % H; p.circle(r.next() * W, y, 2 + r.next() * 7, hex(i % 3 ? s : a), .22); } },
  (p, t, [, b, a]) => { for (let y = 0; y < 12; y++) for (let x = 0; x < 7; x++) { const cx = x * 46 + (y % 2) * 23, cy = y * 44 - (t * 7) % 88, r = 5 + Math.sin(t * 1.3 + x + y) * 3; p.tri(cx - r, cy, cx, cy - r, cx + r, cy, hex((x + y) % 5 ? b : a), .9); p.tri(cx - r, cy, cx, cy + r, cx + r, cy, hex((x + y) % 5 ? b : a), .9); } },
];
const LAYOUTS = [
  { card: [190, 505, 700], chips: [[70, 585], [620, 1285]], pet: { hook: [200, 470, 1.7], mid: [40, 1008, .84], cta: [264, 430, 1.4] }, dock: { left: 390, top: 1190, width: 620 }, cta: { lockup: 1080, kw: 1200 }, css: '' },
  { card: [60, 522, 880], chips: [[70, 560], [90, 735]], pet: { hook: [430, 640, 1.5], mid: [690, 1040, .82], cta: [650, 1000, .9] }, dock: { left: 60, top: 1190, width: 600 }, cta: { lockup: 920, kw: 600 }, css: '#eyebrow{justify-content:flex-start;left:64px}#title{justify-content:flex-start;text-align:left}' },
  { card: [80, 215, 920], chips: [[70, 230], [620, 335]], pet: { hook: [220, 100, 1.7], mid: [380, 995, .7], cta: [280, 160, 1.35] }, dock: null, cta: { lockup: 1105, kw: 1225 }, css: '#eyebrow{top:850px}#title{top:915px;height:170px}' },
  { card: [90, 715, 900], chips: [[80, 640], [620, 770]], pet: { hook: [200, 560, 1.7], mid: [640, 365, .8], cta: [260, 420, 1.4] }, dock: null, cta: { lockup: 1080, kw: 1200 }, css: '#title{top:268px}' },
  { card: [100, 522, 880], chips: [[560, 600], [520, 1200]], pet: { hook: [90, 560, 1.25], mid: [355, 1020, .9], cta: [330, 500, 1.15] }, dock: null, cta: { lockup: 1065, kw: 1190 }, css: '' },
];
const CAMERAS = [
  ({ p, punch, leave }) => `scale(${1 + p * .06 + punch * .05 + leave * .1})`,
  ({ p, punch, leave }) => `translate(0px,${(p - .5) * 40 - punch * 90 + leave * 90}px) scale(1.02)`,
  ({ p, n, punch, leave }) => `translate(${(n % 2 ? 1 : -1) * ((p - .5) * 36 + punch * 200 - leave * 200)}px,0px) scale(1.02)`,
  ({ p, n, punch }) => `rotate(${(n % 2 ? 1 : -1) * ((1 - p) * 1.1 + punch * 3)}deg) scale(${1.04 + punch * .04})`,
  ({ p, t, punch, leave }) => `translate(${Math.sin(t) * 8}px,${Math.cos(t * .8) * 8 + leave * 70}px) scale(${1.07 - p * .05 + punch * .08})`,
];
const ENTERS = [
  (a) => `translateY(${(1 - a) * 240}px) rotate(${(1 - a) * 6}deg)`, (a) => `translateY(${(1 - a) * -480}px)`, (a) => `translateX(${(1 - a) * 760}px) rotate(${(1 - a) * 12}deg)`,
  (a) => `scale(${.3 + .7 * a})`, (a) => `perspective(1400px) rotateY(${(1 - a) * 70}deg)`, (a) => `perspective(1400px) rotateX(${(1 - a) * -75}deg)`,
];
const WORDS = [(a) => `translateY(${(1 - a) * 115}%)`, (a) => `translateY(${(1 - a) * -115}%)`, (a) => `translateX(${(1 - a) * -105}%)`, (a) => `translateY(${(1 - a) * 115}%) rotate(${(1 - a) * -14}deg)`];
const CUTS = [
  (x, y, c) => (x % 2 ? c - x : x) / c * .9, (x, y, c, r) => (y % 2 ? r - y : y) / r * .9, (x, y, c, r) => (x + y) / (c + r) * .8 + ((x + y) % 2) * .12,
  (x, y, c, r) => Math.hypot(x - c / 2, y - r / 2) / Math.hypot(c / 2, r / 2) * .9, (x, y) => rng(65, y * 40 + x).next() * .9, (x, y, c, r) => Math.abs(y - r / 2) / (r / 2) * .7 + x / c * .2,
];
export default function make(o) {
  const col = PALETTES[o.palette], [bg, stripe, accent, soft, light] = col, L = LAYOUTS[o.layout], ink = light ? '#141413' : '#FAF9F5';
  return {
    logo: light ? 'lockup.svg' : 'lockup-dark.svg', labels: {},
    css: `body{background:${bg};color:${ink}}#title{color:${ink};text-shadow:0 0 18px ${bg},0 0 8px ${bg}}#eyebrow span{color:${ink};background:${bg};border-color:${accent};border-radius:${o.radius / 2}px}
.card{border-radius:${o.radius}px;box-shadow:${o.radius > 40 ? '0 30px 70px rgba(0,0,0,.4)' : `20px 20px 0 ${accent}`}}.ghost{border-radius:${o.radius}px}#shade{display:none}#kw{background:#FAF9F5;color:#141413;border:8px solid ${accent};border-radius:${o.radius * 2}px}
#cap span{color:${ink};text-shadow:0 0 12px ${bg},0 0 6px ${bg}}#cap span.cur{color:#fff;text-shadow:none}${light ? '#ai{color:#4A443A;border-color:rgba(20,20,19,.25)}#bar div{background:rgba(20,20,19,.16)}' : ''}${L.css}`,
    card: L.card, chips: L.chips, pet: L.pet, dock: L.dock, cta: L.cta,
    camera: CAMERAS[o.camera], enter: ENTERS[o.enter], word: WORDS[o.word],
    cut: { every: o.every, dur: .56, draw(p, q) { cells(p, q, o.cell, [accent, stripe, soft], CUTS[o.cut]); } },
    back(p, { t }) { fill(p, bg); for (let y = o.cell; y < H; y += o.cell * 3) box(p, 0, y, W, 1, stripe); MOTIFS[o.motif](p, ease(1) * t, col); },
    front(p, { k, n, shot, dur, pet: [cx, cy, half] }) {
      if (n) pop(p, cx, cy + half * .5, k - .45, 20 + n, [accent, soft], 20, half * 2.2);
      if (shot === 'approve') pop(p, 70, 240, k - dur * .68, 3, [accent, soft, '#6FCF97'], 44, 120);
      if (shot === 'alert') pop(p, 135, 190, k - 1.7, 4, [accent, '#E2603F'], 34, 110);
      if (shot === 'cta') { pop(p, cx, cy - half * .8, k - .5, 8, [accent, soft], 60, 150); pop(p, cx, cy - half * .8, k - 1.5, 9, [accent, soft], 36, 120); }
    },
  };
}
