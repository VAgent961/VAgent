// Generates the whole office SVG from an array of department objects {id, name, color}.
// plus the CEO office, the café, the messenger corner and open desks. Floor coords -> screen: X = 600 + 0.8(x - y), Y = 110 + 0.462(x + y).
// window.VScene.build(departments) -> { inner, vb, desks, deskRoom, rooms[{desks, rest, lead, box}], hot, cafe, cafeIdx, spotProp, ceo, helper, nav{W,D,rects,doors} }  (nav feeds assets/nav.js)
// window.VScene.people = how many different office workers exist as symbols #p0..#p(n-1) (office.js picks one per agent).
(function () {
  const P = (x, y, h = 0) => [600 + 0.8 * (x - y), 110 + 0.462 * (x + y) - h];
  const f = (n) => n.toFixed(1);
  // while build() runs, REC collects what people can't walk through (world rects) and DOORS the gaps in glass walls; FOOT = half-size of small pieces
  let REC = null, DOORS = null; const FOOT = { table: 16, stool: 7, plant: 8, tallplant: 8, floorlamp: 6, lamp: 8, chair: 11, msgdesk: 16, cooler: 8 };
  const pts = (...a) => a.map((p) => f(p[0]) + ',' + f(p[1])).join(' ');
  const poly = (fill, ...a) => `<polygon points="${pts(...a)}" fill="${fill}"/>`;
  const box = (x0, y0, x1, y1, h, [top, front, side], z = 0) => (REC && h + z >= 10 && REC.push([x0, y0, x1, y1]), '') +
    poly(side, P(x1, y0, z), P(x1, y1, z), P(x1, y1, z + h), P(x1, y0, z + h)) +
    poly(front, P(x0, y1, z), P(x1, y1, z), P(x1, y1, z + h), P(x0, y1, z + h)) +
    poly(top, P(x0, y0, z + h), P(x1, y0, z + h), P(x1, y1, z + h), P(x0, y1, z + h));
  const use = (id, x, y, extra = '', h = 0) => { if (REC && FOOT[id]) REC.push([x - FOOT[id], y - FOOT[id], x + FOOT[id], y + FOOT[id]]); const [X, Y] = P(x, y, h); return `<use href="#${id}" x="${f(X)}" y="${f(Y)}" ${extra}/>`; };
  const glass = (x0, y0, x1, y1, h = 62, gap) => {
    const seg = (a, b) => { const A = [x0 + (x1 - x0) * a, y0 + (y1 - y0) * a], B = [x0 + (x1 - x0) * b, y0 + (y1 - y0) * b];
      return `<polygon points="${pts(P(...A), P(...B), P(...B, h), P(...A, h))}" fill="#8FB0BE" opacity="0.16" stroke="#4F6B78"/><polyline points="${pts(P(...A, h), P(...B, h))}" stroke="#6B8A97" stroke-width="2.5" fill="none"/>`; };
    if (REC) { // walls block people; a gap becomes a door (recorded with its centre) they can use
      const hz = y0 === y1, L = hz ? x1 - x0 : y1 - y0, o = hz ? x0 : y0, c = hz ? y0 : x0, wall = (a, b) => REC.push(hz ? [o + L * a, c - 3, o + L * b, c + 3] : [c - 3, o + L * a, c + 3, o + L * b]);
      if (gap) { wall(0, gap[0]); wall(gap[1], 1); const m = o + L * (gap[0] + gap[1]) / 2; DOORS.push({ x: hz ? m : c, y: hz ? c : m, hz, w: L * (gap[1] - gap[0]) }); } else wall(0, 1);
    }
    return gap ? seg(0, gap[0]) + seg(gap[1], 1) : seg(0, 1);
  };
  const onWallR = (x, h) => { const [X, Y] = P(x, 0, h); return `matrix(0.866 0.5 0 1 ${f(X)} ${f(Y)})`; };
  const onPlaneY = (x, y, h) => { const [X, Y] = P(x, y, h); return `matrix(0.866 0.5 0 1 ${f(X)} ${f(Y)})`; };
  const sky = (a, b, h0, h1, wall) => { const Q = wall === 'R' ? (t, h) => P(t, 0, h) : (t, h) => P(0, t, h);
    return `<polygon points="${pts(Q(a - 4, h0 - 4), Q(b + 4, h0 - 4), Q(b + 4, h1 + 4), Q(a - 4, h1 + 4))}" fill="#45454C"/><polygon points="${pts(Q(a, h0), Q(b, h0), Q(b, h1), Q(a, h1))}" fill="url(#sky)"/><polyline points="${pts(Q((a + b) / 2, h0), Q((a + b) / 2, h1))}" stroke="#45454C" stroke-width="3"/>`; };

  // ── People ────────────────────────────────────────────────────────────────
  // Realistic build (feet at y=0). Every figure carries every pose; inherited CSS variables choose what shows (office.css):
  //   --as standing arms · --ad at the desk, typing · --ar reading a book · --am coffee in hand ·
  //   --ls / --lsit standing or seated legs · --hs headset · --sitk 1 lowers the upper body onto a seat.
  const LOOKS = { realistic: 'Realistic' };
  const LOOK = 'realistic';
  const SKIN = ['#F1D3B8', '#E3B892', '#C99A72', '#A9764F', '#7A5237'];
  const HAIR = ['#1F1B18', '#3B2A20', '#5A3E2B', '#8A5A3A', '#B8B2A7', '#C9A66B'];
  const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => '#' + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
  // hr/hry head radii, hy head centre, sy shoulder line, sw/ww shoulder and waist half-widths, ty hip line,
  // lw leg width, aw arm width, al arm length, rr corner rounding
  const STY = {
    minimal:   { name: 'Modern minimal', hr: 12.5, hry: 13, hy: -138, sy: -113, sw: 19, ww: 17, ty: -60, lw: 11.5, aw: 10.5, al: 42, rr: 10, face: 'dots', ears: false, badge: 'pin', shade: 0.07, tint: ['#FFFFFF', 0.1] },
    realistic: { name: 'Realistic', hr: 10, hry: 12.4, hy: -143, sy: -127, sw: 20.5, ww: 15, ty: -71, lw: 10.5, aw: 8, al: 52, rr: 4, face: 'detail', ears: true, badge: 'lanyard', shade: 0.16, crease: true },
    architect: { name: 'Architect', hr: 8, hry: 10, hy: -151, sy: -136, sw: 18.5, ww: 12.5, ty: -76, lw: 9, aw: 7, al: 57, rr: 3, face: 'none', ears: false, badge: 'pin', shade: 0.1, mute: true },
  };
  const person = (sk, o) => {
    const st = { ...STY[sk], ...(o.build || {}) };
    let { s = 0.5, skin, hair, style = 'short', kind = 'shirt', top, pants = '#2B2F38', shoes = '#17181B', shirt = '#F1EEE7', glasses, bag, tie, accent = 'currentColor', gold, beat = 0.4 } = o;
    if (st.tint && !gold) top = mix(top, st.tint[0], st.tint[1]);
    if (st.mute && !gold) { top = mix(top, '#A3A8AF', 0.55); pants = mix(pants, '#5C6168', 0.45); skin = mix(skin, '#CFC8BE', 0.35); hair = mix(hair, '#55555A', 0.3); }
    const { hr, hry, hy, sy, sw, ww, ty, lw, aw, al, rr } = st;
    const vis = (v, on) => `style="display:var(${v},${on ? 'inline' : 'none'})"`;
    const sh = (d, op = st.shade) => `<path d="${d}" fill="#000" opacity="${op}"/>`;
    const blob = (pts, fill, r = rr) => `<polygon points="${pts.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')}" fill="${fill}" stroke="${fill}" stroke-width="${r}" stroke-linejoin="round"/>`;
    const line = (a, b, c, w = aw) => `<path d="M${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
    const hand = (p) => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(aw * 0.55)}" fill="${skin}"/>`;
    const sheen = (a, b) => gold ? line(a, b, '#FFF4C8', aw * 0.2).replace('stroke-linecap', 'stroke-opacity=".6" stroke-linecap') : '';
    const short = kind === 'polo', fore = short ? skin : top;

    // legs
    const shoeL = `<rect x="${f(-lw - 2.5)}" y="-7" width="${f(lw + 1.5)}" height="7" rx="3" fill="${shoes}"/>`, shoeR = `<rect x="1" y="-7" width="${f(lw + 1.5)}" height="7" rx="3" fill="${shoes}"/>`, shoe = shoeL + shoeR;
    const legL = [[-lw - 1, ty], [-1, ty], [-1.6, -6], [-lw, -6]], legR = legL.map(([x, y]) => [-x, y]);
    const crease = st.crease ? line([-lw / 2 - 1, ty + 4], [-lw / 2 - 0.8, -9], '#000', 0.8).replace('stroke="#000"', 'stroke="#000" stroke-opacity=".18"') + line([lw / 2 + 1, ty + 4], [lw / 2 + 0.8, -9], '#000', 0.8).replace('stroke="#000"', 'stroke="#000" stroke-opacity=".18"') : '';
    const legsStand = `<g ${vis('--ls', 1)}><g class="lgL" style="transform:translateY(calc(var(--sl,0) * 1px))">${blob(legL, pants, 2)}${shoeL}</g><g class="lgR" style="transform:translateY(calc(var(--sr,0) * 1px))">${blob(legR, pants, 2)}${shoeR}</g>${sh(`M${lw * 0.35} ${ty} H${lw + 1} L${lw} -6 H${lw * 0.3} Z`, st.shade + 0.04)}${crease}${sheen([-lw / 2, ty + 6], [-lw / 2, -12])}</g>`;
    // seated, seen from the front-right: each thigh runs forward (towards the viewer's left) from the hip, the shin drops to the floor in front of the seat
    const sitLeg = (hx) => { const kx = hx - 36; return line([hx, -41], [kx, -19], pants, lw + 1) + line([kx, -19], [kx, 9], pants, lw) + `<rect x="${f(kx - lw + 1)}" y="8" width="${f(lw + 3)}" height="7" rx="3" fill="${shoes}"/>`; };
    const legsSit = `<g ${vis('--lsit', 0)}>${sitLeg(-lw * 0.62)}${sitLeg(lw * 0.62)}</g>`;

    // arms in each pose
    const S = (d) => [d * (sw - aw * 0.45), sy + aw * 0.5];
    const standHand = (d) => [d * (ww + aw * 0.6), sy + al];
    const sideArm = (d) => short
      ? line(S(d), [S(d)[0] + (standHand(d)[0] - S(d)[0]) * 0.42, S(d)[1] + (standHand(d)[1] - S(d)[1]) * 0.42], top) + line([S(d)[0] + (standHand(d)[0] - S(d)[0]) * 0.42, S(d)[1] + (standHand(d)[1] - S(d)[1]) * 0.42], standHand(d), skin, aw * 0.8) + hand(standHand(d))
      : line(S(d), standHand(d), top) + hand(standHand(d)) + (d > 0 ? line(S(d), standHand(d), '#000', aw).replace('stroke="#000"', `stroke="#000" stroke-opacity="${st.shade}"`) : sheen(S(d), standHand(d)));
    const E = (d) => [d * (sw - aw * 0.15), sy + al * 0.6];
    const deskHand = (d) => [d * ww * 0.52, sy + al * 0.8], readHand = (d) => [d * ww * 0.88, sy + al * 0.42];
    const tap = (d, off) => `<g>${hand(deskHand(d))}<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.8;0 0;0 0" dur="${beat}s" begin="${off}s" repeatCount="indefinite"/></g>`;
    const bw = ww * 0.95, bh = al * 0.34, by = sy + al * 0.45;
    const book = `<path d="M${f(-bw)} ${f(by - bh / 2 - 2)} L0 ${f(by - bh / 2 + 1)} V${f(by + bh / 2 + 1)} L${f(-bw)} ${f(by + bh / 2 - 2)} Z" fill="#F4F1EA"/><path d="M${f(bw)} ${f(by - bh / 2 - 2)} L0 ${f(by - bh / 2 + 1)} V${f(by + bh / 2 + 1)} L${f(bw)} ${f(by + bh / 2 - 2)} Z" fill="#E4E0D6"/>` +
      `<path d="M${f(-bw)} ${f(by + bh / 2 - 2)} L0 ${f(by + bh / 2 + 1)} L${f(bw)} ${f(by + bh / 2 - 2)} V${f(by + bh / 2)} L0 ${f(by + bh / 2 + 3)} L${f(-bw)} ${f(by + bh / 2)} Z" fill="#3B4A5A"/>`;
    const Hm = [hr * 0.85, hy + hry * 0.78];
    const mug = `<rect x="${f(Hm[0] - 4)}" y="${f(Hm[1] - 10)}" width="8" height="9" rx="1.6" fill="#F4F1EA"/><path d="M${f(Hm[0] + 4)} ${f(Hm[1] - 8)} q3.4 .2 3.4 2.6 q0 2.4 -3.4 2.6" fill="none" stroke="#F4F1EA" stroke-width="1.4"/>`;
    const armsBack = `<g ${vis('--as', 1)}>${sideArm(-1)}${sideArm(1)}</g><g ${vis('--ad', 0)}>${line(S(-1), E(-1), top)}${line(S(1), E(1), top)}</g><g ${vis('--ar', 0)}>${line(S(-1), E(-1), top)}${line(S(1), E(1), top)}</g><g ${vis('--am', 0)}>${sideArm(-1)}${line(S(1), [sw - aw * 0.15, sy + al * 0.5], top)}</g>`;
    const armsFront = `<g ${vis('--ad', 0)}>${line(E(-1), deskHand(-1), fore)}${line(E(1), deskHand(1), fore)}${tap(-1, 0)}${tap(1, +(beat / 2).toFixed(3))}</g>` +
      `<g ${vis('--ar', 0)}>${line(E(-1), readHand(-1), fore)}${line(E(1), readHand(1), fore)}${book}${hand(readHand(-1))}${hand(readHand(1))}</g>` +
      `<g ${vis('--am', 0)}>${line([sw - aw * 0.15, sy + al * 0.5], Hm, fore)}${hand(Hm)}${mug}</g>`;

    // torso and outfit
    const torsoPts = [[-sw * 0.5, sy - 3], [sw * 0.5, sy - 3], [sw, sy + 5], [ww, ty], [-ww, ty], [-sw, sy + 5]];
    const torso = blob(torsoPts, top) + sh(`M${f(sw * 0.3)} ${f(sy - 3)} L${f(sw * 0.5)} ${f(sy - 3)} L${f(sw)} ${f(sy + 5)} L${f(ww)} ${f(ty)} L${f(ww * 0.4)} ${f(ty)} Z`) +
      sheen([-sw + 3, sy + 8], [-ww + 2, ty - 4]);
    const mid = sy + (ty - sy) * 0.55;
    let front = '';
    if (kind === 'blazer') {
      front = `<path d="M${f(-sw * 0.42)} ${f(sy - 3)} H${f(sw * 0.42)} L0 ${f(mid)} Z" fill="${shirt}"/>` + (tie ? `<path d="M-2 ${f(sy - 1)} H2 L3 ${f(mid - 6)} L0 ${f(mid - 1)} L-3 ${f(mid - 6)} Z" fill="${tie}"/>` : '') +
        `<path d="M${f(-sw * 0.42)} ${f(sy - 3)} L0 ${f(mid)} L${f(-sw * 0.3)} ${f(sy + (mid - sy) * 0.55)} L${f(-sw * 0.62)} ${f(sy + 2)} Z" fill="#000" opacity=".18"/><path d="M${f(sw * 0.42)} ${f(sy - 3)} L0 ${f(mid)} L${f(sw * 0.3)} ${f(sy + (mid - sy) * 0.55)} L${f(sw * 0.62)} ${f(sy + 2)} Z" fill="#000" opacity=".26"/>` +
        `<path d="M0 ${f(mid)} V${f(ty)}" stroke="#000" stroke-opacity=".22" stroke-width="1"/><circle cx="0" cy="${f(mid + (ty - mid) * 0.35)}" r="1.3" fill="#000" opacity=".35"/>` +
        `<path d="M${f(sw * 0.45)} ${f(sy + 13)} l6 -1.4 l-.6 4 l-5 1.1 Z" fill="${accent}"/>`;
    } else if (kind === 'knit') {
      front = `<path d="M${f(-hr * 0.55)} ${f(sy - 3)} Q0 ${f(sy + 6)} ${f(hr * 0.55)} ${f(sy - 3)}" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="2"/><rect x="${f(-ww)}" y="${f(ty - 4)}" width="${f(ww * 2)}" height="4" rx="2" fill="#000" opacity=".1"/>`;
    } else {
      front = `<path d="M${f(-hr * 0.45)} ${f(sy - 3)} L0 ${f(sy + 8)} L${f(hr * 0.45)} ${f(sy - 3)} Z" fill="${skin}"/><path d="M${f(-hr * 0.55)} ${f(sy - 4)} L-1 ${f(sy + 8)} L${f(-hr * 0.2)} ${f(sy + 11)} L${f(-hr * 0.85)} ${f(sy + 2)} Z M${f(hr * 0.55)} ${f(sy - 4)} L1 ${f(sy + 8)} L${f(hr * 0.2)} ${f(sy + 11)} L${f(hr * 0.85)} ${f(sy + 2)} Z" fill="${top}"/><path d="M${f(-hr * 0.55)} ${f(sy - 4)} L-1 ${f(sy + 8)} L${f(-hr * 0.2)} ${f(sy + 11)} L${f(-hr * 0.85)} ${f(sy + 2)} Z M${f(hr * 0.55)} ${f(sy - 4)} L1 ${f(sy + 8)} L${f(hr * 0.2)} ${f(sy + 11)} L${f(hr * 0.85)} ${f(sy + 2)} Z" fill="#fff" opacity=".15"/>` +
        (kind === 'polo' ? `<circle cx="0" cy="${f(sy + 12)}" r=".9" fill="#000" opacity=".3"/><circle cx="0" cy="${f(sy + 17)}" r=".9" fill="#000" opacity=".3"/>` : `<path d="M0 ${f(sy + 9)} V${f(ty)}" stroke="#000" stroke-opacity=".14" stroke-width="1"/>`);
    }
    if (kind !== 'blazer' && st.badge === 'lanyard') {
      const bY = sy + (ty - sy) * 0.42;
      front += `<path d="M-4 ${f(sy - 2)} L-1 ${f(bY)} M4 ${f(sy - 2)} L1 ${f(bY)}" stroke="${accent}" stroke-width="1.5" fill="none" stroke-linecap="round"/><rect x="-4.6" y="${f(bY)}" width="9.2" height="11" rx="1.5" fill="#F4F2EC" stroke="${accent}" stroke-width="1.1"/><rect x="-2.8" y="${f(bY + 2.4)}" width="5.6" height="1.8" rx=".9" fill="${accent}"/>`;
    } else if (kind !== 'blazer') {
      front += `<circle cx="${f(-sw * 0.5)}" cy="${f(sy + 13)}" r="${f(aw * 0.28)}" fill="${accent}"/>`;
    }
    const strap = bag ? line([-sw * 0.8, sy], [ww + 3, sy + (ty - sy) * 0.75], '#2A2B2F', 3.2) : '';
    const satchel = bag ? `<rect x="${f(ww - 2)}" y="${f(sy + (ty - sy) * 0.65)}" width="17" height="15" rx="2.6" fill="#3A3C42"/><rect x="${f(ww + 4.5)}" y="${f(sy + (ty - sy) * 0.65 + 4)}" width="4" height="3" rx=".8" fill="${accent}"/>` : '';

    // head
    const neckTop = hy + hry * 0.6;
    const neck = `<rect x="${f(-hr * 0.4)}" y="${f(neckTop)}" width="${f(hr * 0.8)}" height="${f(sy - neckTop + 3)}" rx="2.5" fill="${skin}"/><rect x="${f(-hr * 0.4)}" y="${f(neckTop + 2)}" width="${f(hr * 0.8)}" height="3" fill="#000" opacity=".12"/>`;
    const ears = st.ears ? `<ellipse cx="${f(-hr * 0.98)}" cy="${f(hy + 1)}" rx="${f(hr * 0.2)}" ry="${f(hr * 0.32)}" fill="${skin}"/><ellipse cx="${f(hr * 0.98)}" cy="${f(hy + 1)}" rx="${f(hr * 0.2)}" ry="${f(hr * 0.32)}" fill="${skin}"/>` : '';
    const headShade = sh(`M${f(hr * 0.35)} ${f(hy - hry * 0.95)} Q${f(hr)} ${f(hy - hry * 0.6)} ${f(hr)} ${f(hy)} Q${f(hr)} ${f(hy + hry * 0.75)} ${f(hr * 0.25)} ${f(hy + hry * 0.98)} Q${f(hr * 0.72)} ${f(hy + hry * 0.4)} ${f(hr * 0.72)} ${f(hy)} Q${f(hr * 0.72)} ${f(hy - hry * 0.55)} ${f(hr * 0.35)} ${f(hy - hry * 0.95)} Z`, st.shade * 0.8);
    let face = '';
    if (st.face === 'dots') face = `<g class="eye"><circle cx="${f(-hr * 0.36)}" cy="${f(hy)}" r="${f(hr * 0.085)}" fill="#2A1F1A"/><circle cx="${f(hr * 0.36)}" cy="${f(hy)}" r="${f(hr * 0.085)}" fill="#2A1F1A"/></g><path d="M${f(-hr * 0.2)} ${f(hy + hry * 0.42)} q${f(hr * 0.2)} ${f(hr * 0.11)} ${f(hr * 0.4)} 0" fill="none" stroke="#6E2F28" stroke-opacity=".6" stroke-width="1" stroke-linecap="round"/><circle cx="${f(-hr * 0.58)}" cy="${f(hy + hry * 0.3)}" r="${f(hr * 0.19)}" fill="#E07A6A" opacity=".16"/><circle cx="${f(hr * 0.58)}" cy="${f(hy + hry * 0.3)}" r="${f(hr * 0.19)}" fill="#E07A6A" opacity=".16"/>`;
    else if (st.face === 'detail') {
      const ey = hy - hry * 0.03, brow = hair === HAIR[4] || hair === HAIR[5] ? '#7A6A55' : hair;
      face = `<g class="eye"><ellipse cx="${f(-hr * 0.37)}" cy="${f(ey)}" rx="${f(hr * 0.13)}" ry="${f(hr * 0.15)}" fill="#1B1512"/><ellipse cx="${f(hr * 0.37)}" cy="${f(ey)}" rx="${f(hr * 0.13)}" ry="${f(hr * 0.15)}" fill="#1B1512"/><circle cx="${f(-hr * 0.32)}" cy="${f(ey - hr * 0.05)}" r=".45" fill="#fff"/><circle cx="${f(hr * 0.42)}" cy="${f(ey - hr * 0.05)}" r=".45" fill="#fff"/></g>` +
        `<path d="M${f(-hr * 0.6)} ${f(hy - hry * 0.28)} q${f(hr * 0.22)} -1 ${f(hr * 0.44)} 0 M${f(hr * 0.16)} ${f(hy - hry * 0.28)} q${f(hr * 0.22)} -1 ${f(hr * 0.44)} 0" stroke="${brow}" stroke-width="1.1" fill="none" stroke-linecap="round"/>` +
        `<path d="M0 ${f(hy + hry * 0.08)} l-1 ${f(hry * 0.26)} h1.8" fill="none" stroke="#000" stroke-opacity=".24" stroke-width=".9" stroke-linecap="round"/><path d="M${f(-hr * 0.27)} ${f(hy + hry * 0.55)} q${f(hr * 0.27)} 1.7 ${f(hr * 0.54)} 0" fill="none" stroke="#7A3A32" stroke-opacity=".7" stroke-width="1.1" stroke-linecap="round"/>`;
    }
    const head = ears + `<ellipse cx="0" cy="${f(hy)}" rx="${hr}" ry="${hry}" fill="${skin}"/>` + headShade + face;
    // hair, relative to the head
    const X = (k) => f(hr * k), Y = (k) => f(hy + hry * k);
    const cap = `<path d="M${X(-1.04)} ${Y(-0.05)} Q${X(-1.18)} ${Y(-1.22)} 0 ${Y(-1.14)} Q${X(1.18)} ${Y(-1.22)} ${X(1.04)} ${Y(-0.05)} Q${X(0.86)} ${Y(-0.62)} ${X(0.15)} ${Y(-0.68)} Q${X(-0.55)} ${Y(-0.6)} ${X(-1.04)} ${Y(-0.05)} Z" fill="${hair}"/>`;
    let hairBack = '', hairTop = '';
    if (style === 'short') hairTop = cap;
    else if (style === 'side') hairTop = `<path d="M${X(-1.05)} ${Y(0.05)} Q${X(-1.22)} ${Y(-1.25)} ${X(0.1)} ${Y(-1.18)} Q${X(1.2)} ${Y(-1.12)} ${X(1.04)} ${Y(-0.15)} Q${X(0.9)} ${Y(-0.62)} ${X(0.3)} ${Y(-0.78)} Q${X(-0.45)} ${Y(-0.42)} ${X(-1.05)} ${Y(0.05)} Z" fill="${hair}"/>`;
    else if (style === 'buzz') hairTop = `<path d="M${X(-0.98)} ${Y(-0.25)} Q${X(-1)} ${Y(-1.08)} 0 ${Y(-1.06)} Q${X(1)} ${Y(-1.08)} ${X(0.98)} ${Y(-0.25)} Q${X(0.7)} ${Y(-0.78)} 0 ${Y(-0.8)} Q${X(-0.7)} ${Y(-0.78)} ${X(-0.98)} ${Y(-0.25)} Z" fill="${hair}" opacity=".9"/>`;
    else if (style === 'curly') hairTop = [[-0.75, -0.75, 0.5], [0, -1.0, 0.6], [0.75, -0.75, 0.5], [-1.0, -0.32, 0.36], [1.0, -0.32, 0.36], [-0.38, -0.95, 0.46], [0.38, -0.95, 0.46]].map(([x, y, r]) => `<circle cx="${X(x)}" cy="${Y(y)}" r="${X(r)}" fill="${hair}"/>`).join('');
    else if (style === 'bun') hairTop = `<circle cx="0" cy="${Y(-1.3)}" r="${X(0.42)}" fill="${hair}"/>` + cap;
    else if (style === 'long') { hairBack = `<path d="M${X(-1.12)} ${Y(-0.2)} Q${X(-1.25)} ${Y(-1.2)} 0 ${Y(-1.18)} Q${X(1.25)} ${Y(-1.2)} ${X(1.12)} ${Y(-0.2)} L${X(1.25)} ${f(sy + 7)} Q${X(0.8)} ${f(sy + 10)} ${X(0.5)} ${f(sy + 5)} V${Y(0.4)} H${X(-0.5)} V${f(sy + 5)} Q${X(-0.8)} ${f(sy + 10)} ${X(-1.25)} ${f(sy + 7)} Z" fill="${hair}"/>`; hairTop = cap; }
    else if (style === 'bob') { hairBack = `<path d="M${X(-1.15)} ${Y(-0.1)} Q${X(-1.25)} ${Y(-1.2)} 0 ${Y(-1.18)} Q${X(1.25)} ${Y(-1.2)} ${X(1.15)} ${Y(-0.1)} V${Y(0.92)} Q${X(0.85)} ${Y(1.1)} ${X(0.6)} ${Y(0.85)} V${Y(0.2)} H${X(-0.6)} V${Y(0.85)} Q${X(-0.85)} ${Y(1.1)} ${X(-1.15)} ${Y(0.92)} Z" fill="${hair}"/>`; hairTop = cap; }
    const specs = glasses ? `<g fill="none" stroke="#1B1512" stroke-width="1"><rect x="${X(-0.66)}" y="${Y(-0.2)}" width="${X(0.56)}" height="${X(0.46)}" rx="1.6"/><rect x="${X(0.1)}" y="${Y(-0.2)}" width="${X(0.56)}" height="${X(0.46)}" rx="1.6"/><path d="M${X(-0.1)} ${Y(-0.02)} h${X(0.2)}"/></g>` : '';
    const headset = `<g ${vis('--hs', 0)}><path d="M${X(-1.12)} ${Y(0)} Q${X(-1.25)} ${Y(-1.5)} 0 ${Y(-1.5)} Q${X(1.25)} ${Y(-1.5)} ${X(1.12)} ${Y(0)}" fill="none" stroke="#8C929C" stroke-width="2.4"/><rect x="${X(-1.32)}" y="${Y(-0.35)}" width="${X(0.42)}" height="${f(hry * 0.7)}" rx="2.2" fill="#6E7480"/><rect x="${X(0.9)}" y="${Y(-0.35)}" width="${X(0.42)}" height="${f(hry * 0.7)}" rx="2.2" fill="#6E7480"/><path d="M${X(-1.1)} ${Y(0.35)} Q${X(-1)} ${Y(0.75)} ${X(-0.42)} ${Y(0.72)}" fill="none" stroke="#8C929C" stroke-width="1.3"/><circle cx="${X(-0.38)}" cy="${Y(0.72)}" r="1.5" fill="#1E1F23"/></g>`;
    const drop = -36 - ty;
    return `<g transform="scale(${s})"><ellipse rx="24" ry="7" fill="#000" opacity=".3" ${vis('--shd', 1)}/>${legsStand}${legsSit}<g style="transform:translateY(calc(var(--sitk,0) * ${drop}px))">${armsBack}${torso}${front}${strap}${hairBack}${neck}${head}${hairTop}${specs}${headset}${armsFront}${satchel}</g></g>`;
  };
  // Everyone wears the same company suit; colleagues have a gym build and very dark skin, the lead light skin.
  const SUIT = { kind: 'blazer', top: '#262D3A', pants: '#1D222B', shoes: '#111214', shirt: '#F2F0EA', tie: '#141820', accent: '#C9A227' };
  const GYM = { sw: 24.5, ww: 14.5, aw: 10.5, lw: 12 };
  const DARK = ['#3B2619', '#452C1D', '#352217'];
  const PEOPLE_CFG = [
    ['short', 0], ['buzz', 1], ['curly', 2], ['side', 0, 1], ['buzz', 2], ['curly', 1], ['short', 2], ['side', 1], ['buzz', 0, 1], ['curly', 0],
  ].map(([style, sk, glasses]) => ({ ...SUIT, build: GYM, skinHex: DARK[sk], hair: 0, style, glasses: !!glasses }));
  const CH_CFG = {
    lead: { ...SUIT, build: GYM, skinHex: '#F7E0CB', hair: 2, style: 'side' },
    ceo: { s: 0.54, build: { sw: 28, ww: 20, aw: 12, lw: 13.5 }, skin: 1, hair: 4, style: 'side', kind: 'blazer', top: '#C9A227', pants: '#B38E1E', shoes: '#8C6A16', shirt: '#F6E7B0', tie: '#8C6A16', glasses: true, accent: '#FFF3C4', gold: true },
    msgbot: { skin: 2, hair: 0, style: 'short', kind: 'polo', top: '#3E7C86', pants: '#2B2F38', bag: true, accent: '#9FD0D6' },
  };
  const fig = (look, v, i = 0) => person('realistic', { ...v, skin: v.skinHex || SKIN[v.skin], hair: HAIR[v.hair], beat: +(0.34 + (i % 5) * 0.045).toFixed(3) });

  const defsFor = (look) => { const PEOPLE = PEOPLE_CFG.map((v, i) => fig(look, v, i)), CH = { lead: fig(look, CH_CFG.lead), ceo: fig(look, CH_CFG.ceo), msgbot: fig(look, CH_CFG.msgbot) };
    return `<defs>
  <linearGradient id="vg-l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="vg-r" x1="0" y1="0" x2="1" y2="0"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
  <radialGradient id="vg-h" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22344A"/><stop offset="1" stop-color="#3B5470"/></linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="#F7D9A8" stop-opacity="0.55"/><stop offset="1" stop-color="#F7D9A8" stop-opacity="0"/></radialGradient>
  <pattern id="tiles" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0V50H0" fill="none" stroke="#26262A" stroke-width="1.4"/></pattern>
  <pattern id="carpet" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0V60H0" fill="none" stroke="#000" stroke-opacity=".16" stroke-width="1.2"/></pattern>
  <pattern id="timber" width="120" height="26" patternUnits="userSpaceOnUse"><path d="M0 13H120M0 26H120M30 0V13M90 13V26" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="1.3"/></pattern>
  <pattern id="planks" width="1000" height="33" patternUnits="userSpaceOnUse"><path d="M0 33H1000" stroke="#46342A" stroke-width="2"/></pattern>
  <symbol id="desk" overflow="visible"><ellipse cx="0" cy="24" rx="52" ry="14" fill="#000" opacity=".28"/>
    <polygon points="-44,-30 0,-5 0,25 -44,0" fill="#3B3F47"/><polygon points="44,-30 0,-5 0,25 44,0" fill="#2B2E35"/><polygon points="-40,-24 -4,-3.5 -4,19 -40,-1.5" fill="#000" opacity=".14"/>
    <polygon points="-44,-30 0,-5 0,-1.5 -44,-26.5" fill="#8F7558"/><polygon points="44,-30 0,-5 0,-1.5 44,-26.5" fill="#745E47"/><polygon points="0,-55 44,-30 0,-5 -44,-30" fill="#B8A083"/>
    <polygon points="0,-55 44,-30 40,-30 0,-52.7 -40,-30 -44,-30" fill="#fff" opacity=".14"/>
    <ellipse cx="-18" cy="-41" rx="8" ry="3.4" fill="#2A2B2F"/><rect x="-19.2" y="-56" width="2.4" height="15" fill="#3A3B40"/>
    <polygon points="-31.5,-50.5 -4.5,-66 -4.5,-85.5 -31.5,-70" fill="#141518"/><polygon class="screen" points="-30,-52 -6,-66 -6,-83 -30,-69" fill="#1E2630"/>
    <polygon points="-30,-66.4 -6,-80.4 -6,-83 -30,-69" fill="currentColor" opacity=".95"/>
    <polygon points="-27.5,-62 -14,-69.9 -14,-68.4 -27.5,-60.5" fill="#DDE3EA" opacity=".5"/><polygon points="-27.5,-58.6 -17,-64.7 -17,-63.2 -27.5,-57.1" fill="#DDE3EA" opacity=".32"/><polygon points="-27.5,-55.2 -20,-59.6 -20,-58.1 -27.5,-53.7" fill="#DDE3EA" opacity=".32"/>
    <polygon points="-12,-62.5 -8,-64.8 -8,-71 -12,-68.7" fill="currentColor" opacity=".7"/>
    <polygon points="3,-32 21,-21.8 14.5,-18 -3.5,-28.2" fill="#E6E3DC" stroke="#A9A69D" stroke-width=".6"/><ellipse cx="27.5" cy="-23.5" rx="3" ry="2" fill="#E6E3DC" stroke="#A9A69D" stroke-width=".5"/>
    <g transform="translate(-27 -27)"><rect x="-3" y="-7" width="6" height="7" rx="1.4" fill="#F1EEE7"/><ellipse cx="0" cy="-7" rx="3" ry="1.2" fill="#3B2A20"/></g></symbol>
  <symbol id="chair" overflow="visible"><ellipse cx="0" cy="1" rx="14" ry="5" fill="#000" opacity=".25"/><path d="M-11 1 L11 1 M-6 -3 L6 5 M6 -3 L-6 5" stroke="#2A2B2F" stroke-width="2" stroke-linecap="round"/><rect x="-1.3" y="-16" width="2.6" height="16" fill="#4A4C52"/>
    <rect x="-16" y="-62" width="32" height="42" rx="8" fill="#262930"/><rect x="-13" y="-59" width="26" height="34" rx="6" fill="#343840"/><ellipse cx="0" cy="-17" rx="13.5" ry="5.5" fill="#2E3138"/><ellipse cx="-2" cy="-18" rx="8" ry="2.6" fill="#fff" opacity=".06"/>
    <rect x="-18.5" y="-30" width="3" height="11" rx="1.5" fill="#1F2126"/><rect x="15.5" y="-30" width="3" height="11" rx="1.5" fill="#1F2126"/></symbol>
  ${PEOPLE.map((p, i) => `<symbol id="p${i}" overflow="visible">${p}</symbol>`).join('\n  ')}
  <symbol id="bot" overflow="visible">${PEOPLE[0]}</symbol>
  <symbol id="bot-lead" overflow="visible">${PEOPLE[2]}</symbol>
  <symbol id="lead" overflow="visible">${CH.lead}</symbol>
  <symbol id="ceo" overflow="visible">${CH.ceo}</symbol>
  <symbol id="msgbot" overflow="visible">${CH.msgbot}</symbol>
  <symbol id="leaddesk" overflow="visible"><ellipse cx="0" cy="16" rx="38" ry="10" fill="#000" opacity=".28"/>
    <path d="M-27 -33 V1 M27 -33 V1 M0 -17 V17" stroke="#2A2B2F" stroke-width="3" stroke-linecap="round"/>
    <polygon points="-30,-34 0,-17 0,-13.5 -30,-30.5" fill="#8F7558"/><polygon points="30,-34 0,-17 0,-13.5 30,-30.5" fill="#745E47"/><polygon points="0,-51 30,-34 0,-17 -30,-34" fill="#B8A083"/>
    <ellipse cx="-9" cy="-37" rx="6" ry="2.6" fill="#2A2B2F"/><rect x="-10" y="-49" width="2" height="12" fill="#3A3B40"/>
    <polygon points="-21,-44.5 3,-58.5 3,-77 -21,-63" fill="#141518"/><polygon points="-19.6,-46 1.6,-58.4 1.6,-75 -19.6,-62.6" fill="#1E2630"/><polygon points="-19.6,-60 1.6,-72.4 1.6,-75 -19.6,-62.6" fill="currentColor"/>
    <polygon points="-17.5,-55.5 -6,-62.2 -6,-60.8 -17.5,-54.1" fill="#DDE3EA" opacity=".45"/><polygon points="-17.5,-52 -9,-57 -9,-55.6 -17.5,-50.6" fill="#DDE3EA" opacity=".3"/>
    <polygon points="8,-36 19,-29.6 14.5,-27 3.5,-33.4" fill="#F1EEE7" stroke="#A9A69D" stroke-width=".6"/></symbol>
  <symbol id="table" overflow="visible"><ellipse cx="0" cy="2" rx="26" ry="9" fill="#000" opacity=".25"/><ellipse cx="0" cy="0" rx="11" ry="4.5" fill="#2A2B2F"/><rect x="-1.6" y="-23" width="3.2" height="23" fill="#3A3B40"/><ellipse cx="0" cy="-22" rx="26" ry="12" fill="#8F7558"/><ellipse cx="0" cy="-24.5" rx="26" ry="12" fill="#B8A083"/><ellipse cx="-6" cy="-26.5" rx="10" ry="4" fill="#fff" opacity=".12"/></symbol>
  <symbol id="stool" overflow="visible"><ellipse cx="0" cy="0" rx="7" ry="2.5" fill="#000" opacity=".25"/><rect x="-1.3" y="-15" width="2.6" height="15" fill="#3A3B40"/><ellipse cx="0" cy="-15" rx="9" ry="4.5" fill="#2E3138"/><ellipse cx="-2" cy="-16" rx="5" ry="2" fill="#fff" opacity=".08"/></symbol>
  <symbol id="cup" overflow="visible"><rect x="-3.4" y="-8" width="6.8" height="8" rx="1.6" fill="#F1EEE7"/><path d="M3.4 -6.4 q3.4 0 3.4 2.6 q0 2.6 -3.4 2.6" fill="none" stroke="#F1EEE7" stroke-width="1.4"/></symbol>
  <symbol id="plant" overflow="visible"><ellipse cx="0" cy="0" rx="12" ry="4" fill="#000" opacity=".25"/><circle cx="-8" cy="-24" r="9" fill="#5F8560"/><circle cx="8" cy="-26" r="9" fill="#4E7150"/><circle cx="0" cy="-34" r="11" fill="#5F8560"/><circle cx="-3" cy="-38" r="4" fill="#79A077"/><polygon points="-9,-16 9,-16 7,0 -7,0" fill="#C9C4B8"/><polygon points="2,-16 9,-16 7,0 1,0" fill="#000" opacity=".14"/></symbol>
  <symbol id="tallplant" overflow="visible"><ellipse cx="0" cy="0" rx="13" ry="4.5" fill="#000" opacity=".25"/><path d="M0 -18 C-2 -40 -14 -52 -18 -70 M0 -18 C3 -45 12 -58 16 -78 M0 -18 C0 -50 -2 -70 2 -92" stroke="#4E7150" stroke-width="2" fill="none"/><ellipse cx="-18" cy="-70" rx="9" ry="5" fill="#5F8560" transform="rotate(-30 -18 -70)"/><ellipse cx="-10" cy="-50" rx="9" ry="4.5" fill="#4E7150" transform="rotate(-20 -10 -50)"/><ellipse cx="16" cy="-78" rx="9" ry="5" fill="#79A077" transform="rotate(30 16 -78)"/><ellipse cx="9" cy="-56" rx="9" ry="4.5" fill="#5F8560" transform="rotate(25 9 -56)"/><ellipse cx="2" cy="-92" rx="7" ry="4.5" fill="#5F8560"/><ellipse cx="-4" cy="-36" rx="8" ry="4" fill="#79A077" transform="rotate(-15 -4 -36)"/><polygon points="-11,-20 11,-20 8,0 -8,0" fill="#3B3F47" stroke="#24262C"/></symbol>
  <symbol id="lamp" overflow="visible"><line x1="0" y1="-130" x2="0" y2="-34" stroke="#55534D" stroke-width="1.2"/><ellipse cx="0" cy="0" rx="34" ry="13" fill="url(#glow)"/><path d="M-12 -20 L-7 -34 L7 -34 L12 -20 Z" fill="#141413"/><ellipse cx="0" cy="-19" rx="12" ry="3" fill="#F2C98F"/></symbol>
  <symbol id="cooler" overflow="visible"><ellipse cx="0" cy="0" rx="12" ry="4" fill="#000" opacity=".25"/><rect x="-10" y="-38" width="20" height="38" rx="3" fill="#8D939B"/><rect x="0" y="-38" width="10" height="38" rx="2" fill="#757B84"/><rect x="-4" y="-26" width="8" height="5" rx="1" fill="#3A3935"/><path d="M-8 -38 C-8 -56 8 -56 8 -38 Z" fill="#A8C9DA" opacity="0.85"/><ellipse cx="-2" cy="-48" rx="2" ry="5" fill="#FFFFFF" opacity="0.5"/></symbol>
  <symbol id="floorlamp" overflow="visible"><ellipse cx="0" cy="0" rx="30" ry="11" fill="url(#glow)"/><ellipse cx="0" cy="0" rx="6" ry="2.2" fill="#2A2B2F"/><line x1="0" y1="0" x2="0" y2="-66" stroke="#55555C" stroke-width="1.8"/><path d="M-9 -64 L-6 -78 L6 -78 L9 -64 Z" fill="#E9DCC3"/></symbol>
  <symbol id="msgdesk" overflow="visible"><ellipse cx="0" cy="12" rx="28" ry="8" fill="#000" opacity=".25"/>
    <polygon points="-24,-12 0,2 0,14 -24,2" fill="#3B3F47"/><polygon points="24,-12 0,2 0,14 24,2" fill="#2B2E35"/><polygon points="0,-26 24,-12 0,2 -24,-12" fill="#B8A083"/>
    <polygon points="-14,-20 2,-28 2,-20 -14,-12" fill="#141413" opacity="0.5"/><polygon points="-14,-14 2,-22 2,-14 -14,-6" fill="#9FD0D6" opacity="0.8"/><polygon points="4,-16 16,-10 14,-7 2,-13" fill="#F1EEE7" opacity="0.9"/></symbol>
  </defs>`; };

  // Room: a work floor (WORK_D deep) then a lounge. Kept compact so a floor reads as one office, not a long hall.
  const ROOM_W = 1040, ROOM_D = 1900, GAP = 40, FAC_W = 440, WORK_D = 740, MIN_D = 2200;
  const OAK = ['#B8A083', '#8F7558', '#745E47'], GRAPH = ['#3B3F47', '#2B2E35', '#24262C'], WOOD = ['#8A6446', '#6E4F37', '#5A402C'];
  const SOFA = ['#5E6672', '#4B525D', '#3E444E'], SEAT = ['#6B7380', '#565D69', '#474D58'];

  // ── Furniture, drawn as true isometric boxes (never flat, front-on shapes) ──
  // A sofa / armchair faces +y (towards the viewer's left). Order matters: far pieces first.
  const sofaDraw = (x, y, len) => box(x, y, x + len, y + 14, 40, SOFA) + box(x - 12, y, x, y + 52, 28, SOFA) + box(x, y + 14, x + len, y + 52, 18, SEAT);
  const armchairDraw = (x, y) => box(x, y, x + 46, y + 12, 36, SOFA) + box(x - 9, y, x, y + 46, 24, SOFA) + box(x, y + 12, x + 46, y + 46, 16, SEAT);
  // while a lounge is being built, the seats on its sofas and armchairs collect in SEATS: the floor point under the hips, in the middle of the cushion.
  // The armrest nearest the viewer goes into OVER (drawn after the people), so a seated person sits between the back and that arm.
  let SEATS = null, OVER = '';
  const sofa = (x, y, len) => { if (SEATS) { const k = Math.max(2, Math.floor(len / 62)); for (let j = 0; j < k; j++) SEATS.push([x + len * (j + 0.5) / k, y + 31]); } OVER += box(x + len, y, x + len + 12, y + 52, 28, SOFA); return sofaDraw(x, y, len); };
  const armchair = (x, y) => { if (SEATS) SEATS.push([x + 23, y + 29]); OVER += box(x + 46, y, x + 55, y + 46, 24, SOFA); return armchairDraw(x, y); };
  const lowTable = (x, y, w = 90, d = 46) => box(x + 5, y + 5, x + w - 5, y + d - 5, 14, GRAPH) + box(x, y, x + w, y + d, 3, OAK, 14);
  const meeting = (x, y, len) => { // long oak table, chairs on both long sides
    const n = Math.max(2, Math.floor((len - 40) / 70)); let back = '', frontRow = '';
    for (let k = 0; k < n; k++) { const cx = x + 40 + k * ((len - 80) / Math.max(1, n - 1)); back += use('chair', cx, y - 18); frontRow += use('chair', cx, y + 84); }
    return back + box(x + 14, y + 10, x + 24, y + 56, 30, GRAPH) + box(x + len - 24, y + 10, x + len - 14, y + 56, 30, GRAPH) + box(x, y, x + len, y + 66, 4, OAK, 30) + frontRow;
  };
  const shelf = (x, y, len) => { // bookcase: carcass + rows of muted spines on its front face
    const w = len * 0.9238, cols = ['#8C7B6B', '#5E6A75', '#B5A58F', '#6F7F74', '#444A54', '#A9A39A'];
    let g = `<rect x="3" y="4" width="${f(w - 6)}" height="84" fill="#1D1F23"/>`;
    for (let r = 0; r < 4; r++) { let bx = 6, k = r * 3 + Math.round(x); const by = 6 + r * 21;
      while (bx < w - 12) { const bw = 4 + ((k * 7) % 5), bh = 11 + ((k * 5) % 7); if (k % 6 !== 4) g += `<rect x="${f(bx)}" y="${by + 18 - bh}" width="${bw}" height="${bh}" fill="${cols[k % cols.length]}"/>`; bx += bw + 1.2; k++; }
      g += `<rect x="3" y="${by + 18}" width="${f(w - 6)}" height="2.4" fill="#4A4E57"/>`; }
    return box(x, y, x + len, y + 26, 92, ['#3B3F47', '#30333A', '#26292F']) + `<g transform="${onPlaneY(x, y + 26, 92)}">${g}</g>`;
  };
  const display = (x, y, len) => { // wall panel with a screen showing a plain dashboard, sideboard in front
    const w = len * 0.9238, sx = w * 0.16, sw = w * 0.68;
    const bars = [18, 26, 15, 31, 22, 35].map((h, i) => `<rect x="${f(sx + 8 + i * 9)}" y="${f(58 - h)}" width="5.5" height="${h}" fill="${i === 5 ? '#E7B38F' : '#6F8FAF'}" opacity=".9"/>`).join('');
    return box(x, y, x + len, y + 12, 100, ['#3B3F47', '#2F3239', '#26292F']) +
      `<g transform="${onPlaneY(x, y + 12, 100)}"><rect x="${f(sx)}" y="10" width="${f(sw)}" height="56" rx="2" fill="#111215"/><rect x="${f(sx + 2.5)}" y="12.5" width="${f(sw - 5)}" height="51" fill="#1E2630"/>${bars}
        <polyline points="${f(sx + sw * 0.5)},50 ${f(sx + sw * 0.62)},40 ${f(sx + sw * 0.74)},44 ${f(sx + sw * 0.9)},26" fill="none" stroke="#DDE3EA" stroke-width="1.6" opacity=".8"/>
        <rect x="${f(sx + sw * 0.5)}" y="18" width="${f(sw * 0.3)}" height="2.4" fill="#DDE3EA" opacity=".55"/><rect x="${f(sx + sw * 0.5)}" y="23" width="${f(sw * 0.2)}" height="2" fill="#DDE3EA" opacity=".3"/></g>` +
      box(x + 24, y + 12, x + len - 24, y + 34, 20, GRAPH) + box(x + 20, y + 12, x + len - 20, y + 36, 3, OAK, 20);
  };
  const counter = (x, y, len) => // coffee point: cabinets, oak worktop, machine, cups
    box(x, y, x + len, y + 38, 38, GRAPH) + box(x - 3, y - 3, x + len + 3, y + 41, 3, OAK, 38) +
    box(x + 16, y + 6, x + 48, y + 30, 26, ['#2A2B2F', '#1D1E22', '#141518'], 41) +
    use('cup', x + 70, y + 20, '', 41) + use('cup', x + 86, y + 14, '', 41) + use('cup', x + len - 30, y + 20, '', 41);

  function build(depts, look) {
    REC = []; DOORS = []; OVER = '';
    // Pick the grid: as close to a square floorplan as possible, but never at the cost of holes in the grid
    // (four rooms are a 2x2, not three in a row plus a gap). Departments fill left to right, then a new row.
    const n = depts.length <= 1 ? 1 : depts.length + (depts.length % 2);
    let cols = 1, closest = Infinity;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const ratio = (c * (ROOM_W + GAP) + FAC_W) / Math.max(r * (ROOM_D + GAP) - GAP, MIN_D);
      const off = Math.abs(Math.log(ratio)) + (c * r - n) / n; // log: twice as wide scores like half as wide; empty cells cost a lot
      if (off < closest) { closest = off; cols = c; }
    }
    const rows = Math.ceil(n / cols);
    const fx = cols * (ROOM_W + GAP), W = fx + FAC_W, D = Math.max(rows * (ROOM_D + GAP) - GAP, MIN_D);
    const desksF = [], deskRoom = [], spotsF = [], spotProp = [], spotRoom = [], rooms = [];
    let floor = '', back = '', furn = '';
    // café spots first so their indexes never move: 10 across, 12 rows
    const CAFE_COLS = [fx + 26, fx + 68, fx + 110, fx + 152, fx + 200, fx + 248, fx + 292, fx + 336, fx + 378, fx + 418];
    const CAFE_PROP_CYCLE = ['mug', 'phone', 'rest', 'mug', 'book', 'rest', 'pad', 'mug', 'rest', 'mug', 'phone', 'music'];
    for (let ri = 0; ri < 12; ri++) {
      const y = 666 + ri * 68, stagger = (ri % 2) * 22;
      for (const x of CAFE_COLS) { spotsF.push([x + stagger, y]); spotProp.push(CAFE_PROP_CYCLE[ri % CAFE_PROP_CYCLE.length]); spotRoom.push(-1); }
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
      const lt = y0 + WORK_D + 20, lh = ROOM_D - WORK_D - 20, ly = y0 + WORK_D + 60;
      const gy = ly + 230, cy = ly + 520, dy = ly + 800;
      // floors: carpet tiles where people work, timber in the lounge, rugs under the seating groups
      floor += `<rect x="${x0}" y="${y0}" width="${ROOM_W}" height="${WORK_D}" fill="#24262B"/><rect x="${x0}" y="${y0}" width="${ROOM_W}" height="${WORK_D}" fill="url(#carpet)"/><rect class="room-floor" data-room="${i}" x="${x0 + 10}" y="${y0 + 10}" width="${ROOM_W - 20}" height="${WORK_D - 20}" rx="22" fill="#2A2A2E" opacity="0.6"/>
        <rect x="${x0}" y="${lt}" width="${ROOM_W}" height="${lh}" fill="#2B2622"/><rect x="${x0}" y="${lt}" width="${ROOM_W}" height="${lh}" fill="url(#timber)"/>
        <rect x="${x0 + 70}" y="${gy - 26}" width="420" height="190" rx="16" fill="#343942"/><rect x="${x0 + 100}" y="${dy - 30}" width="800" height="200" rx="16" fill="#343942"/>
        <rect class="room-accent" data-room="${i}" x="${x0 + 40}" y="${y0 + WORK_D - 62}" width="10" height="46" rx="3" fill="#55555C"/><text class="room-name" data-room="${i}" x="${x0 + 66}" y="${y0 + WORK_D - 22}" font-family="Newsreader, Georgia, serif" font-size="52" fill="#FAF9F5" opacity="0.72"></text>
        <text x="${x0 + 40}" y="${lt + 40}" font-size="22" font-weight="600" letter-spacing="7" fill="#FAF9F5" opacity="0.2">LOUNGE</text>`;
      furn += `<use href="#leaddesk" x="${f(room.lead[0] - 25)}" y="${f(room.lead[1] + 20)}" class="room-screen" data-room="${i}" style="color:#3A3935"/><g class="lead-slot" data-room="${i}" transform="translate(${f(room.lead[0])} ${f(room.lead[1])})"></g>`;
      furn += use('tallplant', x1 - 40, y0 + 40) + use('plant', x1 - 40, y0 + WORK_D - 30); REC.push([x0 + 66, y0 + 97, x0 + 106, y0 + 137]); // lead desk
      // 50 desks: 10 x 5
      for (let rr = 0; rr < 5; rr++) for (let cc = 0; cc < 10; cc++) { room.desks.push(desksF.length); desksF.push([x0 + 80 + cc * 95, y0 + 200 + rr * 110]); deskRoom.push(i); }
      furn += glass(x0, y0 + WORK_D + 10, x1, y0 + WORK_D + 10, 54, [0.4, 0.62]);
      furn += `<g transform="${onPlaneY(x0 + 430, y0 + WORK_D + 10, 78)}"><rect x="0" y="-16" width="150" height="26" rx="6" fill="#141413" stroke="#55555C" stroke-width="1.2"/><text x="75" y="2" text-anchor="middle" font-size="12" font-weight="600" letter-spacing="3" fill="#D6D4CC">LOUNGE</text></g>`;
      furn += glass(x1, y0, x1, y1, 66, [0.3, 0.42]);
      if (y1 < D - 5) furn += glass(x0, y1, x1, y1, 66, [0.45, 0.58]);

      // ── Lounge: four zones, back to front. `blocked` = floor nobody may stand on (furniture, and just behind tall pieces).
      const blocked = []; SEATS = [];
      // A: coffee point + two standing tables
      furn += counter(x0 + 150, ly + 40, 300);
      for (let k = 0; k < 4; k++) furn += use('stool', x0 + 190 + k * 70, ly + 108);
      furn += use('plant', x0 + 50, ly + 70) + use('tallplant', x1 - 60, ly + 50);
      furn += use('table', x0 + 660, ly + 70) + use('cup', x0 + 654, ly + 66, '', 25) + use('stool', x0 + 620, ly + 96) + use('table', x0 + 820, ly + 70) + use('stool', x0 + 862, ly + 92);
      blocked.push([x0 + 120, ly - 30, x0 + 470, ly + 125], [x0 + 600, ly + 30, x0 + 880, ly + 110]);
      // B: sofa group on a rug; meeting table in front of a wall display
      furn += use('floorlamp', x0 + 80, gy + 16) + sofa(x0 + 110, gy, 240) + armchair(x0 + 396, gy + 6) + lowTable(x0 + 180, gy + 84, 100, 46) + use('cup', x0 + 214, gy + 100, '', 17) + use('plant', x0 + 500, gy + 10);
      furn += display(x0 + 600, gy - 30, 300) + meeting(x0 + 610, gy + 70, 280);
      blocked.push([x0 + 70, gy - 12, x0 + 470, gy + 140], [x0 + 580, gy - 110, x0 + 920, gy + 186]);
      // C: bookcases with a reading pair; a second pair by the window side
      furn += shelf(x0 + 70, cy, 160) + shelf(x0 + 240, cy, 160) + use('floorlamp', x0 + 430, cy + 50);
      furn += armchair(x0 + 110, cy + 96) + use('table', x0 + 205, cy + 124) + armchair(x0 + 250, cy + 96);
      furn += armchair(x0 + 620, cy + 40) + use('table', x0 + 716, cy + 70) + use('cup', x0 + 710, cy + 66, '', 25) + armchair(x0 + 762, cy + 40) + use('plant', x0 + 900, cy + 40);
      blocked.push([x0 + 60, cy - 80, x0 + 410, cy + 150], [x0 + 600, cy + 30, x0 + 830, cy + 96]);
      // D: two facing sofa groups on a long rug
      furn += use('floorlamp', x0 + 110, dy + 16) + sofa(x0 + 150, dy, 220) + lowTable(x0 + 210, dy + 84, 100, 46) + use('plant', x0 + 500, dy + 20);
      furn += sofa(x0 + 620, dy, 220) + lowTable(x0 + 680, dy + 84, 100, 46) + use('cup', x0 + 716, dy + 100, '', 17) + use('floorlamp', x0 + 880, dy + 16);
      furn += use('plant', x0 + 50, dy + 190) + use('tallplant', x1 - 60, dy + 170);
      blocked.push([x0 + 130, dy - 12, x0 + 390, dy + 140], [x0 + 600, dy - 12, x0 + 860, dy + 140]);

      const seats = SEATS; SEATS = null;
      // people standing at the coffee counter and the two standing tables
      room.coffee = [[x0 + 225, ly + 68], [x0 + 295, ly + 68], [x0 + 365, ly + 68], [x0 + 435, ly + 68], [x0 + 640, ly + 132], [x0 + 860, ly + 132]].map(([x, y]) => P(x, y));
      for (const [sx, sy] of seats) { room.rest.push(spotsF.length); spotsF.push([sx, sy]); spotProp.push('read'); spotRoom.push(i); }
      const clear = (sx, sy) => !blocked.some(([a, b, a2, b2]) => sx > a - 16 && sx < a2 + 16 && sy > b - 16 && sy < b2 + 16);
      const LPROPS = ['phone', 'mug', 'pad', 'book', 'phone', 'rest', 'mug', 'pad', 'phone', 'book'];
      for (let lr = 0; lr < 13; lr++) for (let lc = 0; lc < 10; lc++) {
        const sx = x0 + 60 + lc * 98 + (lr % 2) * 30, sy = ly - 5 + lr * 84;
        if (sx > x1 - 40 || !clear(sx, sy)) continue;
        room.rest.push(spotsF.length); spotsF.push([sx, sy]); spotProp.push(LPROPS[(lr * 3 + lc) % LPROPS.length]); spotRoom.push(i);
      }
      rooms.push(room);
    }

    // ── FACILITY COLUMN ──────────────────────────────────────────────────────
    // CEO office (y 0–425), Messenger corner (y 435–555), Café (y 565–1490), Open desks (y 1500+)
    floor += `<rect x="${fx}" width="${FAC_W}" height="425" fill="#26282C"/><rect x="${fx + 24}" y="24" width="${FAC_W - 48}" height="377" rx="18" fill="#3A342B"/>
      <rect x="${fx}" y="435" width="${FAC_W}" height="120" fill="#24262B"/><rect x="${fx + 16}" y="445" width="${FAC_W - 32}" height="100" rx="12" fill="#2F3239"/>
      <rect x="${fx}" y="565" width="${FAC_W}" height="925" fill="#3A2B22"/><rect x="${fx}" y="565" width="${FAC_W}" height="925" fill="url(#planks)"/>
      <text x="${fx + 30}" y="636" font-family="Newsreader, Georgia, serif" font-size="52" fill="#E7B38F" opacity="0.28">Café</text>
      <rect x="${fx}" y="1500" width="${FAC_W}" height="${D - 1500}" fill="#24262B"/><rect x="${fx}" y="1500" width="${FAC_W}" height="${D - 1500}" fill="url(#carpet)"/><text x="${fx + 30}" y="${D - 24}" font-size="24" font-weight="600" letter-spacing="6" fill="#FAF9F5" opacity="0.2">OPEN DESKS</text>`;

    // CEO: glass office, oak executive desk
    furn += glass(fx, 0, fx, 425, 74, [0.55, 0.8]) + glass(fx, 425, W, 425, 74) +
      use('chair', fx + 230, 96) + box(fx + 164, 114, fx + 296, 176, 30, GRAPH) + box(fx + 156, 106, fx + 304, 184, 4, OAK, 30) +
      use('tallplant', fx + 400, 40) + use('plant', fx + 40, 380) + armchair(fx + 90, 270) + armchair(fx + 250, 270);
    furn += `<g transform="${onPlaneY(fx + 140, 425, 66)}"><rect x="0" y="-14" width="140" height="22" rx="4" fill="#141413" stroke="#55555C" stroke-width="1"/><text x="70" y="2" text-anchor="middle" font-size="11" font-weight="600" letter-spacing="2" fill="#D6D4CC">CEO OFFICE</text></g>`;

    // Messenger corner (y 435–555): small desk, sign, partition glass
    const helperX = fx + 220, helperY = 495;
    furn += glass(fx, 435, W, 435, 32, [0.25, 0.72]);
    furn += glass(fx, 555, W, 555, 32, [0.22, 0.68]);
    furn += use('msgdesk', helperX, helperY);
    furn += use('plant', fx + 40, 500);
    furn += `<g transform="${onPlaneY(fx + 110, 435, 48)}"><rect x="0" y="-12" width="190" height="20" rx="4" fill="#141413" stroke="#55555C" stroke-width="1"/><text x="95" y="2" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="2.5" fill="#9FD0D6">MESSENGER</text></g>`;

    // Café bar + tables
    furn += box(fx + 40, 580, fx + 400, 612, 36, WOOD) + box(fx + 40, 580, fx + 400, 612, 3, ['#C9A984', '#A9744C', '#8A5E3C'], 34) +
      box(fx + 60, 585, fx + 90, 605, 26, ['#55534D', '#3A3935', '#232320'], 37) + use('cup', fx + 300, 594, '', 37);
    for (const [x, y] of [[fx + 90, 710], [fx + 310, 720], [fx + 180, 800], [fx + 90, 900], [fx + 310, 900], [fx + 200, 1000], [fx + 90, 1120], [fx + 310, 1120], [fx + 200, 1240], [fx + 90, 1360], [fx + 310, 1360]])
      furn += use('table', x, y) + use('cup', x - 6, y, '', 25);
    furn += use('lamp', fx + 90, 710) + use('lamp', fx + 310, 720) + use('lamp', fx + 180, 800);
    furn += use('tallplant', fx + 392, 1440) + use('plant', fx + 30, 1440);
    furn += glass(fx, 1490, W, 1490, 40, [0.4, 0.6]);
    const hot = [], hotXY = [];
    for (let y = 1570; y < D - 60; y += 140) hotXY.push([fx + 130, y], [fx + 310, y]);
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

    for (const [x, y] of desksF) REC.push([x - 28, y - 28, x + 28, y + 28], [x - 21, y - 54, x + 7, y - 26]); // desk top + its chair (the chair is behind the desk)
    const nav = { W, D, rects: REC, doors: DOORS }; REC = DOORS = null;
    const desks = desksF.map(([x, y]) => P(x, y)), cafe = spotsF.map(([x, y]) => P(x, y));
    const order = desks.map((d, i) => i).sort((a, b) => desks[a][1] - desks[b][1]);
    // chair, then the person (in .seat, low enough to read as sitting), then the desk in front of both
    const deskSvg = order.map((i) => `<g class="desk" data-desk="${i}" transform="translate(${f(desks[i][0])} ${f(desks[i][1])}) scale(1.1)"><use href="#chair" x="24" y="-20"/><g class="seat" transform="translate(24 -19)"></g><use class="desk-top" href="#desk" style="color:#3A3935"/></g>`).join('');
    const ceo = P(fx + 230, 80);
    const helper = P(helperX, helperY);
    const minX = P(0, D)[0], maxX = P(W, 0)[0], maxY = P(W, D)[1] + 30;
    const vb = { x: minX - 40, y: -10, w: maxX - minX + 80, h: maxY + 20 };
    const inner = `${defsFor(look || LOOK)}<g id="layer-back">${back}${furn}<g id="ceo-slot" transform="translate(${f(ceo[0])} ${f(ceo[1])})"></g><g id="helper-slot" transform="translate(${f(helper[0])} ${f(helper[1])})"></g></g><g id="layer-desks">${deskSvg}</g><g id="layer-free"></g><g id="layer-over">${OVER}</g><g id="layer-walk"></g>`;
    return { inner, vb, desks, deskRoom, rooms, hot, cafe, cafeIdx, spotProp, spotRoom, ceo, helper, nav };
  }
  window.VScene = { build, people: PEOPLE_CFG.length, looks: LOOKS, look: LOOK, defsFor };
})();
