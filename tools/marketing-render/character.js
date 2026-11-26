// The VAgent presenter: our own flat SVG character in a warm, friendly style (terracotta bob, cream knit).
// makeGirl(host) -> draw(state). Deterministic: everything comes from the time and the state passed in.
function makeGirl(host) {
  const INK = '#2A1D18', SKIN = '#F4C6A6', SHADE = '#E5A987', HAIR = '#C25E3A', HAIR2 = '#A4482A', HI = '#E08156', KNIT = '#F3EDE2', KNIT2 = '#DDD3C1';
  host.innerHTML = `<svg viewBox="0 0 400 470" width="400" height="470" overflow="visible">
  <g id="body">
    <g id="hairB"><path d="M200 40C96 40 62 118 66 200C69 258 52 292 72 318C98 346 140 322 152 300L252 300C266 324 306 346 330 316C348 292 331 256 334 200C338 116 302 40 200 40Z" fill="${HAIR2}"/></g>
    <path d="M70 470C72 372 118 322 170 312L230 312C284 322 328 372 330 470Z" fill="${KNIT}"/>
    <path d="M168 266L168 320C176 346 224 346 232 320L232 266Z" fill="${SKIN}"/><path d="M168 288C188 312 214 312 232 288L232 278L168 278Z" fill="${SHADE}"/>
    <path d="M166 313C172 356 228 356 234 313" fill="none" stroke="#B5532F" stroke-width="11" stroke-linecap="round"/>
    <path d="M104 470C106 430 112 400 122 382M296 470C294 430 288 400 278 382" fill="none" stroke="${KNIT2}" stroke-width="5" stroke-linecap="round"/>
    <g id="head">
      <ellipse cx="103" cy="196" rx="15" ry="20" fill="${SKIN}"/><ellipse cx="297" cy="196" rx="15" ry="20" fill="${SKIN}"/>
      <path d="M105 160C105 98 146 76 200 76C254 76 295 98 295 160L295 192C295 256 250 295 200 295C150 295 105 256 105 192Z" fill="${SKIN}"/>
      <ellipse cx="137" cy="229" rx="19" ry="11" fill="#E8836A" opacity=".45"/><ellipse cx="263" cy="229" rx="19" ry="11" fill="#E8836A" opacity=".45"/>
      <g id="brows" fill="none" stroke="${HAIR2}" stroke-width="7" stroke-linecap="round"><path id="bL"/><path id="bR"/></g>
      <g id="eyes"><g id="eL"><ellipse cx="155" cy="190" rx="15" ry="19" fill="${INK}"/><circle cx="161" cy="182" r="6" fill="#fff"/><circle cx="150" cy="198" r="2.6" fill="#fff"/></g>
        <g id="eR"><ellipse cx="245" cy="190" rx="15" ry="19" fill="${INK}"/><circle cx="251" cy="182" r="6" fill="#fff"/><circle cx="240" cy="198" r="2.6" fill="#fff"/></g></g>
      <g fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"><path id="cL" d="M138 195Q155 172 172 195"/><path id="cR" d="M228 195Q245 172 262 195"/></g>
      <path d="M196 214Q200 222 207 217" fill="none" stroke="${SHADE}" stroke-width="5" stroke-linecap="round"/>
      <path id="mouth" stroke="#7A2E22" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><ellipse id="tongue" cx="200" fill="#E8776A"/>
      <g id="hairF"><path d="M99 188C88 98 132 52 200 52C276 52 314 100 301 192C288 168 282 146 276 126C250 152 190 166 130 150C150 140 168 124 176 108C152 134 124 146 112 148C106 160 102 174 99 188Z" fill="${HAIR}"/>
        <path d="M132 92C160 66 214 62 246 80" fill="none" stroke="${HI}" stroke-width="9" stroke-linecap="round"/>
        <path d="M100 176C90 222 96 262 76 292C112 286 124 246 116 190ZM300 176C310 222 304 262 324 292C288 286 276 246 284 190Z" fill="${HAIR}"/>
        <rect x="262" y="104" width="38" height="12" rx="6" fill="${KNIT}" transform="rotate(38 281 110)"/><rect x="254" y="120" width="30" height="10" rx="5" fill="${KNIT}" transform="rotate(38 269 125)"/></g>
    </g>
    <g fill="none" stroke-linecap="round"><path id="aL" stroke="${KNIT}" stroke-width="40"/><path id="aR" stroke="${KNIT}" stroke-width="40"/></g>
    <g id="hL"><circle r="23" fill="${SKIN}"/><path d="M8 -18Q22 -34 28 -20" stroke="${SKIN}" stroke-width="13" stroke-linecap="round" fill="none"/></g>
    <g id="hR"><circle r="23" fill="${SKIN}"/><path d="M-8 -18Q-22 -34 -28 -20" stroke="${SKIN}" stroke-width="13" stroke-linecap="round" fill="none"/></g>
  </g></svg>`;
  const q = (id) => host.querySelector('#' + id), set = (id, k, v) => q(id).setAttribute(k, v);
  // hands: [leftX, leftY, rightX, rightY]
  const POSE = { rest: [118, 446, 282, 446], wave: [118, 446, 366, 250], point: [118, 446, 392, 300], think: [118, 446, 238, 308], cheer: [34, 270, 366, 270], explain: [40, 408, 360, 408] };
  // [brow inner lift, brow height, eye scale, closed-eye arcs, gaze x, gaze y]
  const FACE = { happy: [0, 0, 1, 0, 0, 0], wow: [0, -12, 1.18, 0, 0, 0], think: [-4, -6, 1, 0, 7, -8], joy: [0, -6, 1, 1, 0, 0], worried: [-13, -2, 1.04, 0, 0, 2] };
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  return ({ t, pose = 'rest', from = pose, k = 1, face = 'happy', level = 0 }) => {
    const e = k * k * (3 - 2 * k), p = mix(POSE[from], POSE[pose], e), f = FACE[face];
    if (pose === 'wave') p[2] += Math.sin(t * 11) * 24 * e;
    if (pose === 'explain' || pose === 'point') { p[3] += Math.sin(t * 4.2) * 9; if (pose === 'explain') p[1] += Math.sin(t * 4.2 + 2) * 9; }
    const breathe = Math.sin(t * 2.1) * 3.5, tilt = Math.sin(t * 0.9) * 2.4 + (face === 'think' ? 6 : 0) + level * Math.sin(t * 7) * 1.6;
    set('body', 'transform', `translate(0 ${breathe})`);
    set('head', 'transform', `translate(0 ${-level * 5}) rotate(${tilt} 200 290)`);
    set('hairB', 'transform', `rotate(${tilt * 0.7 + Math.sin(t * 1.7) * 0.8} 200 120)`);
    const blink = t % 3.3 > 3.16 || (t % 7.9 > 7.7 && t % 7.9 < 7.82);
    ['L', 'R'].forEach((s, i) => {
      const x = i ? 245 : 155, sx = i ? -1 : 1;
      set('e' + s, 'transform', `translate(${x + f[4]} ${190 + f[5]}) scale(${f[2]} ${blink ? 0.1 : f[2]}) translate(${-x} -190)`);
      q('e' + s).style.display = f[3] ? 'none' : ''; q('c' + s).style.display = f[3] ? '' : 'none';
      const y = 154 + f[1];
      set('b' + s, 'd', `M${x - 19 * sx} ${y + 3}Q${x} ${y - 9} ${x + 18 * sx} ${y + 1 + f[0]}`);
    });
    const open = level > 0.07 ? Math.min(1, level) : 0;
    let d, fill = '#7A2E22', tongue = 0;
    if (open) { const w = 22 + open * 10, h = 8 + open * 30; d = `M${200 - w} 243Q200 249 ${200 + w} 243Q${200 + w * 0.7} ${243 + h} 200 ${243 + h}Q${200 - w * 0.7} ${243 + h} ${200 - w} 243Z`; tongue = open > 0.35 ? h * 0.22 : 0; set('tongue', 'cy', 243 + h - tongue - 3); }
    else if (face === 'wow') d = 'M188 254C188 236 212 236 212 254C212 272 188 272 188 254Z';
    else if (face === 'joy') d = 'M172 242Q200 247 228 242Q222 272 200 272Q178 272 172 242Z';
    else { fill = 'none'; d = face === 'worried' ? 'M182 256Q200 244 218 256' : face === 'think' ? 'M184 252Q204 256 218 244' : 'M174 245Q200 270 226 245'; }
    set('mouth', 'd', d); set('mouth', 'fill', fill); set('tongue', 'rx', tongue * 1.8); set('tongue', 'ry', tongue);
    [['L', 126, p[0], p[1]], ['R', 274, p[2], p[3]]].forEach(([s, sx, x, y], i) => {
      const elbowX = sx + (i ? 1 : -1) * 62, elbowY = Math.max(y, 380) + 34;
      set('a' + s, 'd', `M${sx} 380Q${elbowX} ${elbowY} ${x} ${y}`);
      set('h' + s, 'transform', `translate(${x} ${y})`);
    });
  };
}
