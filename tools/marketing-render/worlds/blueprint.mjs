// Website builder: a blueprint table where blocks are dropped into place like a build site.
import { W, H, fill, box, pop, cells, cycle, rng, clamp } from './lib.mjs';
export default {
  logo: 'lockup-dark.svg',
  labels: { hook: 'Site check-in', phone: 'The brief', flow: 'Building', browser: 'Version one', approve: 'Sign off', cta: 'Start yours' },
  css: `body{background:#123A63}#eyebrow{justify-content:flex-start;left:64px}#eyebrow span{border-radius:0;color:#CFE6FF;border:3px dashed #8CC4F5;background:#123A63}
#title{justify-content:flex-start;text-align:left;font-family:Inter;letter-spacing:-1px}#title b{font-weight:800}.card{border-radius:10px;box-shadow:inset 0 22px 0 #D5DEE8,18px 18px 0 rgba(5,20,38,.55)}.ghost{border-radius:6px;background:transparent;border:4px dashed #8CC4F5;opacity:.5!important}
.row,.msg{border-radius:8px!important}#shade{background:linear-gradient(transparent 72%,rgba(8,28,50,.7) 83%)}.dock{border-radius:8px;background:#0C2A48;border:3px dashed #8CC4F5}#kw{background:#FAF9F5;color:#141413;border-radius:8px;box-shadow:20px 20px 0 #B5532F}#cap span{border-radius:4px}`,
  card: [60, 505, 880], chips: [[70, 560], [90, 735]],
  pet: { hook: [430, 640, 1.5], mid: [690, 1040, .82], cta: [650, 1000, .9] }, dock: { left: 60, top: 1190, width: 600 }, cta: { lockup: 920, kw: 600 },
  camera: ({ p, punch, leave }) => `translate(0px,${(.5 - p) * 46 + punch * 120 - leave * 160}px) scale(${1.01 + punch * .02})`,
  enter: (a) => `translateY(${(1 - a) * -520}px)`,
  word: (a) => `translateX(${(1 - a) * -105}%)`,
  cut: { every: 2, dur: .62, draw(p, q) { cells(p, q, 30, ['#8CC4F5', '#5A9BD4', '#CFE6FF'], (x, y, c, r) => (r - 1 - y) / r * .8 + rng(4, x).next() * .2); } },
  back(p, { t, k, n }) {
    fill(p, '#123A63');
    for (let x = (n * 7) % 12; x < W; x += 12) box(p, x, 0, 1, H, '#1C4A78');
    for (let y = Math.floor(t * 5) % 12; y < H; y += 12) box(p, 0, y, W, 1, '#1C4A78');
    const arm = 150 + Math.sin(t * .6) * 55; // crane
    box(p, 258, 120, 4, 320, '#5A9BD4'); box(p, arm - 6, 120, 268 - arm, 3, '#5A9BD4'); box(p, arm, 123, 1, 16 + Math.sin(t * 1.4) * 6, '#CFE6FF'); box(p, arm - 6, 140 + Math.sin(t * 1.4) * 6, 13, 9, '#CA7C5D');
    for (let i = 0; i < 18; i++) { const x = (i % 9) * 31, land = H - 16 - Math.floor(i / 9) * 15, a = clamp((t - i * .9) / .5); if (a > 0) box(p, x, -20 + (land + 20) * a * a, 27, 12, i % 4 ? '#1F5688' : '#9A4527'); }
  },
  front(p, { t, k, n, shot, dur, pet: [cx, cy, half] }) {
    cycle(t, 2.2, 10, n, .8, (age, life, r) => box(p, cx - half + r.next() * half * 2, cy + half * .6 - age * 40 * r.next(), 2, 2, r.next() > .5 ? '#FFD36E' : '#FFF3E8', 1 - age / life));
    if (shot !== 'hook') pop(p, 135, 132, k - .42, 6 + n, ['#CFE6FF', '#8CC4F5'], 26, 150, 260);
    if (shot === 'approve') pop(p, 70, 245, k - dur * .68, 3, ['#6FCF97', '#FFF3E8', '#FFD36E'], 44, 120);
    if (shot === 'cta') for (let j = 0; j < 3; j++) pop(p, 60 + j * 75, 150, k - .4 - j * .35, 40 + j, ['#FFD36E', '#CA7C5D', '#CFE6FF'], 30, 100);
  },
};
