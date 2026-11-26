// Lead finder: a district map from above with a radar sweep; pins drop where it looks. Headline sits under the card.
import { W, H, fill, box, pop, rng, hex, ease, clamp } from './lib.mjs';
export default {
  logo: 'lockup-dark.svg',
  labels: { hook: 'Scanning', list: 'Shortlist', phone: 'Your pick', flow: 'Searching', approve: 'Your move', cta: 'Your area' },
  css: `body{background:#0D2420}#eyebrow{top:850px}#eyebrow span{color:#BDF3D8;border-color:#4FBF8F;background:#0D2420;border-radius:12px}#title{top:915px;height:170px;text-shadow:0 0 26px #0D2420,0 0 14px #0D2420,0 4px 10px #000}
.card{border-radius:28px 90px 28px 90px;box-shadow:0 0 0 8px rgba(79,191,143,.35),0 40px 80px rgba(0,0,0,.5)}.ghost{border-radius:50%;background:#4FBF8F;opacity:.08!important}#shade{background:linear-gradient(transparent 72%,rgba(5,18,15,.8) 83%)}#kw{background:#FAF9F5;color:#141413;border-radius:200px;box-shadow:0 0 0 14px rgba(79,191,143,.45)}`,
  card: [80, 215, 920], chips: [[70, 230], [620, 335]],
  pet: { hook: [220, 100, 1.7], mid: [380, 995, .7], cta: [280, 160, 1.35] }, dock: null, cta: { lockup: 1105, kw: 1225 },
  camera: ({ p, n, punch, leave }) => `rotate(${(n % 2 ? 1 : -1) * ((1 - p) * 1.3 + punch * 4)}deg) scale(${1.02 + (n % 2 ? p : 1 - p) * .05 + leave * .18})`,
  enter: (a) => `scale(${a}) rotate(${(1 - a) * -14}deg)`,
  word: (a) => `translateY(${(1 - a) * 115}%) rotate(${(1 - a) * 12}deg)`,
  cut: { every: 1, dur: .56, draw(p, q) { const k = ease(q < .5 ? q * 2 : 2 - q * 2), S = 10; for (let y = 0; y < H; y += S) for (let x = 0; x < W; x += S) { const d = Math.hypot(x - 135, y - 240) / 290; if (1 - d < k * 1.08) box(p, x, y, S, S, d % .16 < .08 ? '#1E5C47' : '#4FBF8F'); } } },
  back(p, { t, n }) {
    fill(p, '#0D2420'); const dx = (t * 4) % 54, dy = (t * 2.5) % 46;
    for (let y = -1; y < 12; y++) for (let x = -1; x < 7; x++) { const r = rng(9, (x + 2) * 31 + y + n); box(p, x * 54 - dx + 5, y * 46 - dy + 5, 44, 36, r.next() > .8 ? '#17463A' : '#12332B'); }
    const cx = 135, cy = 190, a = t * 1.9;
    [60, 110, 160].forEach((r) => p.ring(cx, cy, r, 1, hex('#2F7D5F'), .8));
    for (let j = 0; j < 22; j++) p.line(cx, cy, cx + Math.cos(a - j * .035) * 170, cy + Math.sin(a - j * .035) * 170, hex('#4FBF8F'), .5 * (1 - j / 22));
  },
  front(p, { t, k, n, shot, pet: [cx, cy, half] }) {
    for (let i = 0; i < 4; i++) { const r = rng(12 + n, i), side = i % 2 ? 252 : 17, y = 70 + r.next() * 330, a = clamp((k - .3 - i * .4) / .35); if (a <= 0) continue;
      const py = y - (1 - a * a) * 60 + Math.sin(t * 3 + i) * 1.5; p.circle(side, py - 9, 6, hex('#E2603F'), 1); box(p, side - 2, py - 11, 4, 4, '#FFF3E8'); p.tri(side - 4, py - 5, side + 4, py - 5, side, py + 3, hex('#E2603F'), 1); if (a >= 1) p.ring(side, py + 4, ((t * 14 + i * 5) % 14), 1, hex('#BDF3D8'), .5); }
    if (shot === 'cta') { pop(p, cx, cy, k - .5, 14, ['#BDF3D8', '#4FBF8F', '#FFF3E8'], 70, 160, 0); }
  },
};
