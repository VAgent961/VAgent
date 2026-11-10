// Generates the whole office SVG from an array of department objects {id, name, color}.
// plus the CEO office, the café, the messenger corner and open desks. Floor coords -> screen: X = 600 + 0.8(x - y), Y = 110 + 0.462(x + y).
// window.VScene.build(departments) -> { inner, vb, desks, deskRoom, rooms[{desks, rest, lead, box}], hot, cafe, cafeIdx, spotProp, ceo, helper }
(function () {
  const P = (x, y, h = 0) => [600 + 0.8 * (x - y), 110 + 0.462 * (x + y) - h];
  const f = (n) => n.toFixed(1);
  const pts = (...a) => a.map((p) => f(p[0]) + ',' + f(p[1])).join(' ');
  const poly = (fill, ...a) => `<polygon points="${pts(...a)}" fill="${fill}"/>`;
  const box = (x0, y0, x1, y1, h, [top, front, side], z = 0) =>
    poly(side, P(x1, y0, z), P(x1, y1, z), P(x1, y1, z + h), P(x1, y0, z + h)) +
    poly(front, P(x0, y1, z), P(x1, y1, z), P(x1, y1, z + h), P(x0, y1, z + h)) +
    poly(top, P(x0, y0, z + h), P(x1, y0, z + h), P(x1, y1, z + h), P(x0, y1, z + h));
  const use = (id, x, y, extra = '', h = 0) => { const [X, Y] = P(x, y, h); return `<use href="#${id}" x="${f(X)}" y="${f(Y)}" ${extra}/>`; };
  const glass = (x0, y0, x1, y1, h = 62, gap) => {
    const seg = (a, b) => { const A = [x0 + (x1 - x0) * a, y0 + (y1 - y0) * a], B = [x0 + (x1 - x0) * b, y0 + (y1 - y0) * b];
      return `<polygon points="${pts(P(...A), P(...B), P(...B, h), P(...A, h))}" fill="#7FA3B3" opacity="0.22" stroke="#4F6B78"/><polyline points="${pts(P(...A, h), P(...B, h))}" stroke="#5F7F8C" stroke-width="2.5" fill="none"/>`; };
    return gap ? seg(0, gap[0]) + seg(gap[1], 1) : seg(0, 1);
  };
  const onWallR = (x, h) => { const [X, Y] = P(x, 0, h); return `matrix(0.866 0.5 0 1 ${f(X)} ${f(Y)})`; };
  const onPlaneY = (x, y, h) => { const [X, Y] = P(x, y, h); return `matrix(0.866 0.5 0 1 ${f(X)} ${f(Y)})`; };
  const sky = (a, b, h0, h1, wall) => { const Q = wall === 'R' ? (t, h) => P(t, 0, h) : (t, h) => P(0, t, h);
    return `<polygon points="${pts(Q(a - 4, h0 - 4), Q(b + 4, h0 - 4), Q(b + 4, h1 + 4), Q(a - 4, h1 + 4))}" fill="#45454C"/><polygon points="${pts(Q(a, h0), Q(b, h0), Q(b, h1), Q(a, h1))}" fill="url(#sky)"/><polyline points="${pts(Q((a + b) / 2, h0), Q((a + b) / 2, h1))}" stroke="#45454C" stroke-width="3"/>`; };

  // Detailed avatar generator (drop-in for the flat symbols). Unscaled coords: feet y=0, head top ~ -150.
  // Shading uses black/white overlays so it works for every skin / cloth colour. No gradients/ids needed.
  const char = (o) => {
    const { s, skin, hair, hairL, jacket, jacketD, pants, kind, iris = '#3A2A20', brow } = o;
    const eyebrow = brow || hair;
    const isDark = (kind === 'lead' || kind === 'ceo');
    const star = (cx, cy, r) => {
      const p = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p.push((cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1)); }
      return `<polygon points="${p.join(' ')}" fill="#E9C46A" stroke="#B8862B" stroke-width=".5"/>`;
    };
  
    // ── legs + shoes
    const legs =
      `<ellipse rx="30" ry="6.5" fill="#141413" opacity=".13"/><ellipse rx="19" ry="4" fill="#141413" opacity=".16"/>` +
      `<rect x="-12" y="-24" width="10" height="23" rx="2" fill="${pants}"/><rect x="2" y="-24" width="10" height="23" rx="2" fill="${pants}"/>` +
      `<rect x="-5" y="-24" width="3" height="23" fill="#000" opacity=".18"/><rect x="2" y="-24" width="3" height="23" fill="#000" opacity=".18"/>` +
      `<rect x="-11" y="-23" width="2" height="19" fill="#fff" opacity=".08"/><rect x="9" y="-23" width="2" height="19" fill="#fff" opacity=".05"/>` +
      `<path d="M-7 -20 V-7 M7 -20 V-7" stroke="#fff" stroke-width="1" opacity=".12"/>` +
      // shoes: dark upper, light sole, highlight, laces
      `<path d="M-15 1 Q-16 -5 -10 -5.5 L-2 -5.5 L-2 1 Z" fill="#1B1B1E"/><path d="M15 1 Q16 -5 10 -5.5 L2 -5.5 L2 1 Z" fill="#1B1B1E"/>` +
      `<rect x="-16" y="-1.5" width="15" height="3" rx="1.5" fill="#EDEBE3"/><rect x="1" y="-1.5" width="15" height="3" rx="1.5" fill="#EDEBE3"/>` +
      `<rect x="-12" y="-4.4" width="7" height="1.3" rx=".65" fill="#fff" opacity=".28"/><rect x="5" y="-4.4" width="7" height="1.3" rx=".65" fill="#fff" opacity=".28"/>` +
      `<path d="M-6 -5.2 v2.2 M-4 -5.2 v2.2 M4 -5.2 v2.2 M6 -5.2 v2.2" stroke="#fff" stroke-width=".7" opacity=".45"/>`;
  
    // ── neck (behind torso/head)
    const neck = `<rect x="-8" y="-74" width="16" height="16" rx="4" fill="${skin}"/><rect x="0" y="-74" width="8" height="16" rx="3" fill="#000" opacity=".1"/><ellipse cx="0" cy="-66" rx="13" ry="5" fill="#000" opacity=".2"/>`;
  
    // ── torso (jacket) + shading
    const torso =
      `<rect x="-24" y="-62" width="48" height="42" rx="12" fill="${jacket}"/>` +
      `<path d="M9 -62 H12 Q24 -62 24 -50 V-32 Q24 -20 12 -20 H9 Q17 -40 9 -62 Z" fill="#000" opacity=".13"/>` +
      `<path d="M-22 -52 Q-23.5 -42 -21.5 -32" stroke="#fff" stroke-width="2" opacity=".13" fill="none" stroke-linecap="round"/>` +
      `<path d="M-21 -23.5 Q0 -19 21 -23.5" stroke="#000" stroke-width="1.1" opacity=".18" fill="none"/>`;
  
    // ── front of the outfit (kind-specific)
    let front = '';
    if (kind === 'worker' || kind === 'botlead' || kind === 'msg') {
      front =
        `<polygon points="-9,-62 9,-62 0,-40" fill="#FFFFFF"/><polygon points="0,-62 9,-62 0,-40" fill="#000" opacity=".08"/>` +
        `<path d="M-11 -64 L-1 -60 L-9 -50 L-15 -57 Z" fill="#F4F2EC" stroke="#000" stroke-opacity=".14" stroke-width=".8"/>` +
        `<path d="M11 -64 L1 -60 L9 -50 L15 -57 Z" fill="#E4E1D8" stroke="#000" stroke-opacity=".14" stroke-width=".8"/>` +
        // tie: knot, blade, shade, highlight, bar
        `<polygon points="-4,-60.5 4,-60.5 3,-54 -3,-54" fill="${kind === 'msg' ? '#9FD0D6' : 'currentColor'}"/>` +
        `<polygon points="-3,-54 3,-54 6,-31 0,-26 -6,-31" fill="${kind === 'msg' ? '#9FD0D6' : 'currentColor'}"/>` +
        `<polygon points="0,-54 3,-54 6,-31 0,-26" fill="#000" opacity=".22"/><path d="M-1.4 -52 L-3 -33" stroke="#fff" stroke-width="1.2" opacity=".3" stroke-linecap="round"/>` +
        `<rect x="-4.2" y="-46" width="8.4" height="1.7" rx=".85" fill="#E9C46A"/>`;
      if (kind !== 'msg') {
        front +=
          // ID badge on the left chest, pen in right pocket
          `<rect x="-21" y="-49" width="9.5" height="12.5" rx="1.6" fill="#FFFFFF" stroke="#000" stroke-opacity=".18" stroke-width=".6"/>` +
          `<rect x="-21" y="-49" width="9.5" height="3.6" rx="1.2" fill="currentColor"/><circle cx="-16.2" cy="-42" r="2.4" fill="#C9B79C"/><rect x="-19" y="-38.4" width="5.6" height="1" rx=".5" fill="#9A968A"/>` +
          `<rect x="12" y="-50" width="9" height="1.5" rx=".75" fill="#000" opacity=".22"/><rect x="15.2" y="-55" width="1.7" height="6.5" rx=".85" fill="#E9C46A"/>`;
      }
      if (kind === 'botlead') front += star(16, -43, 3.6);
      if (kind === 'msg') {
        // satchel strap across the chest
        front += `<path d="M-17 -62 L25 -33" stroke="#6AA9B1" stroke-width="5" stroke-linecap="round"/><path d="M-17 -62 L25 -33" stroke="#fff" stroke-width="1" opacity=".25" stroke-linecap="round" transform="translate(-1 -1.5)"/>`;
      }
    } else if (kind === 'lead') {
      front =
        `<polygon points="-9,-62 9,-62 5,-22 -5,-22" fill="#FFFFFF"/><polygon points="0,-62 9,-62 5,-22 0,-22" fill="#000" opacity=".07"/>` +
        `<polygon points="-9,-62 -23,-61 -21,-42 -10,-30 -3,-24 -4,-44" fill="#323237"/><polygon points="9,-62 23,-61 21,-42 10,-30 3,-24 4,-44" fill="#2A2A2E"/>` +
        `<path d="M-9 -62 L-4 -44 L-3 -24 M9 -62 L4 -44 L3 -24" stroke="#fff" stroke-opacity=".12" stroke-width="1" fill="none"/>` +
        `<circle cx="0" cy="-45" r="1.1" fill="#C9C5B8"/><circle cx="0" cy="-37" r="1.1" fill="#C9C5B8"/><circle cx="0" cy="-29" r="1.1" fill="#C9C5B8"/>` +
        // bow tie
        `<polygon points="-11.5,-61.5 -1,-57 -11.5,-52" fill="#141413"/><polygon points="11.5,-61.5 1,-57 11.5,-52" fill="#141413"/><rect x="-2.3" y="-59.8" width="4.6" height="5.6" rx="1.2" fill="#2A2A2E"/>` +
        `<path d="M-9 -59 L-3 -57" stroke="#fff" stroke-opacity=".25" stroke-width=".8"/>` +
        // coloured pocket square + lapel pin
        `<polygon points="12,-46.5 13.6,-52.5 16.2,-49.2 18.6,-52.6 20,-46.5" fill="currentColor"/><rect x="11.5" y="-47.2" width="9" height="1.4" rx=".7" fill="#000" opacity=".3"/>` +
        `<circle cx="-17" cy="-52" r="1.8" fill="#E9C46A"/>`;
    } else if (kind === 'ceo') {
      front =
        `<polygon points="-9,-62 9,-62 5,-22 -5,-22" fill="#FFFFFF"/><polygon points="0,-62 9,-62 5,-22 0,-22" fill="#000" opacity=".07"/>` +
        `<polygon points="-9,-62 -23,-61 -21,-42 -10,-30 -3,-24 -4,-44" fill="#E8BE45"/><polygon points="9,-62 23,-61 21,-42 10,-30 3,-24 4,-44" fill="#C29523"/>` +
        `<path d="M-9 -62 L-4 -44 L-3 -24 M9 -62 L4 -44 L3 -24" stroke="#7A5A12" stroke-opacity=".45" stroke-width="1" fill="none"/>` +
        `<circle cx="0" cy="-45" r="1.1" fill="#C9C5B8"/><circle cx="0" cy="-37" r="1.1" fill="#C9C5B8"/><circle cx="0" cy="-29" r="1.1" fill="#C9C5B8"/>` +
        `<polygon points="-11.5,-61.5 -1,-57 -11.5,-52" fill="#141413"/><polygon points="11.5,-61.5 1,-57 11.5,-52" fill="#141413"/><rect x="-2.3" y="-59.8" width="4.6" height="5.6" rx="1.2" fill="#2A2A2E"/>` +
        `<polygon points="12,-46.5 13.6,-52 16.2,-49.5 18.6,-52 20,-46.5" fill="#FFFFFF"/><rect x="11.5" y="-47.2" width="9" height="1.4" rx=".7" fill="#000" opacity=".25"/>` +
        `<circle cx="-17" cy="-52" r="2" fill="#141413"/><circle cx="-17.5" cy="-52.5" r=".7" fill="#fff" opacity=".7"/>`;
    }
  
    // ── arms: sleeve, shade, cuff, hand with thumb + finger lines
    const hand = (cx, flip) =>
      `<circle cx="${cx}" cy="-28" r="4.6" fill="${skin}"/><ellipse cx="${cx + 4.2 * flip}" cy="-29.5" rx="1.9" ry="3.1" fill="${skin}"/>` +
      `<path d="M${cx - 2.4} -25.6 v2.2 M${cx} -24.9 v2.6 M${cx + 2.4} -25.6 v2.2" stroke="#000" stroke-width=".7" opacity=".28" stroke-linecap="round"/>` +
      `<path d="M${cx - 3.4} -31.5 Q${cx} -34 ${cx + 3.4} -31.5" stroke="#000" stroke-width=".8" opacity=".15" fill="none"/>`;
    const watch = o.watch === 'gold' ? ['#D4AF37', '#F2E29B'] : ['#2A2A2E', '#9FD0D6'];
    const arms =
      `<rect x="-30" y="-60" width="9" height="30" rx="4.5" fill="${jacket}"/><rect x="21" y="-60" width="9" height="30" rx="4.5" fill="${jacketD}"/>` +
      `<rect x="24.5" y="-60" width="5.5" height="30" rx="2.8" fill="#000" opacity=".12"/><path d="M-28.5 -54 Q-29.5 -46 -28 -39" stroke="#fff" stroke-width="1.6" opacity=".13" fill="none" stroke-linecap="round"/>` +
      `<path d="M-29 -45 q4 2.2 8 0" stroke="#000" stroke-width="1" opacity=".16" fill="none"/><path d="M22 -45 q4 2.2 8 0" stroke="#000" stroke-width="1" opacity=".18" fill="none"/>` +
      `<rect x="-29.6" y="-36" width="8.2" height="4.4" rx="1.6" fill="#FFFFFF"/><rect x="21.4" y="-36" width="8.2" height="4.4" rx="1.6" fill="#E4E1D8"/>` +
      `<rect x="-30" y="-37.4" width="9" height="3.1" rx="1.1" fill="${watch[0]}"/><rect x="-27.4" y="-37" width="4.2" height="2.3" rx=".7" fill="${watch[1]}"/>` +
      hand(-25.5, -1) + hand(25.5, 1) + `<circle cx="27" cy="-27" r="3" fill="#000" opacity=".09"/>`;
  
    // ── head: ears, face shape, shading, blush
    const ears = [-1, 1].map((d) => `<ellipse cx="${d * 41}" cy="-104" rx="5.4" ry="9" fill="${skin}"/><ellipse cx="${d * 41.6}" cy="-104" rx="2.4" ry="5" fill="#000" opacity=".14"/>`).join('');
    const headPath = 'M-40 -116 Q-40 -146 0 -146 Q40 -146 40 -116 L40 -104 Q40 -68 0 -68 Q-40 -68 -40 -104 Z';
    const face =
      ears + `<path d="${headPath}" fill="${skin}"/>` +
      `<path d="M40 -116 L40 -104 Q40 -68 0 -68 Q26 -74 32 -100 Q36 -112 33 -128 Q38 -124 40 -116 Z" fill="#000" opacity=".1"/>` +
      `<ellipse cx="-22" cy="-97" rx="6" ry="3.6" fill="#fff" opacity=".06"/>` +
      `<circle cx="-25" cy="-93" r="6.5" fill="#E8776A" opacity=".17"/><circle cx="25" cy="-93" r="6.5" fill="#E8776A" opacity=".17"/>`;
  
    // ── eyes (iris group keeps class "eye" for the look-around animation)
    const eye = (cx) =>
      `<ellipse cx="${cx}" cy="-106" rx="8" ry="6.6" fill="#FBFAF6"/>` +
      `<g class="eye"><circle cx="${cx}" cy="-106" r="4.9" fill="${iris}"/><circle cx="${cx}" cy="-106" r="2.5" fill="#0B0B0B"/><circle cx="${cx + 1.7}" cy="-107.8" r="1.5" fill="#fff"/><circle cx="${cx - 1.6}" cy="-104.4" r=".7" fill="#fff" opacity=".7"/></g>` +
      `<path d="M${cx - 8.6} -107 Q${cx} -114.5 ${cx + 8.6} -107" stroke="#1B1411" stroke-width="2.3" fill="none" stroke-linecap="round"/>` +
      `<path d="M${cx - 7} -101 Q${cx} -98.5 ${cx + 7} -101" stroke="#000" stroke-width="1" opacity=".16" fill="none"/>`;
    const brows = `<path d="M-23.5 -118.5 Q-14 -124 -5.5 -120.5" stroke="${eyebrow}" stroke-width="3.3" fill="none" stroke-linecap="round"/><path d="M5.5 -120.5 Q14 -124 23.5 -118.5" stroke="${eyebrow}" stroke-width="3.3" fill="none" stroke-linecap="round"/>`;
    const nose = `<path d="M-1.6 -103 Q-5.2 -94.5 -2.2 -91.6 Q1.6 -89.8 5.2 -92.6" stroke="#000" stroke-width="1.6" opacity=".26" fill="none" stroke-linecap="round"/><ellipse cx="-.5" cy="-95.5" rx="3" ry="2" fill="#fff" opacity=".14"/><circle cx="-2.6" cy="-91.6" r=".9" fill="#000" opacity=".25"/><circle cx="2.8" cy="-91.8" r=".9" fill="#000" opacity=".25"/>`;
    const mouth = kind === 'ceo'
      ? `<path d="M-11 -88 Q0 -76.5 11 -88 Q0 -85.4 -11 -88 Z" fill="#7A2A2A"/><path d="M-9.6 -87.4 Q0 -84.6 9.6 -87.4 L9 -85.8 Q0 -83.4 -9 -85.8 Z" fill="#fff"/><path d="M-12 -89 q-1.4 2.2 .8 4.4 M12 -89 q1.4 2.2 -.8 4.4" stroke="#000" opacity=".2" fill="none" stroke-width="1.2"/>`
      : `<path d="M-9.5 -87.5 Q0 -80.5 9.5 -87.5" stroke="#5A2420" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M-5 -83.4 Q0 -80.6 5 -83.4" stroke="#C9695E" stroke-width="2.1" opacity=".75" fill="none" stroke-linecap="round"/><path d="M-11.5 -88.5 q-1 2 1 4 M11.5 -88.5 q1 2 -1 4" stroke="#000" opacity=".2" fill="none" stroke-width="1.2"/>`;
  
    // ── hair
    let hairSvg = '';
    if (o.style === 'short') {
      hairSvg =
        `<path d="M-42 -112 Q-47 -141 -26 -151 Q0 -159 26 -151 Q47 -141 42 -112 Q38 -128 22 -134 Q0 -126 -22 -134 Q-38 -128 -42 -112 Z" fill="${hair}"/>` +
        `<rect x="-42" y="-126" width="5.5" height="17" rx="2.7" fill="${hair}"/><rect x="36.5" y="-126" width="5.5" height="17" rx="2.7" fill="${hair}"/>` +
        `<path d="M-24 -147 Q-8 -156 12 -151" stroke="${hairL}" stroke-width="3" opacity=".5" fill="none" stroke-linecap="round"/><path d="M-6 -152 Q-14 -142 -26 -137 M6 -153 Q4 -144 -6 -138" stroke="${hairL}" stroke-width="1.4" opacity=".35" fill="none" stroke-linecap="round"/>`;
    } else if (o.style === 'sweep') {
      hairSvg =
        `<path d="M-42 -114 Q-48 -146 -8 -153 L16 -153 Q46 -148 42 -118 Q26 -142 -4 -138 Q-30 -136 -42 -114 Z" fill="${hair}"/>` +
        `<rect x="-42" y="-126" width="5" height="15" rx="2.5" fill="${hair}"/><rect x="37" y="-126" width="5" height="15" rx="2.5" fill="${hair}"/>` +
        `<path d="M-30 -145 Q-8 -156 20 -149" stroke="${hairL}" stroke-width="3" opacity=".4" fill="none" stroke-linecap="round"/><path d="M-12 -151 Q-18 -143 -34 -137 M2 -152 Q-6 -144 -20 -139 M14 -151 Q10 -146 2 -142" stroke="${hairL}" stroke-width="1.3" opacity=".3" fill="none" stroke-linecap="round"/>`;
    } else if (o.style === 'silver') {
      hairSvg =
        `<path d="M-42 -114 Q-44 -148 -10 -152 L12 -152 Q44 -148 42 -114 Q39 -131 26 -136 Q0 -128 -26 -136 Q-39 -131 -42 -114 Z" fill="${hair}"/>` +
        `<rect x="-42" y="-126" width="5" height="16" rx="2.5" fill="${hair}"/><rect x="37" y="-126" width="5" height="16" rx="2.5" fill="${hair}"/>` +
        `<path d="M-26 -146 Q-6 -155 18 -149" stroke="#fff" stroke-width="3" opacity=".5" fill="none" stroke-linecap="round"/><path d="M-10 -151 Q-14 -144 -26 -139 M8 -152 Q4 -145 -8 -140" stroke="#9A968A" stroke-width="1.3" opacity=".5" fill="none" stroke-linecap="round"/>`;
    }
  
    // ── eyewear
    let eyewear = '';
    if (o.glasses === 'round') {
      eyewear =
        `<rect x="-25" y="-114" width="22" height="14.5" rx="5.5" fill="#BFE3F0" opacity=".18"/><rect x="3" y="-114" width="22" height="14.5" rx="5.5" fill="#BFE3F0" opacity=".18"/>` +
        `<rect x="-25" y="-114" width="22" height="14.5" rx="5.5" fill="none" stroke="#141413" stroke-width="2.8"/><rect x="3" y="-114" width="22" height="14.5" rx="5.5" fill="none" stroke="#141413" stroke-width="2.8"/>` +
        `<rect x="-3.5" y="-109" width="7" height="2.8" fill="#141413"/><path d="M-25 -108.5 L-40.5 -110.5 M25 -108.5 L40.5 -110.5" stroke="#141413" stroke-width="2.2" stroke-linecap="round"/>` +
        `<path d="M-21 -111 L-13 -111 M7 -111 L15 -111" stroke="#fff" stroke-width="1.6" opacity=".55" stroke-linecap="round"/>`;
    } else if (o.glasses === 'sun') {
      eyewear =
        `<rect x="-27" y="-113.5" width="24" height="13" rx="4.5" fill="#141413" opacity=".9"/><rect x="3" y="-113.5" width="24" height="13" rx="4.5" fill="#141413" opacity=".9"/>` +
        `<rect x="-27" y="-113.5" width="24" height="13" rx="4.5" fill="none" stroke="#2A2A2E" stroke-width="1.6"/><rect x="3" y="-113.5" width="24" height="13" rx="4.5" fill="none" stroke="#2A2A2E" stroke-width="1.6"/>` +
        `<rect x="-3.5" y="-110" width="7" height="2.8" fill="#141413"/><path d="M-27 -109.5 L-41 -111 M27 -109.5 L41 -111" stroke="#141413" stroke-width="2.4" stroke-linecap="round"/>` +
        `<path d="M-23 -111 L-15 -103.5 M-18 -112 L-13 -107.4 M7 -111 L15 -103.5 M12 -112 L17 -107.4" stroke="#fff" stroke-width="1.7" opacity=".5" stroke-linecap="round"/>`;
    }
  
    // ── extra: satchel bag on the hip (messenger)
    const bag = kind === 'msg'
      ? `<rect x="20" y="-48" width="20" height="17" rx="3.2" fill="#9FD0D6"/><rect x="20" y="-48" width="20" height="7" rx="3" fill="#7ABAC2"/><path d="M21.5 -41.2 H38.5" stroke="#000" opacity=".16"/><rect x="27" y="-43.5" width="6" height="4.6" rx="1" fill="#E9C46A" stroke="#B8862B" stroke-width=".5"/><rect x="20" y="-32.6" width="20" height="1.6" rx=".8" fill="#000" opacity=".14"/>`
      : '';
  
    return `<g transform="scale(${s})">${legs}${neck}${torso}${front}${arms}${bag}${face}${nose}${eye(-14)}${eye(14)}${brows}${mouth}${hairSvg}${eyewear}</g>`;
  };

  // Detailed avatars: one generator, five outfits. Same size/anchor as the old flat ones (feet at 0, head top ~ -150).
  const CH = {
    bot:     char({ s: 0.44, kind: 'worker',  skin: '#8D5B3E', hair: '#1E1A17', hairL: '#6B5A4E', jacket: '#3E4F7A', jacketD: '#35446A', pants: '#26314A', style: 'short', iris: '#3A2418' }),
    botlead: char({ s: 0.44, kind: 'botlead', skin: '#F2D3BD', hair: '#1E1A17', hairL: '#6B5A4E', jacket: '#3E4F7A', jacketD: '#35446A', pants: '#26314A', style: 'short', iris: '#4A5A3A' }),
    lead:    char({ s: 0.42, kind: 'lead',    skin: '#F5D6B8', hair: '#141413', hairL: '#5A5650', jacket: '#232327', jacketD: '#1A1A1D', pants: '#1A1A1D', style: 'sweep', glasses: 'round', iris: '#3A2A20' }),
    ceo:     char({ s: 0.5,  kind: 'ceo',     skin: '#F5C8A0', hair: '#CFCBC2', hairL: '#FFFFFF', brow: '#A8A49A', jacket: '#D9A92B', jacketD: '#C29523', pants: '#B8862B', style: 'silver', glasses: 'sun', watch: 'gold' }),
    msgbot:  char({ s: 0.44, kind: 'msg',     skin: '#8D5B3E', hair: '#1E1A17', hairL: '#6B5A4E', jacket: '#3A6A5A', jacketD: '#2E5A4A', pants: '#264A3A', style: 'short', iris: '#3A2418' }),
  };

  const DEFS = `<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22344A"/><stop offset="1" stop-color="#3B5470"/></linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="#F7D9A8" stop-opacity="0.75"/><stop offset="1" stop-color="#F7D9A8" stop-opacity="0"/></radialGradient>
  <pattern id="tiles" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0V50H0" fill="none" stroke="#26262A" stroke-width="1.4"/></pattern>
  <pattern id="carpet" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#3A2F48"/><circle cx="6" cy="6" r="1.6" fill="#4C3E5E"/><circle cx="18" cy="18" r="1.6" fill="#4C3E5E"/></pattern>
  <pattern id="planks" width="1000" height="33" patternUnits="userSpaceOnUse"><path d="M0 33H1000" stroke="#46342A" stroke-width="2"/></pattern>
  <symbol id="desk" overflow="visible"><ellipse cx="0" cy="22" rx="50" ry="14" fill="#141413" opacity="0.07"/><polygon points="-44,-22 0,3 0,25 -44,0" fill="#34343A"/><polygon points="44,-22 0,3 0,25 44,0" fill="#18181B"/><polygon points="-40,-20 -4,1 -4,22 -40,1" fill="#2E2E33"/><polygon points="0,-47 44,-22 0,3 -44,-22" fill="#45454C" stroke="#55555C"/><polygon points="-14,-34 -6,-30 -6,-26 -14,-30" fill="#3A3935"/><polygon points="-32,-40 -2,-57 -2,-85 -32,-68" fill="#141413"/><polygon class="screen" points="-29,-44 -5,-58 -5,-81 -29,-67" fill="currentColor" opacity="0.9"/><polygon points="-26,-52 -12,-60 -12,-58 -26,-50" fill="#141413" opacity="0.45"/><polygon points="-26,-58 -9,-68 -9,-66 -26,-56" fill="#141413" opacity="0.45"/><polygon points="-26,-64 -15,-70 -15,-68 -26,-62" fill="#141413" opacity="0.3"/><polygon points="8,-28 26,-18 18,-13 0,-23" fill="#6A6A72" stroke="#5A5A62" stroke-width="0.6"/><circle cx="30" cy="-22" r="2.6" fill="#5A5A62"/><g transform="translate(-24 -20)"><rect x="-3.5" y="-8" width="7" height="8" rx="1.5" fill="#B5532F"/><ellipse cx="0" cy="-8" rx="3.5" ry="1.4" fill="#8F3F22"/></g><g transform="translate(26 -40)"><polygon points="0,0 2,-1 2,-16 0,-15" fill="#3A3935"/><polygon points="-6,-15 8,-20 6,-14 -6,-11" fill="#3A3935"/><ellipse cx="1" cy="-12" rx="4" ry="1.6" fill="#F2C98F"/></g></symbol>
  <symbol id="crown" overflow="visible"><path d="M-10 0 L-12 -12 L-5 -6 L0 -15 L5 -6 L12 -12 L10 0 Z" fill="#E9C46A" stroke="#B8862B" stroke-width="1"/><circle cx="0" cy="-15" r="1.8" fill="#B5532F"/></symbol>
  <symbol id="chair" overflow="visible"><ellipse cx="0" cy="0" rx="13" ry="5" fill="#141413" opacity="0.12"/><path d="M-11 0 L11 0 M0 -5 L0 5" stroke="#3A3935" stroke-width="2.4" stroke-linecap="round"/><rect x="-1.5" y="-15" width="3" height="15" fill="#55534D"/><rect x="-11" y="-44" width="22" height="26" rx="8" fill="#3D3D3A"/><rect x="-8" y="-41" width="16" height="20" rx="6" fill="#4A4945"/><ellipse cx="0" cy="-16" rx="13" ry="6" fill="#55534D"/></symbol>
  <symbol id="bot" overflow="visible">${CH.bot}</symbol>
  <!-- White-skin bot variant used when an agent is a department lead -->
  <symbol id="bot-lead" overflow="visible">${CH.botlead}</symbol>

  <symbol id="lead" overflow="visible">${CH.lead}</symbol>
  <symbol id="ceo" overflow="visible">${CH.ceo}</symbol>

  <!-- Messenger bot: same silhouette as bot but wears a satchel bag -->
  <symbol id="msgbot" overflow="visible">${CH.msgbot}</symbol>

  <symbol id="leaddesk" overflow="visible"><ellipse cx="0" cy="14" rx="36" ry="10" fill="#141413" opacity="0.07"/><polygon points="-30,-15 0,2 0,16 -30,-1" fill="#34343A"/><polygon points="30,-15 0,2 0,16 30,-1" fill="#18181B"/><polygon points="0,-32 30,-15 0,2 -30,-15" fill="#45454C" stroke="#55555C"/><polygon points="-20,-27 0,-38 0,-56 -20,-45" fill="#141413"/><polygon points="-18,-30 -2,-39 -2,-53 -18,-44" fill="currentColor" opacity="0.85"/><polygon points="6,-20 18,-13 13,-10 1,-17" fill="#FAF9F5" stroke="#5A5A62" stroke-width="0.6"/></symbol>
  <symbol id="table" overflow="visible"><ellipse cx="0" cy="2" rx="26" ry="9" fill="#141413" opacity="0.08"/><ellipse cx="0" cy="0" rx="12" ry="5" fill="#8A6446"/><rect x="-2" y="-22" width="4" height="22" fill="#8A6446"/><ellipse cx="0" cy="-22" rx="26" ry="12" fill="#B98B64"/><ellipse cx="0" cy="-24" rx="26" ry="12" fill="#CFA47C"/><ellipse cx="-6" cy="-26" rx="10" ry="4" fill="#DDB892" opacity="0.6"/></symbol>
  <symbol id="stool" overflow="visible"><ellipse cx="0" cy="0" rx="7" ry="2.5" fill="#141413" opacity="0.1"/><rect x="-1.5" y="-14" width="3" height="14" fill="#8A6446"/><ellipse cx="0" cy="-14" rx="9" ry="4.5" fill="#3D3D3A"/><ellipse cx="-2" cy="-15" rx="5" ry="2" fill="#55534D"/></symbol>
  <symbol id="cup" overflow="visible"><rect x="-4" y="-9" width="8" height="9" rx="2" fill="#FAF9F5"/><path d="M4 -7 q4 0 4 3 q0 3 -4 3" fill="none" stroke="#FAF9F5" stroke-width="1.6"/><path class="steam" d="M-1 -12 q2 -3 0 -6 q-2 -3 0 -6" fill="none" stroke="#B0AEA5" stroke-width="1.2" stroke-linecap="round"/></symbol>
  <symbol id="plant" overflow="visible"><ellipse cx="0" cy="0" rx="12" ry="4" fill="#141413" opacity="0.1"/><circle cx="-8" cy="-22" r="9" fill="#6E9668"/><circle cx="8" cy="-24" r="9" fill="#5B7F57"/><circle cx="0" cy="-32" r="11" fill="#6E9668"/><circle cx="-3" cy="-36" r="4" fill="#86AE7F"/><polygon points="-10,-14 10,-14 7,0 -7,0" fill="#B5532F"/><polygon points="2,-14 10,-14 7,0 1,0" fill="#9C4527"/></symbol>
  <symbol id="tallplant" overflow="visible"><ellipse cx="0" cy="0" rx="13" ry="4.5" fill="#141413" opacity="0.1"/><path d="M0 -18 C-2 -40 -14 -52 -18 -70 M0 -18 C3 -45 12 -58 16 -78 M0 -18 C0 -50 -2 -70 2 -92" stroke="#5B7F57" stroke-width="2" fill="none"/><ellipse cx="-18" cy="-70" rx="9" ry="5" fill="#6E9668" transform="rotate(-30 -18 -70)"/><ellipse cx="-10" cy="-50" rx="9" ry="4.5" fill="#5B7F57" transform="rotate(-20 -10 -50)"/><ellipse cx="16" cy="-78" rx="9" ry="5" fill="#86AE7F" transform="rotate(30 16 -78)"/><ellipse cx="9" cy="-56" rx="9" ry="4.5" fill="#6E9668" transform="rotate(25 9 -56)"/><ellipse cx="2" cy="-92" rx="7" ry="4.5" fill="#6E9668"/><ellipse cx="-4" cy="-36" rx="8" ry="4" fill="#86AE7F" transform="rotate(-15 -4 -36)"/><polygon points="-11,-20 11,-20 8,0 -8,0" fill="#45454C" stroke="#18181B"/></symbol>
  <symbol id="lamp" overflow="visible"><line x1="0" y1="-130" x2="0" y2="-34" stroke="#55534D" stroke-width="1.2"/><ellipse cx="0" cy="0" rx="34" ry="13" fill="url(#glow)"/><path d="M-12 -20 L-7 -34 L7 -34 L12 -20 Z" fill="#141413"/><ellipse cx="0" cy="-19" rx="12" ry="3" fill="#F2C98F"/></symbol>
  <symbol id="cooler" overflow="visible"><ellipse cx="0" cy="0" rx="12" ry="4" fill="#141413" opacity="0.1"/><rect x="-10" y="-38" width="20" height="38" rx="3" fill="#6A6A72"/><rect x="0" y="-38" width="10" height="38" rx="2" fill="#5A5A62"/><rect x="-4" y="-26" width="8" height="5" rx="1" fill="#3A3935"/><path d="M-8 -38 C-8 -56 8 -56 8 -38 Z" fill="#A8C9DA" opacity="0.85"/><ellipse cx="-2" cy="-48" rx="2" ry="5" fill="#FFFFFF" opacity="0.5"/></symbol>
  <symbol id="tv" overflow="visible"><!-- wall-mounted TV / PlayStation setup -->
    <ellipse cx="0" cy="4" rx="50" ry="8" fill="#141413" opacity="0.15"/>
    <rect x="-2" y="-46" width="4" height="46" fill="#3A3935"/>
    <rect x="-46" y="-80" width="92" height="56" rx="4" fill="#141413"/>
    <rect x="-42" y="-76" width="84" height="48" rx="2" fill="#1A2B3C"/>
    <rect x="-38" y="-72" width="76" height="40" rx="1" fill="#0D1821"/>
    <!-- screen glow: game colours -->
    <rect x="-34" y="-68" width="30" height="32" fill="#1A3A6A" opacity="0.9"/>
    <rect x="-2" y="-68" width="30" height="32" fill="#6A1A2A" opacity="0.9"/>
    <circle cx="-10" cy="-52" r="6" fill="#3A6EA5" opacity="0.6"/>
    <circle cx="10" cy="-52" r="6" fill="#B5532F" opacity="0.6"/>
    <!-- controller on floor -->
    <rect x="-14" y="-14" width="28" height="12" rx="4" fill="#2A2A2F"/>
    <circle cx="-6" cy="-9" r="2" fill="#B5532F"/><circle cx="0" cy="-6" r="2" fill="#3A6EA5"/><circle cx="6" cy="-9" r="2" fill="#3F7D4E"/>
  </symbol>
  <symbol id="pingpong" overflow="visible"><!-- ping pong / foosball table -->
    <ellipse cx="0" cy="10" rx="62" ry="14" fill="#141413" opacity="0.1"/>
    <polygon points="-58,-10 58,-10 58,10 -58,10" fill="#3F7D4E"/>
    <polygon points="-58,-14 58,-14 58,-10 -58,-10" fill="#2D6040"/>
    <line x1="0" y1="-14" x2="0" y2="10" stroke="#FAF9F5" stroke-width="1.5" opacity="0.5"/>
    <line x1="-58" y1="-2" x2="58" y2="-2" stroke="#FAF9F5" stroke-width="1" opacity="0.3"/>
    <circle cx="-22" cy="-4" r="4" fill="#FAF9F5" opacity="0.9"/>
    <!-- net -->
    <rect x="-2" y="-20" width="4" height="10" fill="#FAF9F5" opacity="0.7"/>
    <!-- paddles -->
    <ellipse cx="-46" cy="-4" rx="6" ry="8" fill="#B5532F" opacity="0.9"/>
    <ellipse cx="46" cy="-4" rx="6" ry="8" fill="#3A6EA5" opacity="0.9"/>
    <!-- legs -->
    <rect x="-52" y="10" width="6" height="12" fill="#5A402C"/>
    <rect x="46" y="10" width="6" height="12" fill="#5A402C"/>
  </symbol>
  <symbol id="bookshelf" overflow="visible">
    <ellipse cx="0" cy="4" rx="30" ry="6" fill="#141413" opacity="0.1"/>
    <rect x="-28" y="-80" width="56" height="84" rx="2" fill="#4A3828"/>
    <rect x="-24" y="-76" width="48" height="6" fill="#6A5240"/>
    <rect x="-24" y="-66" width="48" height="6" fill="#6A5240"/>
    <rect x="-24" y="-56" width="48" height="6" fill="#6A5240"/>
    <rect x="-24" y="-46" width="48" height="6" fill="#6A5240"/>
    <!-- books row 1 -->
    <rect x="-22" y="-75" width="6" height="8" fill="#B5532F"/><rect x="-15" y="-75" width="5" height="8" fill="#3A6EA5"/><rect x="-9" y="-75" width="7" height="8" fill="#D9C27A"/><rect x="-1" y="-75" width="5" height="8" fill="#8FC79D"/><rect x="5" y="-75" width="6" height="8" fill="#E59A7A"/><rect x="12" y="-75" width="8" height="8" fill="#A8B8E8"/>
    <!-- books row 2 -->
    <rect x="-22" y="-65" width="7" height="8" fill="#D9C27A"/><rect x="-14" y="-65" width="5" height="8" fill="#B5532F"/><rect x="-8" y="-65" width="8" height="8" fill="#9FD0D6"/><rect x="1" y="-65" width="6" height="8" fill="#C8A8E0"/><rect x="8" y="-65" width="7" height="8" fill="#8FC79D"/>
    <!-- books row 3 -->
    <rect x="-22" y="-55" width="5" height="8" fill="#A8B8E8"/><rect x="-16" y="-55" width="8" height="8" fill="#B5532F"/><rect x="-7" y="-55" width="6" height="8" fill="#D9C27A"/><rect x="0" y="-55" width="7" height="8" fill="#3A6EA5"/><rect x="8" y="-55" width="6" height="8" fill="#8FC79D"/>
    <rect x="-10" y="-28" width="20" height="6" rx="1" fill="#FAF9F5" opacity="0.3"/>
  </symbol>
  <symbol id="coffeestation" overflow="visible">
    <ellipse cx="0" cy="4" rx="34" ry="7" fill="#141413" opacity="0.1"/>
    <!-- counter -->
    <polygon points="-32,-10 32,-10 32,4 -32,4" fill="#6A5240"/>
    <polygon points="-32,-14 32,-14 32,-10 -32,-10" fill="#8A6446"/>
    <polygon points="-32,-14 32,-14 32,-14 -32,-14" fill="#CFA47C"/>
    <!-- espresso machine -->
    <rect x="-28" y="-38" width="22" height="24" rx="3" fill="#2A2A2F"/>
    <rect x="-26" y="-36" width="18" height="16" rx="2" fill="#141413"/>
    <circle cx="-17" cy="-28" r="5" fill="#3A3935" stroke="#55534D" stroke-width="1"/>
    <circle cx="-17" cy="-28" r="2" fill="#B5532F"/>
    <rect x="-22" y="-16" width="12" height="3" rx="1" fill="#55534D"/>
    <!-- cups on counter -->
    <rect x="2" y="-22" width="7" height="8" rx="2" fill="#FAF9F5"/><path d="M9 -20 q3 0 0 4" stroke="#FAF9F5" stroke-width="1.2" fill="none"/>
    <rect x="12" y="-24" width="7" height="8" rx="2" fill="#FAF9F5"/><path d="M19 -22 q3 0 0 4" stroke="#FAF9F5" stroke-width="1.2" fill="none"/>
    <!-- steam -->
    <path d="M-14 -40 q2-3 0-5 q-2-3 0-5" fill="none" stroke="#B0AEA5" stroke-width="1" stroke-linecap="round" class="steam"/>
  </symbol>
  <symbol id="beanbag" overflow="visible"><ellipse cx="0" cy="2" rx="18" ry="6" fill="#000" opacity="0.25"/><path d="M-17 0 C-19 -12 -8 -20 0 -20 C10 -20 19 -12 17 0 Q0 6 -17 0 Z" fill="currentColor"/><path d="M-10 -14 Q-2 -19 6 -16" stroke="#fff" stroke-width="2" opacity="0.25" fill="none" stroke-linecap="round"/></symbol>
  <symbol id="armchair" overflow="visible"><ellipse cx="0" cy="2" rx="18" ry="6" fill="#000" opacity="0.25"/><rect x="-16" y="-34" width="32" height="24" rx="8" fill="#55466A"/><rect x="-18" y="-14" width="36" height="14" rx="6" fill="#6A5880"/><rect x="-21" y="-22" width="7" height="20" rx="3.5" fill="#483B5A"/><rect x="14" y="-22" width="7" height="20" rx="3.5" fill="#483B5A"/></symbol>
  <symbol id="floorlamp" overflow="visible"><ellipse cx="0" cy="0" rx="30" ry="11" fill="url(#glow)"/><line x1="0" y1="0" x2="0" y2="-62" stroke="#55555C" stroke-width="2"/><path d="M-9 -60 L-6 -74 L6 -74 L9 -60 Z" fill="#F2C98F"/></symbol>

  <!-- Messenger small desk: a rounded corner table with a letter tray and name plate -->
  <symbol id="msgdesk" overflow="visible">
    <ellipse cx="0" cy="12" rx="28" ry="8" fill="#141413" opacity="0.07"/>
    <polygon points="-24,-12 0,2 0,14 -24,2" fill="#4A3828"/>
    <polygon points="24,-12 0,2 0,14 24,2" fill="#2E2018"/>
    <polygon points="0,-26 24,-12 0,2 -24,-12" fill="#6A5240" stroke="#7A6250"/>
    <!-- letter tray -->
    <polygon points="-14,-20 2,-28 2,-20 -14,-12" fill="#141413" opacity="0.5"/>
    <polygon points="-14,-14 2,-22 2,-14 -14,-6" fill="#9FD0D6" opacity="0.8"/>
    <!-- name plate -->
    <polygon points="4,-16 16,-10 14,-7 2,-13" fill="#D9C27A" opacity="0.9"/>
  </symbol>
  </defs>`;

  const ROOM_W = 1040, ROOM_D = 2600, GAP = 40, FAC_W = 440, WORK_D = 740;
  const SOFA = ['#6A5880', '#55466A', '#483B5A'], WOOD = ['#8A6446', '#6E4F37', '#5A402C'], DARK = ['#2B2B2F', '#202024', '#18181B'];

  function build(depts) {
    // Keep the whole building square instead of a long strip. A room is far deeper than it is wide,
    // so a square grid of rooms is still a tall rectangle: pick the column count whose finished
    // floorplan is closest to as wide as it is deep. Departments fill left to right, then a new row.
    const n = depts.length <= 1 ? 1 : depts.length + (depts.length % 2);
    let cols = 1, closest = Infinity;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const ratio = (c * (ROOM_W + GAP) + FAC_W) / Math.max(r * (ROOM_D + GAP) - GAP, 3000);
      const off = Math.abs(Math.log(ratio)); // log so twice as wide scores the same as half as wide
      if (off < closest) { closest = off; cols = c; }
    }
    const rows = Math.ceil(n / cols);
    const fx = cols * (ROOM_W + GAP), W = fx + FAC_W, D = Math.max(rows * (ROOM_D + GAP) - GAP, 3000);
    const desksF = [], deskRoom = [], spotsF = [], spotProp = [], rooms = [];
    let floor = '', back = '', furn = '';
    // café spots first (indexes 0..499) so they never move — 5 cols × 100 rows = 500 spots
    const CAFE_COLS = [fx+26,fx+68,fx+110,fx+152,fx+200,fx+248,fx+292,fx+336,fx+378,fx+418];
    const CAFE_PROP_CYCLE = ['mug','music','rest','mug','mug','rest','music','mug','rest','mug','mug','music','rest','mug','mug','rest','music','mug','rest','mug'];
    // café spots: 10 cols × 20 rows = 200 spots, floor ~square on screen
    for (let ri = 0; ri < 20; ri++) {
      const y = 666 + ri * 68, stagger = (ri % 2) * 22;
      for (const x of CAFE_COLS) { spotsF.push([x + stagger, y]); spotProp.push(CAFE_PROP_CYCLE[ri % CAFE_PROP_CYCLE.length]); }
    }
    const cafeIdx = spotsF.map((s, i) => i);

    for (let i = 0; i < n; i++) {
      const d = depts[i], c = i % cols, r = Math.floor(i / cols), x0 = c * (ROOM_W + GAP), y0 = r * (ROOM_D + GAP), x1 = x0 + ROOM_W, y1 = y0 + ROOM_D;
      const room = { desks: [], rest: [], lead: P(x0 + 80, y0 + 80), box: [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], ghost: !d };
      if (!d) {
        floor += `<rect x="${x0 + 30}" y="${y0 + 30}" width="${ROOM_W - 60}" height="${ROOM_D - 60}" rx="40" fill="#1F1F23" stroke="#4A4A52" stroke-width="6" stroke-dasharray="26 18"/><text class="room-name" data-room="${i}" x="${x0 + 90}" y="${y0 + 200}" font-family="Newsreader, Georgia, serif" font-size="64" fill="#FAF9F5" opacity="0.3"></text>`;
        const c = P(x0 + ROOM_W / 2, y0 + ROOM_D / 2);
        furn += `<g class="add-room ghost" tabindex="0" role="button" aria-label="Add a department" transform="translate(${f(c[0])} ${f(c[1])}) scale(2.4)"><rect x="-130" y="-24" width="260" height="48" rx="24" fill="#B5532F"/><text y="7" text-anchor="middle" fill="#fff" font-size="19" font-weight="600">+ Add a department</text></g>`;
        rooms.push(room); continue;
      }
      floor += `<rect x="${x0}" y="${y0}" width="${ROOM_W}" height="${WORK_D}" fill="#222226"/><rect class="room-floor" data-room="${i}" x="${x0 + 10}" y="${y0 + 10}" width="${ROOM_W - 20}" height="${WORK_D - 20}" rx="22" fill="#2A2A2E" opacity="0.6"/>
        <rect x="${x0}" y="${y0 + WORK_D + 20}" width="${ROOM_W}" height="${ROOM_D - WORK_D - 20}" fill="#2D243A"/><rect x="${x0 + 14}" y="${y0 + WORK_D + 34}" width="${ROOM_W - 28}" height="${ROOM_D - WORK_D - 48}" rx="26" fill="#201C2C"/>
        <text class="room-name" data-room="${i}" x="${x0 + 40}" y="${y0 + 175}" font-family="Newsreader, Georgia, serif" font-size="64" fill="#FAF9F5" opacity="0.32"></text>
        <text x="${x0 + 40}" y="${y0 + WORK_D + 50}" font-size="24" font-weight="700" letter-spacing="8" fill="#E7B38F" opacity="0.35">REST AREA · LOUNGE</text>`;
      furn += `<use href="#leaddesk" x="${f(room.lead[0] - 25)}" y="${f(room.lead[1] + 20)}" class="room-screen" data-room="${i}" style="color:#3A3935"/><g class="lead-slot" data-room="${i}" transform="translate(${f(room.lead[0])} ${f(room.lead[1])})"></g>`;
      furn += use('tallplant', x1 - 40, y0 + 40) + use('plant', x0 + 30, y0 + WORK_D - 30);
      // 35 desks: 7 x 5
      if (d) for (let rr = 0; rr < 5; rr++) for (let cc = 0; cc < 10; cc++) { room.desks.push(desksF.length); desksF.push([x0 + 80 + cc * 95, y0 + 200 + rr * 110]); deskRoom.push(i); }
      furn += glass(x0, y0 + WORK_D + 10, x1, y0 + WORK_D + 10, 54, [0.4, 0.62]);
      furn += `<g transform="${onPlaneY(x0 + 430, y0 + WORK_D + 10, 78)}"><rect x="0" y="-16" width="150" height="26" rx="6" fill="#141413" stroke="#E7B38F" stroke-width="1.5"/><text x="75" y="2" text-anchor="middle" font-size="12" font-weight="700" letter-spacing="2" fill="#E7B38F">REST AREA</text></g>`;
      furn += glass(x1, y0, x1, y1, 66, [0.3, 0.42]);
      if (y1 < D - 5) furn += glass(x0, y1, x1, y1, 66, [0.45, 0.58]);
      // Lounge: 200 spots on a 10-col × 20-row grid filling ROOM_D - WORK_D
      const ly = y0 + WORK_D + 60;
      const LCOLS = 10, LROWS = 20, LXSTEP = Math.floor((ROOM_W - 80) / LCOLS), LYSTEP = Math.floor((ROOM_D - WORK_D - 100) / LROWS);
      const LPROPS = ['pad','mug','rest','book','music','phone','mug','pad','rest','music'];
      if (d) for (let lr = 0; lr < LROWS; lr++) for (let lc = 0; lc < LCOLS; lc++) {
        const sx = x0 + 50 + lc * LXSTEP + (lr % 2) * 18, sy = ly + lr * LYSTEP;
        room.rest.push(spotsF.length); spotsF.push([sx, sy]); spotProp.push(LPROPS[(lr + lc) % LPROPS.length]);
      }
      // ── Lounge furniture zones ──────────────────────────────────────────
      // Zone A (top): coffee station + cooler + stools bar (y = ly+30..ly+120)
      furn += use('coffeestation', x0 + 160, ly + 60);
      furn += use('cooler', x0 + 240, ly + 50);
      furn += use('cooler', x0 + 270, ly + 50);
      for (let sc = 0; sc < 5; sc++) furn += use('stool', x0 + 320 + sc * 60, ly + 80);
      furn += box(x0 + 300, ly + 60, x0 + 620, ly + 90, 10, WOOD);  // bar counter
      furn += use('cup', x0 + 380, ly + 68, '', 10) + use('cup', x0 + 460, ly + 68, '', 10) + use('cup', x0 + 540, ly + 68, '', 10);
      furn += use('tallplant', x0 + 60, ly + 50) + use('tallplant', x1 - 60, ly + 50);

      // Zone B (second band): sofa cluster + TV / gaming corner
      const gy = ly + 230;
      furn += use('tv', x0 + 130, gy + 20);
      furn += box(x0 + 60, gy + 80, x0 + 300, gy + 110, 14, SOFA);   // sofa facing TV
      furn += box(x0 + 60, gy + 80, x0 + 300, gy + 92, 32, SOFA);
      furn += box(x0 + 110, gy + 150, x0 + 190, gy + 190, 10, WOOD); // coffee table
      furn += use('cup', x0 + 140, gy + 162, '', 10);
      // gaming beanbags in front of TV
      const gc = ['#B5532F','#3A6EA5','#D9C27A','#8FC79D'];
      for (let bi = 0; bi < 4; bi++) furn += use('beanbag', x0 + 80 + bi * 60, gy + 220, `style="color:${gc[bi]}"`);
      furn += use('floorlamp', x0 + 320, gy + 100);

      // Another sofa set on the right side of the same band
      furn += box(x0 + 580, gy + 60, x0 + 820, gy + 90, 14, SOFA);
      furn += box(x0 + 580, gy + 60, x0 + 820, gy + 72, 32, SOFA);
      furn += box(x0 + 630, gy + 130, x0 + 710, gy + 170, 10, WOOD);
      furn += use('cup', x0 + 660, gy + 142, '', 10);
      furn += use('plant', x0 + 840, gy + 60) + use('plant', x0 + 550, gy + 60);
      furn += use('floorlamp', x0 + 820, gy + 150);

      // Zone C: ping pong table + open space
      const ppy = ly + 580;
      furn += use('pingpong', x0 + 300, ppy);
      furn += use('plant', x0 + 60, ppy) + use('plant', x1 - 60, ppy);
      furn += use('floorlamp', x0 + 580, ppy + 60);

      // Zone D: reading nook — bookshelves + armchairs
      const ry2 = ly + 820;
      furn += use('bookshelf', x0 + 80, ry2);
      furn += use('bookshelf', x0 + 170, ry2);
      furn += use('bookshelf', x0 + 260, ry2);
      for (let ai = 0; ai < 4; ai++) furn += use('armchair', x0 + 380 + ai * 120, ry2 + 60);
      furn += box(x0 + 490, ry2 + 120, x0 + 570, ry2 + 160, 8, WOOD); // reading table
      furn += use('cup', x0 + 520, ry2 + 128, '', 8);
      furn += use('floorlamp', x0 + 340, ry2 + 80) + use('floorlamp', x0 + 720, ry2 + 80);
      furn += use('tallplant', x1 - 80, ry2) + use('plant', x0 + 820, ry2 + 80);

      // Zone E: bean bag lounge near the bottom
      const by2 = ly + 1180;
      const bagcols = ['#E59A7A','#A8B8E8','#C8A8E0','#9FD0D6','#D9C27A','#8FC79D','#B5532F','#3A6EA5'];
      for (let bi = 0; bi < 8; bi++) furn += use('beanbag', x0 + 100 + (bi % 4) * 200, by2 + Math.floor(bi / 4) * 120, `style="color:${bagcols[bi]}"`);
      furn += use('table', x0 + 500, by2 + 60) + use('cup', x0 + 492, by2 + 48, '', 24);
      furn += use('plant', x0 + 60, by2) + use('tallplant', x1 - 60, by2) + use('plant', x0 + 950, by2 + 100);
      furn += use('floorlamp', x0 + 300, by2 + 60) + use('floorlamp', x0 + 700, by2 + 60);
      rooms.push(room);
    }

    // ── FACILITY COLUMN ──────────────────────────────────────────────────────
    // CEO office (y 0–425), Messenger corner (y 435–555), Café (y 565–1660), Open desks (y 1670+)
    floor += `<rect x="${fx}" width="${FAC_W}" height="425" fill="#2A2519"/><rect x="${fx + 24}" y="24" width="${FAC_W - 48}" height="377" rx="18" fill="#D9C27A" opacity="0.14"/>
      <rect x="${fx}" y="435" width="${FAC_W}" height="120" fill="#252520"/><rect x="${fx + 16}" y="445" width="${FAC_W - 32}" height="100" rx="12" fill="#3A3020" opacity="0.7"/>
      <rect x="${fx}" y="565" width="${FAC_W}" height="1430" fill="#3A2B22"/><rect x="${fx}" y="565" width="${FAC_W}" height="1430" fill="url(#planks)"/>
      <ellipse cx="${fx + 220}" cy="950" rx="170" ry="180" fill="#C9714F" opacity="0.10"/>
      <text x="${fx + 30}" y="636" font-family="Newsreader, Georgia, serif" font-size="52" fill="#E7B38F" opacity="0.28">Café</text>
      <rect x="${fx}" y="2000" width="${FAC_W}" height="${D - 2000}" fill="#202024"/><text x="${fx + 30}" y="${D - 24}" font-size="26" font-weight="700" letter-spacing="6" fill="#FAF9F5" opacity="0.22">OPEN DESKS</text>`;

    // CEO furniture + glass
    furn += glass(fx, 0, fx, 425, 74, [0.55, 0.8]) + glass(fx, 425, W, 425, 74) +
      box(fx + 160, 110, fx + 300, 180, 34, ['#3D3D3A', '#2B2B29', '#232320']) +
      box(fx + 160, 110, fx + 300, 180, 3, ['#55534D', '#3A3935', '#2B2B29'], 34) +
      use('tallplant', fx + 400, 40) + use('plant', fx + 40, 380);
    furn += `<g transform="${onPlaneY(fx + 140, 425, 66)}"><rect x="0" y="-14" width="140" height="22" rx="4" fill="#141413"/><text x="70" y="2" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="2" fill="#D9C27A">CEO OFFICE</text></g>`;

    // Messenger corner (y 435–555): small desk, sign, partition glass
    const helperX = fx + 220, helperY = 495;
    furn += glass(fx, 435, W, 435, 32, [0.25, 0.72]);
    furn += glass(fx, 555, W, 555, 32, [0.22, 0.68]);
    furn += use('msgdesk', helperX, helperY);
    furn += use('plant', fx + 40, 500);
    furn += `<g transform="${onPlaneY(fx + 110, 435, 48)}"><rect x="0" y="-12" width="190" height="20" rx="4" fill="#141413" stroke="#9FD0D6" stroke-width="1.2"/><text x="95" y="2" text-anchor="middle" font-size="10" font-weight="700" letter-spacing="2.5" fill="#9FD0D6">MESSENGER</text></g>`;

    // Café bar + tables (narrow column — bar + scattered small tables)
    furn += box(fx + 40, 580, fx + 400, 612, 36, WOOD) + box(fx + 40, 580, fx + 400, 612, 3, ['#C9A984', '#A9744C', '#8A5E3C'], 34) +
      box(fx + 60, 585, fx + 90, 605, 26, ['#55534D', '#3A3935', '#232320'], 37) + use('cup', fx + 300, 594, '', 37);
    for (const [x, y] of [[fx+90,710],[fx+310,720],[fx+180,800],[fx+90,900],[fx+310,900],[fx+200,1000],[fx+90,1120],[fx+310,1120]])
      furn += use('table', x, y) + use('cup', x - 6, y, '', 24);
    furn += use('lamp', fx + 90, 710) + use('lamp', fx + 310, 720) + use('lamp', fx + 200, 800);
    furn += use('tallplant', fx + 390, 1920) + use('plant', fx + 30, 1900);
    furn += glass(fx, 1980, W, 1980, 40, [0.4, 0.6]);
    const hot = [], hotXY = [];
    for (let y = 2060; y < D - 60; y += 140) hotXY.push([fx + 130, y], [fx + 310, y]);
    for (const [x, y] of hotXY) { hot.push(desksF.length); desksF.push([x, y]); deskRoom.push(-1); }

    // walls, windows, clock, task board
    const wins = []; for (let x = 120; x < fx - 160; x += 330) wins.push(sky(x, x + 160, 50, 92, 'R'));
    const winsL = []; for (let y = 120; y < D - 200; y += 360) winsL.push(sky(y, y + 190, 32, 82, 'L'));
    back = `${poly('#141416', P(0, D), P(W, D), P(W, D, -18), P(0, D, -18))}${poly('#0F0F11', P(W, 0), P(W, D), P(W, D, -18), P(W, 0, -18))}
      ${poly('#2A2A2F', P(0, 0), P(W, 0), P(W, 0, 100), P(0, 0, 100))}${poly('#232327', P(0, 0), P(0, D), P(0, D, 100), P(0, 0, 100))}
      ${poly('#3A3A40', P(0, 0, 100), P(W, 0, 100), P(W, 0, 106), P(0, 0, 106))}${poly('#323237', P(0, 0, 100), P(0, D, 100), P(0, D, 106), P(0, 0, 106))}
      <g transform="matrix(0.8 0.462 -0.8 0.462 600 110)"><rect width="${W}" height="${D}" fill="#1B1B1E"/><rect width="${W}" height="${D}" fill="url(#tiles)"/>${floor}<rect width="${W}" height="${D}" fill="none" stroke="#34343A" stroke-width="2"/></g>
      ${poly('#18181B', P(0, 0), P(W, 0), P(W, 0, 7), P(0, 0, 7))}${poly('#121214', P(0, 0), P(0, D), P(0, D, 7), P(0, 0, 7))}${wins.join('')}${winsL.join('')}
      <g transform="${onWallR(Math.max(60, fx - 120), 76)}"><circle r="15" fill="#45454C" stroke="#FAF9F5" stroke-width="2"/><circle r="1.6" fill="#FAF9F5"/><line id="clock-h" y2="-7" stroke="#FAF9F5" stroke-width="2" stroke-linecap="round"/><line id="clock-m" y2="-11" stroke="#E7B38F" stroke-width="1.5" stroke-linecap="round"/></g>
      <g class="task-board" tabindex="0" role="button" aria-label="Open the task board" style="cursor:pointer">${poly('#0B0B0C', P(fx + 60, 0, 22), P(fx + 380, 0, 22), P(fx + 380, 0, 92), P(fx + 60, 0, 92))}
      <text transform="${onWallR(fx + 78, 72)}" font-size="13" font-weight="600" letter-spacing="1.2" fill="#E7B38F">TASK BOARD</text><text id="board-line" transform="${onWallR(fx + 78, 54)}" font-size="11" fill="#D6D4CC">loading…</text>
      ${poly('#8FC79D', P(fx + 78, 0, 42), P(fx + 170, 0, 42), P(fx + 170, 0, 46), P(fx + 78, 0, 46)).replace('/>', ' id="board-bar1"/>')}${poly('#A8B8E8', P(fx + 78, 0, 34), P(fx + 260, 0, 34), P(fx + 260, 0, 38), P(fx + 78, 0, 38)).replace('/>', ' id="board-bar2"/>')}</g>`;

    const desks = desksF.map(([x, y]) => P(x, y)), cafe = spotsF.map(([x, y]) => P(x, y));
    const order = desks.map((d, i) => i).sort((a, b) => desks[a][1] - desks[b][1]);
    const deskSvg = order.map((i) => `<g class="desk" data-desk="${i}" transform="translate(${f(desks[i][0])} ${f(desks[i][1])}) scale(1.1)"><use href="#chair" x="22" y="-26"/><g class="seat" transform="translate(20 -30)"></g><use class="desk-top" href="#desk" style="color:#3A3935"/></g>`).join('');
    const ceo = P(fx + 230, 80);
    const helper = P(helperX, helperY);
    const minX = P(0, D)[0], maxX = P(W, 0)[0], maxY = P(W, D)[1] + 30;
    const vb = { x: minX - 40, y: -10, w: maxX - minX + 80, h: maxY + 20 };
    const inner = `${DEFS}<g id="layer-back">${back}${furn}<g id="ceo-slot" transform="translate(${f(ceo[0])} ${f(ceo[1])})"></g><g id="helper-slot" transform="translate(${f(helper[0])} ${f(helper[1])})"></g></g><g id="layer-desks">${deskSvg}</g><g id="layer-free"></g><g id="layer-walk"></g>`;
    return { inner, vb, desks, deskRoom, rooms, hot, cafe, cafeIdx, spotProp, ceo, helper };
  }
  window.VScene = { build };
})();
