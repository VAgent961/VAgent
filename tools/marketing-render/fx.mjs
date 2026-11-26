// Pixel accents drawn with pixelfx (vendor/pixelfx) on 270x480 frames, shown at 4x so one effect pixel
// matches the pet's chunky style. Everything is a function of time: no state between frames.
import { createFrame, clearFrame, composite, painterFor } from './vendor/pixelfx/core/fx.js';
import { burst, cycle, fly } from './vendor/pixelfx/core/particles.js';
import { hex } from './vendor/pixelfx/core/color.js';
import { rng, clamp } from './vendor/pixelfx/core/math.js';

const W = 270, H = 480;
const WARM = ['#FFF3E8', '#F4B196', '#CA7C5D', '#B5532F'].map(hex), ALERT = ['#FFD2C2', '#E2603F', '#B5532F'].map(hex), PARTY = ['#FFF3E8', '#F5B83D', '#CA7C5D', '#6FCF97'].map(hex);
const layers = {};
for (const name of ['back', 'front', 'cut']) {
  const c = document.getElementById('fx-' + name); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  layers[name] = { ctx, image: ctx.createImageData(W, H), frame: createFrame(W, H) };
}
function paint(name, fn) {
  const l = layers[name]; clearFrame(l.frame); fn(painterFor(l.frame));
  composite(l.frame, l.image.data); l.ctx.putImageData(l.image, 0, 0);
}
const square = (p, x, y, size, c, a) => p.rect(Math.round(x), Math.round(y), size, size, c, clamp(a));
function plus(p, x, y, r, c, a) { p.rect(Math.round(x) - r, Math.round(y), r * 2 + 1, 1, c, a); p.rect(Math.round(x), Math.round(y) - r, 1, r * 2 + 1, c, a); }
// a burst of pixel confetti from (x, y), age seconds after it fired
function pop(p, x, y, age, seed, colors, n, speed) {
  if (age < 0 || age > 1.1) return;
  burst(n, seed, (r, i) => {
    const a = r.next() * Math.PI * 2, v = speed * (.35 + r.next() * .65);
    const [px, py] = fly(x, y, Math.cos(a) * v, Math.sin(a) * v - speed * .35, age, 120, 2.2);
    square(p, px, py, i % 3 ? 2 : 3, colors[i % colors.length], 1.25 - age * 1.15);
  });
}
// scene: { t, k, n, shot, dur, pet: [cx, cy, halfWidth] in screen px, cut: { p, side } | null }
window.FX = ({ t, k, n, shot, dur, pet, cut }) => {
  const [cx, cy, half] = pet.map((v) => v / 4);
  paint('back', (p) => cycle(t, 9, 38, 5, 8, (age, life, r) => { // slow embers rising behind the cards
    const x = r.next() * W + Math.sin(age * 1.3 + r.next() * 6) * 5, y = H - r.next() * 160 - age * (14 + r.next() * 20);
    square(p, x, y, r.next() > .75 ? 2 : 1, WARM[2 + (r.next() > .5)], Math.sin(Math.PI * age / life) * .75);
  }));
  paint('front', (p) => {
    cycle(t, 3.2, 7, 11 + n, 1.1, (age, life, r) => { // twinkles around the pet
      const a = r.next() * Math.PI * 2, x = cx + Math.cos(a) * half * 1.15, y = cy - Math.abs(Math.sin(a)) * half * .8;
      plus(p, x, y - age * 4, Math.round(Math.sin(Math.PI * age / life) * 2), WARM[r.next() > .5 ? 0 : 1], 1);
    });
    if (n) pop(p, cx, cy + half * .5, k - .45, 20 + n, WARM, 22, half * 2.2); // landing dust after the hop
    if (shot === 'approve') pop(p, 62, 236, k - dur * .68, 3, PARTY, 46, 120);
    if (shot === 'alert') pop(p, 135, 190, k - 1.7, 4, ALERT, 34, 110);
    if (shot === 'cta') { pop(p, cx, cy - half * .85, k - .45, 8, PARTY, 60, 150); pop(p, cx, cy - half * .85, k - 1.6, 9, PARTY, 36, 120); }
  });
  paint('cut', (p) => { // blocky sweep across a cut: fills, then clears in the same direction
    if (!cut) return;
    const S = 18, cols = Math.ceil(W / S), rows = Math.ceil(H / S);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const r = rng(31, y * cols + x), edge = ((cut.side > 0 ? x : cols - 1 - x) / cols) * .65 + (y / rows) * .1 + r.next() * .25;
      const q = cut.p < .5 ? cut.p * 2.1 : (cut.p - .5) * 2.1, on = cut.p < .5 ? edge < q : edge >= q;
      if (on) p.rect(x * S, y * S, S, S, hex(['#B5532F', '#B5532F', '#CA7C5D', '#9A4527'][(x * 3 + y * 5) % 4]), 1);
    }
  });
};
