// Website checker: a dark arcade screen where pixel bugs crawl and the pet hunts them.
import { W, H, fill, box, pop, cells, rng } from './lib.mjs';
const BUG = ['x.....x', '.x...x.', '..xxx..', 'xx.x.xx', '.xxxxx.', 'x.xxx.x', '.x...x.'];
const bug = (p, x, y, c, step) => BUG.forEach((row, j) => [...row].forEach((v, i) => v === 'x' && box(p, x + i * 2, y + j * 2 + (step && j === 6 ? (i < 3 ? 2 : -2) : 0), 2, 2, c)));
export default {
  logo: 'lockup-dark.svg',
  labels: { hook: 'Level 1', alert: 'Bug found', browser: 'The target', flow: 'Test run', list: 'Double check', cta: 'Continue?' },
  css: `body{background:#0A0A12}#eyebrow{justify-content:flex-start;left:64px}#eyebrow span{font-family:monospace;border-radius:0;color:#7CFFB2;border:4px solid #7CFFB2;background:#0A0A12}
#title{justify-content:flex-start;text-align:left;font-family:monospace;text-transform:uppercase;text-shadow:6px 0 #B5532F,-4px 0 #2BB8C4}#title b{font-weight:800}.card{border-radius:0;box-shadow:0 0 0 10px #0A0A12,0 0 0 18px #7CFFB2,0 40px 80px #000}.ghost{display:none}.row,.msg,#cam .pill,.card div{border-radius:0!important}
#shade{background:repeating-linear-gradient(rgba(0,0,0,.14) 0 3px,transparent 3px 8px)}#kw{background:#0A0A12;color:#7CFFB2;border:10px solid #7CFFB2;box-shadow:16px 16px 0 #B5532F;font-family:monospace}#cap span{font-family:monospace;border-radius:0}`,
  card: [100, 522, 880], chips: [[560, 600], [520, 1200]],
  pet: { hook: [90, 560, 1.25], mid: [355, 1020, .9], cta: [330, 500, 1.15] }, dock: null, cta: { lockup: 1065, kw: 1190 },
  camera: ({ k, p, shot, punch, leave }) => { const hit = shot === 'alert' && k > 1.7 && k < 2.2 ? Math.sin(k * 60) * 12 * (2.2 - k) : 0; return `translate(${hit - leave * 260}px,${hit * .5}px) scale(${1 + Math.floor(p * 4) * .014 + punch * .12})`; },
  enter: (a) => `scale(${.2 + .8 * Math.min(1.04, Math.round(a * 6) / 6)},${Math.min(1.04, .05 + Math.round(a * 6) / 6)})`,
  word: (a) => `translateY(${(1 - Math.round(a * 4) / 4) * 115}%)`,
  cut: { every: 2, dur: .55, draw(p, q) { cells(p, q, 10, ['#7CFFB2', '#2BB8C4', '#B5532F', '#12121F'], (x, y) => rng(8, y).next() * .75 + x / 27 * .25); } },
  back(p, { t }) {
    fill(p, '#0A0A12');
    for (let i = -8; i <= 8; i++) p.line(135 + i * 9, 300, 135 + i * 52, H, 0xff4a2f24, .8);
    for (let j = 0; j < 9; j++) { const f = ((j + t * 1.2) % 9) / 9; box(p, 0, 300 + f * f * 180, W, 1, '#2A2A55'); }
    for (let i = 0; i < 70; i++) { const r = rng(2, i); box(p, r.next() * W, (r.next() * 300 + t * (6 + i % 5 * 4)) % 300, 1, 1 + i % 3, '#4A4A80'); }
  },
  front(p, { t, k, n, shot, pet: [cx, cy, half] }) {
    for (let i = 0; i < 3; i++) { const x = ((t * (16 + i * 7) + i * 97) % 320) - 30, y = [425, 455, 150][i]; if (!(i === 2 && shot !== 'hook')) bug(p, i % 2 ? W - x : x, y + Math.sin(t * 5 + i) * 3, ['#FF5D73', '#7CFFB2', '#FFD36E'][i], Math.floor(t * 8) % 2); }
    if (shot !== 'hook' && shot !== 'cta') for (let j = 0; j < 7; j++) { box(p, 12 + j * 10, 322, 8, 8, j <= n ? '#7CFFB2' : '#26263F'); box(p, 192 + j * 10, 322, 8, 8, j >= 7 - n ? '#7CFFB2' : '#26263F'); }
    if (shot === 'alert') pop(p, 135, 190, k - 1.7, 4, ['#FF5D73', '#FFD36E', '#FFF3E8'], 50, 130);
    if (shot === 'cta') { pop(p, cx, cy, k - .45, 8, ['#7CFFB2', '#2BB8C4'], 60, 150); pop(p, cx, cy, k - 1.4, 9, ['#FFD36E', '#FF5D73'], 40, 130); }
  },
};
