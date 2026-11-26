// Runs the video's own world (worlds/<name>.mjs) on three pixelfx layers. Deterministic per frame.
import { createFrame, clearFrame, composite, painterFor } from './vendor/pixelfx/core/fx.js';
const layers = {};
for (const name of ['back', 'front', 'cut']) {
  const c = document.getElementById('fx-' + name); c.width = 270; c.height = 480;
  const ctx = c.getContext('2d');
  layers[name] = { ctx, image: ctx.createImageData(270, 480), frame: createFrame(270, 480) };
}
function paint(name, fn) {
  const l = layers[name]; clearFrame(l.frame); fn(painterFor(l.frame));
  composite(l.frame, l.image.data); l.ctx.putImageData(l.image, 0, 0);
}
let world;
window.loadWorld = async (name) => (world = window.WORLD = (await import(`./worlds/${name}.mjs`)).default) && true;
window.FX = (s) => {
  const view = { ...s, pet: s.pet.map((v) => v / 4) };
  paint('back', (p) => world.back(p, view));
  paint('front', (p) => world.front(p, view));
  paint('cut', (p) => { if (s.cut) world.cut.draw(p, s.cut.p, s.cut.side); });
};
