// Review replies: a bright morning cafe with floating review stars and steam. Light theme, pet sits on the card.
import { W, H, fill, box, pop, cells, cycle, rng, ease } from './lib.mjs';
const STAR = ['...x...', '..xxx..', 'xxxxxxx', '.xxxxx.', '..xxx..', '.xx.xx.', '.x...x.'];
const star = (p, x, y, s, c, a = 1) => STAR.forEach((row, j) => [...row].forEach((v, i) => v === 'x' && box(p, x + i * s, y + j * s, s, s, c, a)));
export default {
  logo: 'lockup.svg',
  labels: { hook: 'New review', phone: 'In their words', flow: 'The idea', list: 'Every mood', approve: 'You first', cta: 'Your reviews' },
  css: `body{background:#FBF3E4;color:#141413}#eyebrow span{color:#9A4527;background:#fff;border-color:#B5532F;border-style:dotted;border-width:4px}#title{color:#141413;text-shadow:none;top:268px}#title b:last-child{background:#F6C6A8;border-radius:18px;padding:0 16px .1em}
#ai{color:#5A544A;border-color:rgba(20,20,19,.2)}#bar div{background:rgba(20,20,19,.14)}.card{border-radius:64px 64px 64px 14px;border:6px solid #141413;box-shadow:22px 22px 0 #F6C6A8}.ghost{display:none}#shade{display:none}
#cap span{color:#141413;text-shadow:0 0 12px #FBF3E4,0 0 6px #FBF3E4}#cap span.cur{color:#fff;text-shadow:none}#kw{background:#B5532F;color:#fff;border:8px solid #141413;border-radius:60px 60px 60px 10px;box-shadow:18px 18px 0 #F6C6A8}`,
  card: [90, 715, 900], chips: [[80, 640], [620, 770]],
  pet: { hook: [200, 560, 1.7], mid: [640, 365, .8], cta: [260, 420, 1.4] }, dock: null, cta: { lockup: 1080, kw: 1200 },
  camera: ({ n, p, punch, leave }) => `translate(${(n % 2 ? 1 : -1) * (punch * 260 - leave * 260 + (p - .5) * 20)}px,0px) scale(1.01)`,
  enter: (a, k) => `translateX(${(1 - a) * -260}px) rotate(${(1 - a) * -9 + Math.sin(k * 1.4) * .5}deg)`,
  word: (a) => `translateY(${(1 - a) * 115}%) scale(${.7 + .3 * a})`,
  cut: { every: 2, dur: .66, draw(p, q) { cells(p, q, 15, ['#F6C6A8', '#CA7C5D', '#F5B83D'], (x, y, c, r) => (Math.abs(x - c / 2) + Math.abs(y - r / 2)) / (c / 2 + r / 2) * .8 + ((x + y) % 2) * .15); } },
  back(p, { t }) {
    fill(p, '#FBF3E4');
    for (let y = 0; y < 22; y++) for (let x = 0; x < 13; x++) box(p, x * 22 + (y % 2) * 11 - (t * 3) % 22, y * 22 + 4, 2, 2, '#EBDCC0');
    for (let i = 0; i < 9; i++) { const r = rng(21, i), left = i % 2, y = (r.next() * H - t * (7 + i) + H * 4) % H; star(p, (left ? 4 : 232) + r.next() * 22, y, 1 + (i % 3 === 0), i % 3 ? '#F5B83D' : '#EBCB8A', .8); }
    box(p, 0, 456, W, 24, '#E4C9A0'); box(p, 0, 456, W, 3, '#B98F5C');
  },
  front(p, { t, k, n, shot, dur }) {
    box(p, 20, 438, 26, 18, '#FFFFFF'); box(p, 20, 444, 26, 4, '#B5532F'); box(p, 46, 442, 5, 10, '#FFFFFF');
    cycle(t, 2.4, 5, 3, 1.8, (age, life, r) => box(p, 24 + r.next() * 16 + Math.sin(age * 5) * 3, 434 - age * 20, 2, 4, '#CDBBA0', 1 - age / life));
    if (shot === 'hook') for (let i = 0; i < 5; i++) { const a = ease(Math.max(0, Math.min(1, (k - .3 - i * .22) / .35))); if (a > 0) star(p, 66 + i * 29, 138 - (1 - a) * 40, 3, i < 3 ? '#F5B83D' : '#D9CBB0', a); }
    if (shot === 'approve') pop(p, 80, 295, k - dur * .68, 3, ['#6FCF97', '#F5B83D', '#B5532F'], 46, 120);
    if (shot === 'cta') for (let i = 0; i < 12; i++) { const a = k - .4 - i * .07; if (a > 0 && a < 1.6) star(p, 12 + rng(33, i).next() * 235, 90 + a * a * 120, 2, '#F5B83D', 1.6 - a); }
  },
};
