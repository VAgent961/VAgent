// Approval: an editor's paper desk. Pages slide across and a red stamp comes down on the key moments.
import { W, H, fill, box, pop, rng, ease, clamp } from './lib.mjs';
function stamp(p, x, y, age, ok) {
  if (age < 0) return; const s = 1 + (1 - clamp(age / .16)) * 1.4, w = 54 * s, h = 22 * s, c = ok ? '#2F7D4F' : '#B5532F';
  [[x - w / 2, y - h / 2, w, 3], [x - w / 2, y + h / 2 - 3, w, 3], [x - w / 2, y - h / 2, 3, h], [x + w / 2 - 3, y - h / 2, 3, h]].forEach((r) => box(p, ...r, c, clamp(age / .1)));
  if (ok) for (let i = 0; i < 14; i++) box(p, x - 10 + i * 2, y + (i < 5 ? i : 8 - i) - 2, 3, 3, c);
  else { box(p, x - 2, y - 7, 5, 9, c); box(p, x - 2, y + 4, 5, 4, c); }
}
export default {
  logo: 'lockup.svg',
  labels: { hook: 'Hold on', phone: 'The worry', flow: 'The routine', list: 'Prepared', approve: 'Your call', cta: 'How we work' },
  css: `body{background:#E9DFCB;color:#141413}#eyebrow{justify-content:flex-start;left:70px}#eyebrow span{color:#fff;background:#B5532F;border:0;border-radius:4px;transform:rotate(-2deg)}#title{justify-content:flex-start;text-align:left;color:#141413;text-shadow:none;font-style:italic}#title b{background:linear-gradient(transparent 66%,rgba(245,184,61,.55) 66% 90%,transparent 90%)}
#ai{color:#4A443A;border-color:rgba(20,20,19,.25)}#bar div{background:rgba(20,20,19,.16)}.card{border-radius:6px;background:#FFFDF7;box-shadow:0 26px 40px rgba(70,50,20,.3)}.ghost{border-radius:6px;background:#FFFDF7;opacity:.75!important}#shade{background:radial-gradient(ellipse 85% 70% at 50% 45%,transparent 60%,rgba(80,55,25,.22))}
.dock{border-radius:4px;background:#F8DC6C;border:0;color:#141413;transform-origin:0 0}.dock small{color:#5A4B12}.dock i{background:#B5532F}#cap span{color:#141413;text-shadow:0 0 12px #E9DFCB,0 0 6px #E9DFCB}#cap span.cur{color:#fff;text-shadow:none}#kw{background:#FFFDF7;color:#B5532F;border:12px double #B5532F;border-radius:10px;transform:rotate(-3deg)}`,
  card: [70, 505, 830], chips: [[70, 560], [90, 1120]],
  pet: { hook: [440, 700, 1.45], mid: [690, 1040, .88], cta: [300, 440, 1.25] }, dock: { left: 70, top: 1200, width: 600 }, cta: { lockup: 1065, kw: 1190 },
  camera: ({ n, p, punch, leave }) => `translate(0px,${punch * -70 + leave * 30}px) rotate(${(n % 2 ? .9 : -.9) * (1 - p)}deg) scale(${1.07 - p * .055 + punch * .08})`,
  enter: (a, k, dur, n) => `translate(${(1 - a) * (n % 2 ? 700 : -700)}px,0px) rotate(${(n % 2 ? 1.6 : -1.6) + (1 - a) * 18}deg)`,
  word: (a) => `translateX(${(1 - a) * 105}%)`,
  cut: { every: 2, dur: .6, draw(p, q, side) { const edge = ease(q) * 900 - 330; for (let y = 0; y < H; y += 4) { const x = edge + (y / H) * 70; const from = side > 0 ? x - 330 : W - x; box(p, from, y, 330, 4, '#FFFDF7'); box(p, side > 0 ? from + 322 : from, y, 8, 4, '#C9B895'); if (y % 20 === 8) box(p, from + 24, y, 270, 1, '#D9CDB2'); } } },
  back(p, { t }) {
    fill(p, '#E9DFCB');
    for (let y = 18; y < H; y += 17) box(p, 0, y, W, 1, '#D6C8A8'); box(p, 13, 0, 1, H, '#D99A86');
    for (let i = 0; i < 90; i++) { const r = rng(41, i); box(p, r.next() * W, r.next() * H, 1, 1, '#CDBC98'); }
    const x = 236 + Math.sin(t * .7) * 8; // pencil
    box(p, x, 70, 9, 90, '#F5B83D'); box(p, x + 3, 70, 3, 90, '#E0A22A'); box(p, x, 60, 9, 10, '#E88C8C'); box(p, x + 1, 160, 7, 5, '#E4C9A0'); box(p, x + 3, 165, 3, 5, '#3A332A');
  },
  front(p, { k, n, shot, dur }) {
    if (shot === 'hook') { stamp(p, 62, 190, k - .8, false); pop(p, 62, 190, k - .96, 5, ['#B5532F', '#CA7C5D'], 22, 80); }
    if (shot === 'approve') { stamp(p, 196, 150, k - dur * .68, true); pop(p, 196, 150, k - dur * .68 - .14, 3, ['#2F7D4F', '#F5B83D'], 30, 90); }
    if (shot === 'cta') pop(p, 135, 230, k - .5, 7, ['#FFFDF7', '#F5B83D', '#B5532F'], 54, 150, 200);
  },
};
