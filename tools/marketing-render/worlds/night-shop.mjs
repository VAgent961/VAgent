// Voice receptionist: a closed shop street at night; sound rings come out of the pet when she talks.
import { W, bands, box, plus, pop, cycle, rng, ease, hex } from './lib.mjs';
export default {
  logo: 'lockup-dark.svg',
  labels: { hook: 'After hours', phone: 'At the door', flow: 'On the line', list: 'Next morning', cta: 'Tonight' },
  css: `body{background:#0F1030}#title{text-shadow:0 0 24px rgba(255,150,110,.75),0 6px 20px #000}#eyebrow span{border-radius:60px}
.card{border-radius:76px;border:14px solid #2A2B55;background:#FAF9F5}#shade{background:linear-gradient(transparent 70%,rgba(8,8,24,.75) 82%)}#kw{background:#16173F;border:6px solid #F4A27E;border-radius:80px;box-shadow:0 0 60px rgba(244,162,126,.55);color:#fff}`,
  card: [190, 505, 700], chips: [[70, 585], [620, 1285]],
  pet: { hook: [200, 470, 1.7], mid: [40, 1008, .84], cta: [264, 430, 1.4] }, dock: { left: 390, top: 1190, width: 620 }, cta: { lockup: 1080, kw: 1200 },
  camera: ({ p, t, punch, leave }) => `translate(${Math.sin(t * .7) * 9}px,${leave * 60}px) scale(${1 + p * .05 + punch * .05})`,
  enter: (a, k) => `translateY(${(1 - a) * -90 + Math.sin(k * 1.6) * 7}px) scale(${.88 + .12 * a})`,
  word: (a) => `translateY(${(1 - a) * -115}%)`,
  cut: { every: 1, dur: .5, draw(p, q) { const h = Math.round(ease(q < .5 ? q * 2 : 2 - q * 2) * 500); for (let y = 0; y < h; y += 12) { box(p, 0, y, W, 11, '#2A2B55'); box(p, 0, y + 9, W, 2, '#4A4C86'); } } },
  back(p, { t }) {
    bands(p, ['#0B0C26', '#0F1030', '#13143A', '#181945', '#1C1D4E', '#17183F']);
    for (let i = 0; i < 46; i++) { const r = rng(5, i), x = r.next() * W, y = r.next() * 230; plus(p, x, y, Math.sin(t * 2 + i) > .82 ? 1 : 0, '#C9CBFF', .7); }
    p.circle(228, 62, 13, hex('#F6E7C1'), 1); p.circle(222, 58, 11, hex('#0F1030'), 1);
    [[-8, 330, 70], [58, 300, 62], [196, 318, 84]].forEach(([x, y, w], j) => { box(p, x, y, w, 160, '#0A0B22'); for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) box(p, x + 9 + c * 20, y + 12 + r * 26, 9, 12, rng(j, c * 7 + r).next() > .6 && Math.sin(t * .8 + c + r * 2 + j) > -.4 ? '#E9A35F' : '#1B1C45'); });
    box(p, 0, 434, W, 46, '#0A0A1C'); for (let x = 0; x < W; x += 34) box(p, x - (t * 6) % 34, 452, 16, 2, '#3A3B6A');
  },
  front(p, { t, k, n, shot, pet: [cx, cy, half], level }) {
    if (level > .12) for (let j = 0; j < 3; j++) { const a = (t * 1.6 + j / 3) % 1; p.ring(cx, cy - 6, half * (1.15 + a * .8), 1, hex('#F4A27E'), (1 - a) * .55); }
    cycle(t, 4, 5, 2 + n, 2.5, (age, life, r) => { const x = cx + (r.next() - .5) * half * 3, y = cy - age * 22; box(p, x, y, 2, 7, '#FFD9A8', 1 - age / life); box(p, x - 2, y + 6, 3, 3, '#FFD9A8', 1 - age / life); });
    if (shot === 'cta') pop(p, 135, 300, k - .5, 8, ['#F4A27E', '#FFD9A8', '#8F93FF'], 60, 150);
  },
};
