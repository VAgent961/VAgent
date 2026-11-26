// Vee, the VAgent presenter: our own blocky terracotta girl pet with arms, legs and a black bow (papillon).
// makeGirl(host) -> draw(state). Deterministic: everything comes from the time and the state passed in.
function makeGirl(host) {
  const INK = '#1C1210', BODY = '#D97757', LIGHT = '#EA9374', DARK = '#B75B3D', DEEP = '#96462E', BOW = '#0E0C0C';
  const leg = (id, x, c) => `<g id="${id}"><rect x="${x}" y="338" width="38" height="96" rx="13" fill="${c}"/><rect x="${x - 3}" y="414" width="44" height="22" rx="10" fill="${DEEP}"/></g>`;
  const arm = (id) => `<g id="${id}"><rect x="-14" y="-25" width="92" height="50" rx="19" fill="${BODY}" stroke="${DARK}" stroke-width="4"/><rect x="52" y="-17" width="18" height="13" rx="6" fill="${LIGHT}"/></g>`;
  const eye = (s, x) => `<g id="e${s}"><rect x="${x - 17}" y="206" width="34" height="52" rx="14" fill="${INK}"/><rect x="${x - 8}" y="213" width="14" height="15" rx="6" fill="#fff"/><circle cx="${x + 7}" cy="244" r="4" fill="#fff" opacity=".85"/>
    <path d="${s === 'L' ? `M${x - 13} 211L${x - 28} 200M${x - 17} 224L${x - 32} 219` : `M${x + 13} 211L${x + 28} 200M${x + 17} 224L${x + 32} 219`}" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/></g>`;
  host.innerHTML = `<svg viewBox="0 0 400 470" width="400" height="470" overflow="visible">
  <defs><linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${LIGHT}"/><stop offset=".28" stop-color="${BODY}"/><stop offset="1" stop-color="#CB6A4B"/></linearGradient></defs>
  <ellipse id="shadow" cx="200" cy="442" rx="132" ry="15" fill="#000" opacity=".38"/>
  <g id="all">
    ${leg('l1', 100, DARK)}${leg('l4', 262, DARK)}${leg('l2', 144, BODY)}${leg('l3', 218, BODY)}
    <g id="body">
      ${arm('aL')}${arm('aR')}
      <rect x="72" y="146" width="256" height="226" rx="38" fill="url(#skin)"/>
      <path d="M72 322V334C72 355 89 372 110 372H290C311 372 328 355 328 334V322C328 343 311 354 290 354H110C89 354 72 343 72 322Z" fill="${DARK}"/>
      <rect x="96" y="160" width="96" height="11" rx="5.5" fill="#fff" opacity=".28"/>
      <g id="face">
        <rect x="95" y="264" width="42" height="22" rx="11" fill="#F7A08C" opacity=".75"/><rect x="263" y="264" width="42" height="22" rx="11" fill="#F7A08C" opacity=".75"/>
        <g fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"><path id="bL"/><path id="bR"/></g>
        ${eye('L', 148)}${eye('R', 252)}
        <g fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><path id="cL" d="M128 240Q148 208 168 240"/><path id="cR" d="M232 240Q252 208 272 240"/></g>
        <clipPath id="mc"><path id="mclip"/></clipPath>
        <path id="mouth" stroke="${INK}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
        <g clip-path="url(#mc)"><rect id="teeth" x="170" width="60" height="9" rx="3" fill="#fff"/><ellipse id="tongue" cx="200" fill="#EF8577"/></g>
      </g>
      <g id="bow" stroke="#4A4040" stroke-width="3" stroke-linejoin="round">
        <path d="M188 150C176 170 166 186 148 192L150 176L134 176C154 166 168 152 178 140ZM212 150C224 170 234 186 252 192L250 176L266 176C246 166 232 152 222 140Z" fill="${BOW}"/>
        <path d="M190 128C160 92 112 80 102 98C90 118 96 160 112 168C132 176 168 160 190 146Z" fill="${BOW}"/>
        <path d="M210 128C240 92 288 80 298 98C310 118 304 160 288 168C268 176 232 160 210 146Z" fill="${BOW}"/>
        <path d="M118 104C134 100 156 112 174 126M282 104C266 100 244 112 226 126" fill="none" stroke="#6B5E5E" stroke-width="6" stroke-linecap="round"/>
        <rect x="177" y="116" width="46" height="44" rx="16" fill="${BOW}"/><rect x="186" y="123" width="18" height="8" rx="4" fill="#6B5E5E" stroke="none"/>
      </g>
    </g>
  </g></svg>`;
  const q = (id) => host.querySelector('#' + id), set = (id, k, v) => q(id).setAttribute(k, v);
  // arm angles in degrees [left, right], 0 = straight out, negative = raised
  const POSE = { rest: [48, 48], wave: [38, -52], point: [40, -30], think: [44, -8], cheer: [-55, -55], explain: [4, -12] };
  // [brow inner lift, brow height, eye scale, happy arcs, gaze x, gaze y]
  const FACE = { happy: [0, 0, 1, 0, 0, 0], wow: [0, -9, 1.13, 0, 0, 0], think: [-3, -5, 1, 0, 8, -7], joy: [0, -5, 1, 1, 0, 0], worried: [-12, -1, 1.03, 0, 0, 3] };
  // mouth shapes while talking: [half width, height]
  const VIS = { a: [27, 36], e: [34, 22], o: [18, 32], u: [14, 22], m: [22, 0], f: [26, 11], x: [25, 20] };
  const lerp = (a, b, k) => a + (b - a) * k;
  return ({ t, pose = 'rest', from = pose, k = 1, face = 'happy', level = 0, vis = 'x', since = 9 }) => {
    const e = k * k * (3 - 2 * k), p = [0, 1].map((i) => lerp(POSE[from][i], POSE[pose][i], e)), f = FACE[face];
    if (pose === 'wave') p[1] += Math.sin(t * 12) * 22 * e;
    if (pose === 'explain') { p[0] += Math.sin(t * 4.3 + 2) * 11; p[1] += Math.sin(t * 4.3) * 13; }
    if (pose === 'point') p[1] += Math.sin(t * 5) * 6;
    if (pose === 'think') p[1] += Math.sin(t * 2.4) * 4;
    // hop on each new shot, small hops when joyful, soft breathing and a talking bob otherwise
    const jump = since < .5 ? Math.sin(since / .5 * Math.PI) : 0, cheer = face === 'joy' ? Math.pow(Math.abs(Math.sin(t * 4.4)), 2) : 0;
    const lift = jump * 30 + cheer * 22, breathe = Math.sin(t * 2.6), squash = breathe * .012 + level * .022 - jump * .035 + (since >= .5 && since < .72 ? Math.sin((since - .5) / .22 * Math.PI) * .06 : 0);
    const tilt = Math.sin(t * 1.1) * 1.6 + (face === 'think' ? 4 : 0) + level * Math.sin(t * 6.5) * 1.2;
    set('all', 'transform', `translate(0 ${-lift})`);
    set('body', 'transform', `translate(0 ${breathe * 2 + level * 3}) rotate(${tilt} 200 360) translate(200 372) scale(${1 + squash} ${1 - squash}) translate(-200 -372)`);
    set('shadow', 'rx', 132 - lift * 1.1); set('shadow', 'opacity', .38 - lift * .004);
    const tap = Math.max(0, Math.sin(t * 5.2));
    set('l1', 'transform', ''); set('l2', 'transform', `translate(0 ${-jump * 8})`); set('l3', 'transform', `translate(0 ${-jump * 8})`);
    set('l4', 'transform', `translate(0 ${t % 6 > 4.6 ? -tap * 10 : 0})`);
    set('aL', 'transform', `translate(82 278) scale(-1 1) rotate(${p[0]})`);
    set('aR', 'transform', `translate(318 278) rotate(${p[1]})`);
    const flap = Math.sin(t * 3.1) * 2.5 + (since < .7 ? Math.sin(since * 22) * 9 * (1 - since / .7) : 0);
    set('bow', 'transform', `translate(0 ${-jump * 7}) rotate(${flap} 200 140)`);
    set('face', 'transform', `translate(${f[4] * .6 + Math.sin(t * .8) * 3} ${-level * 3})`);
    const blink = t % 3.4 > 3.27 || (t % 8.3 > 8.05 && t % 8.3 < 8.16);
    ['L', 'R'].forEach((s, i) => {
      const x = i ? 252 : 148, sx = i ? -1 : 1;
      set('e' + s, 'transform', `translate(${x + f[4]} ${232 + f[5]}) scale(${f[2]} ${blink ? .1 : f[2]}) translate(${-x} -232)`);
      q('e' + s).style.display = f[3] ? 'none' : ''; q('c' + s).style.display = f[3] ? '' : 'none';
      const y = 191 + f[1] - level * 4;
      set('b' + s, 'd', `M${x - 17 * sx} ${y + 2}Q${x} ${y - 8} ${x + 17 * sx} ${y + f[0]}`);
    });
    let d, fill = '#5A1712', teeth = 0, tongue = 0, h = 0;
    const shape = VIS[vis] || VIS.x;
    if (level > .06 && shape[1]) {
      const w = shape[0]; h = shape[1] * (.45 + .65 * Math.min(1, level));
      d = `M${200 - w} 274Q200 267 ${200 + w} 274C${200 + w} ${274 + h * .8} ${200 + w * .55} ${274 + h} 200 ${274 + h}C${200 - w * .55} ${274 + h} ${200 - w} ${274 + h * .8} ${200 - w} 274Z`;
      teeth = h > 17; tongue = h > 13 ? h * .3 : 0;
    } else if (level > .06) d = 'M180 278Q200 283 220 278';
    else if (face === 'wow') { d = 'M186 284C186 264 214 264 214 284C214 306 186 306 186 284Z'; }
    else if (face === 'joy') { d = 'M170 270Q200 276 230 270Q224 308 200 308Q176 308 170 270Z'; h = 34; tongue = 11; teeth = 1; }
    else { fill = 'none'; d = face === 'worried' ? 'M182 288Q200 272 218 288' : face === 'think' ? 'M185 281Q204 286 220 272' : 'M174 272Q200 298 226 272'; }
    set('mouth', 'd', d); set('mouth', 'fill', fill); set('mclip', 'd', d);
    q('teeth').style.display = teeth ? '' : 'none'; set('teeth', 'y', 268);
    set('tongue', 'rx', tongue ? 17 : 0); set('tongue', 'ry', tongue); set('tongue', 'cy', 274 + h - tongue * .35);
  };
}
