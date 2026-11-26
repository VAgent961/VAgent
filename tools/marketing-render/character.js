// Vee, the VAgent presenter: the blocky terracotta pixel pet (same 12x8 grid as our desktop Claude Pet).
// makePet(host) -> draw(state). Deterministic: everything comes from the time and the state passed in.
function makePet(host) {
  const BODY = '#CA7C5D', INK = '#000', U = 32, X = 8, Y = 184; // one grid cell is U px
  const r = (x, y, w, h, c = BODY, id = '') => `<rect ${id ? `id="${id}"` : ''} x="${X + x * U}" y="${Y + y * U}" width="${w * U}" height="${h * U}" fill="${c}"/>`;
  host.innerHTML = `<svg viewBox="0 0 400 470" width="400" height="470" overflow="visible" shape-rendering="crispEdges">
  <g id="shadow" fill="#000">${r(2.5, 8.05, 7, .25, '#000')}</g>
  <g id="all">
    ${[2, 4, 7, 9].map((x, i) => r(x, 5.75, 1, 2.25, BODY, 'l' + i)).join('')}
    <g id="body">
      <g id="aL">${r(0, 2, 2.05, 2)}</g><g id="aR">${r(9.95, 2, 2.05, 2)}</g>
      ${r(2, 0, 8, 6)}
      <g id="eyes">${r(3, 1, 1, 1, INK, 'eL')}${r(8, 1, 1, 1, INK, 'eR')}</g>
      <g id="happy">${[3, 8].map((x) => r(x - .25, 1.5, .5, .5, INK) + r(x + .25, 1.1, .5, .5, INK) + r(x + .75, 1.5, .5, .5, INK)).join('')}</g>
      <g id="brows">${r(2.75, .5, .75, .25, INK)}${r(3.5, .25, .75, .25, INK)}${r(7.75, .25, .75, .25, INK)}${r(8.5, .5, .75, .25, INK)}</g>
      ${r(5.25, 2.75, 1.5, 1, INK, 'mouth')}${r(5.5, 3.5, 1, .25, '#E8776A', 'tongue')}
    </g>
  </g></svg>`;
  const q = (id) => host.querySelector('#' + id), set = (id, k, v) => q(id).setAttribute(k, v);
  const snap = (v, s) => Math.round(v / s) * s;
  // arm height in cells [left, right], negative = raised
  const POSE = { rest: [0, 0], wave: [0, -1.5], point: [0, -.75], think: [.25, -1], cheer: [-1.5, -1.5], explain: [-.5, -.5] };
  // [eye width, eye height, gaze x, gaze y, happy arcs, brows]
  const FACE = { happy: [1, 1, 0, 0, 0, 0], wow: [1, 1.5, 0, -.25, 0, 0], think: [1, 1, .25, -.25, 0, 0], joy: [1, 1, 0, 0, 1, 0], worried: [1, 1, 0, .25, 0, 1] };
  // mouth shapes while talking, in cells: [width, height]
  const VIS = { a: [1.5, 1.5], e: [2, .75], o: [1, 1.25], u: [.75, .75], m: [1.25, .25], f: [1.25, .5], x: [1.25, 1] };
  return ({ t, pose = 'rest', from = pose, k = 1, face = 'happy', level = 0, vis = 'x', since = 9 }) => {
    const p = [0, 1].map((i) => POSE[from][i] + (POSE[pose][i] - POSE[from][i]) * k), f = FACE[face];
    if (pose === 'wave') p[1] += Math.sin(t * 12) * .5;
    if (pose === 'explain') { p[0] += Math.sin(t * 4.3 + 2) * .6; p[1] += Math.sin(t * 4.3) * .6; }
    if (pose === 'point') p[1] += Math.sin(t * 5) * .25;
    // hop on each new shot, little hops when joyful, a breathing bob and a talking bounce otherwise
    const jump = since < .5 ? Math.sin(since / .5 * Math.PI) : 0, cheer = face === 'joy' ? Math.pow(Math.sin(t * 4.4), 2) : 0;
    const land = since >= .5 && since < .7 ? Math.sin((since - .5) / .2 * Math.PI) : 0;
    const lift = snap(jump * 34 + cheer * 24, 4), bob = snap((Math.sin(t * 2.8) + 1) * 3 + level * 7 + land * 14, 4);
    set('all', 'transform', `translate(${snap(Math.sin(t * .9) * 5, 4)} ${-lift})`);
    set('body', 'transform', `translate(0 ${bob})`);
    q('shadow').setAttribute('opacity', .34 - lift * .004);
    [0, 1, 2, 3].forEach((i) => { // legs stretch with the bob; one foot taps now and then
      const tap = i === 3 && t % 6 > 4.6 && Math.sin(t * 11) > 0 ? .25 : 0, tuck = jump > .4 && (i === 1 || i === 2) ? .25 : 0;
      const top = Y + 5.75 * U + bob; set('l' + i, 'y', top); set('l' + i, 'height', Y + (8 - tap - tuck) * U - top);
    });
    set('aL', 'transform', `translate(0 ${snap(p[0], .25) * U})`); set('aR', 'transform', `translate(0 ${snap(p[1], .25) * U})`);
    const blink = t % 3.4 > 3.27 || (t % 8.3 > 8.05 && t % 8.3 < 8.16), look = t % 7.1 > 5.9 ? .25 : 0;
    q('eyes').style.display = f[4] ? 'none' : ''; q('happy').style.display = f[4] ? '' : 'none'; q('brows').style.display = f[5] ? '' : 'none';
    ['L', 'R'].forEach((s, i) => {
      const x = (i ? 8 : 3) + f[2] + look, h = blink ? .25 : f[1];
      set('e' + s, 'x', X + x * U); set('e' + s, 'y', Y + (1 + f[3] + (1 - h) / 2) * U); set('e' + s, 'width', f[0] * U); set('e' + s, 'height', h * U);
    });
    const talk = level > .06, shape = VIS[vis] || VIS.x;
    const w = talk ? shape[0] : face === 'joy' ? 2 : face === 'wow' ? .75 : face === 'worried' ? 1.25 : 0;
    const h = talk ? Math.max(.25, snap(shape[1] * (.4 + .6 * Math.min(1, level)), .25)) : face === 'joy' ? .75 : face === 'wow' ? .75 : w ? .25 : 0;
    set('mouth', 'x', X + (6 - w / 2) * U); set('mouth', 'width', w * U); set('mouth', 'height', h * U);
    const tw = h >= 1 || (face === 'joy' && !talk) ? w - .5 : 0;
    set('tongue', 'x', X + (6 - tw / 2) * U); set('tongue', 'width', Math.max(0, tw) * U); set('tongue', 'y', Y + (2.75 + h - .25) * U);
  };
}
