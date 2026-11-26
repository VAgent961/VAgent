// Shared helpers for the per-video worlds. A world draws on 270x480 pixelfx frames (shown at 4x).
import { hex } from '../vendor/pixelfx/core/color.js';
import { rng, clamp } from '../vendor/pixelfx/core/math.js';
import { burst, cycle, fly } from '../vendor/pixelfx/core/particles.js';
export { hex, rng, clamp, burst, cycle, fly };
export const W = 270, H = 480;
export const fill = (p, c, a = 1) => p.rect(0, 0, W, H, hex(c), a);
export const box = (p, x, y, w, h, c, a = 1) => p.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), hex(c), clamp(a));
export const bands = (p, colors) => colors.forEach((c, i) => box(p, 0, Math.floor(i * H / colors.length), W, Math.ceil(H / colors.length), c));
export const plus = (p, x, y, r, c, a = 1) => { box(p, x - r, y, r * 2 + 1, 1, c, a); box(p, x, y - r, 1, r * 2 + 1, c, a); };
export const ease = (q) => q < .5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
// a burst of pixels from (x, y), age seconds after it fired
export function pop(p, x, y, age, seed, colors, n, speed, gravity = 120) {
  if (age < 0 || age > 1.1) return;
  burst(n, seed, (r, i) => {
    const a = r.next() * Math.PI * 2, v = speed * (.35 + r.next() * .65);
    const [px, py] = fly(x, y, Math.cos(a) * v, Math.sin(a) * v - speed * .35, age, gravity, 2.2);
    box(p, px, py, i % 3 ? 2 : 3, i % 3 ? 2 : 3, colors[i % colors.length], 1.25 - age * 1.15);
  });
}
// a grid of cells that fills then clears; order(x, y, cols, rows) in 0..1 shapes the sweep
export function cells(p, q, size, colors, order) {
  const cols = Math.ceil(W / size), rows = Math.ceil(H / size), k = q < .5 ? q * 2.1 : (q - .5) * 2.1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const e = order(x, y, cols, rows);
    if (q < .5 ? e < k : e >= k) box(p, x * size, y * size, size, size, colors[(x * 3 + y * 5) % colors.length]);
  }
}
