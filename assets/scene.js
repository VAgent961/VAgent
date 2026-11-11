// Generates the whole office SVG from an array of department objects {id, name, color}.
// plus the CEO office, the café, the messenger corner and open desks. Floor coords -> screen: X = 600 + 0.8(x - y), Y = 110 + 0.462(x + y).
// window.VScene.build(departments) -> { inner, vb, desks, deskRoom, rooms[{desks, rest, lead, box}], hot, cafe, cafeIdx, spotProp, ceo, helper }
// window.VScene.people = how many different office workers exist as symbols #p0..#p(n-1) (office.js picks one per agent).
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
      return `<polygon points="${pts(P(...A), P(...B), P(...B, h), P(...A, h))}" fill="#8FB0BE" opacity="0.16" stroke="#4F6B78"/><polyline points="${pts(P(...A, h), P(...B, h))}" stroke="#6B8A97" stroke-width="2.5" fill="none"/>`; };
    return gap ? seg(0, gap[0]) + seg(gap[1], 1) : seg(0, 1);
  };
  const onWallR = (x, h) => { const [X, Y] = P(x, 0, h); return `matrix(0.866 0.5 0 1 ${f(X)} ${f(Y)})`; };
  const onPlaneY = (x, y, h) => { const [X, Y] = P(x, y, h); return `matrix(0.866 0.5 0 1 ${f(X)} ${f(Y)})`; };
  const sky = (a, b, h0, h1, wall) => { const Q = wall === 'R' ? (t, h) => P(t, 0, h) : (t, h) => P(0, t, h);
    return `<polygon points="${pts(Q(a - 4, h0 - 4), Q(b + 4, h0 - 4), Q(b + 4, h1 + 4), Q(a - 4, h1 + 4))}" fill="#45454C"/><polygon points="${pts(Q(a, h0), Q(b, h0), Q(b, h1), Q(a, h1))}" fill="url(#sky)"/><polyline points="${pts(Q((a + b) / 2, h0), Q((a + b) / 2, h1))}" stroke="#45454C" stroke-width="3"/>`; };

  // ── People ────────────────────────────────────────────────────────────────
  // Adult proportions (about 6.5 heads tall), drawn front-on. Unscaled: feet at y=0, top of the head at about -150.
  // The only strong colour is the lanyard badge (currentColor = the agent's colour); clothes stay office-neutral.
  const SKIN = ['#F1D3B8', '#E3B892', '#C99A72', '#A9764F', '#7A5237'];
  const HAIR = ['#1F1B18', '#3B2A20', '#5A3E2B', '#8A5A3A', '#B8B2A7', '#C9A66B'];
  const person = (o) => {
    const { s = 0.5, skin, hair, style = 'short', kind = 'shirt', top, pants = '#2B2F38', shoes = '#17181B', glasses, bag, tie, accent = 'currentColor' } = o;
    const sh = (d, op = 0.13) => `<path d="${d}" fill="#000" opacity="${op}"/>`;
    const shortSleeve = kind === 'polo';
    const shadow = `<ellipse rx="24" ry="7" fill="#000" opacity=".3"/>`;
    const legs = `<path d="M-15 -70 H-1 L-3 -5 H-13 Z" fill="${pants}"/><path d="M1 -70 H15 L13 -5 H3 Z" fill="${pants}"/>` + sh('M8 -70 H15 L13 -5 H8 Z', 0.16) +
      `<rect x="-16" y="-7" width="14" height="7" rx="3" fill="${shoes}"/><rect x="2" y="-7" width="14" height="7" rx="3" fill="${shoes}"/>`;
    const arm = (d) => { const x = d < 0 ? -28 : 19;
      return `<rect x="${x}" y="-117" width="9" height="${shortSleeve ? 22 : 50}" rx="4.5" fill="${top}"/>` +
        (shortSleeve ? `<rect x="${x + 1}" y="-99" width="7" height="33" rx="3.5" fill="${skin}"/>` : '') +
        `<circle cx="${x + 4.5}" cy="-64" r="4.3" fill="${skin}"/>` + (d > 0 ? `<rect x="${x + 4.5}" y="-117" width="4.5" height="52" rx="2.2" fill="#000" opacity=".12"/>` : ''); };
    // seated: upper arms down, forearms forward onto the desk (shown only inside a .seat, see office.css)
    const sitUpper = `<rect x="-28" y="-117" width="9" height="30" rx="4.5" fill="${top}"/><rect x="19" y="-117" width="9" height="30" rx="4.5" fill="${top}"/><rect x="23.5" y="-117" width="4.5" height="30" rx="2.2" fill="#000" opacity=".12"/>`;
    const fore = shortSleeve ? skin : top;
    const sitFore = `<path d="M-23.5 -92 L-9 -80 M23.5 -92 L9 -80" stroke="${fore}" stroke-width="8.6" stroke-linecap="round" fill="none"/><path d="M23.5 -92 L9 -80" stroke="#000" stroke-opacity=".12" stroke-width="8.6" stroke-linecap="round" fill="none"/>` +
      `<circle cx="-8" cy="-79" r="4.4" fill="${skin}"/><circle cx="8" cy="-79" r="4.4" fill="${skin}"/>`;
    const torso = `<path d="M-9 -121 L-20 -118 Q-23 -117 -23 -112 L-19 -70 Q-19 -65 -14 -65 H14 Q19 -65 19 -70 L23 -112 Q23 -117 20 -118 L9 -121 Z" fill="${top}"/>` +
      sh('M9 -121 L20 -118 Q23 -117 23 -112 L19 -70 Q19 -65 14 -65 H9 Z');
    let front;
    if (kind === 'blazer') {
      front = `<path d="M-8 -121 H8 L0 -90 Z" fill="#F1EEE7"/>` + (tie ? `<path d="M-2 -119 H2 L3.2 -98 L0 -93 L-3.2 -98 Z" fill="${tie}"/>` : '') +
        `<path d="M-8 -121 L0 -90 L-5 -99 L-13 -117 Z" fill="#000" opacity=".22"/><path d="M8 -121 L0 -90 L5 -99 L13 -117 Z" fill="#000" opacity=".3"/>` +
        `<path d="M0 -90 V-65" stroke="#000" stroke-opacity=".25" stroke-width="1"/><circle cx="0" cy="-82" r="1.3" fill="#000" opacity=".4"/>` +
        `<path d="M10 -103 l6 -1.5 l-.6 4 l-5 1.2 Z" fill="${accent}"/>`;
    } else {
      const collar = kind === 'knit'
        ? `<path d="M-8 -121 Q0 -112 8 -121" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="2.2"/><rect x="-19" y="-70" width="38" height="4" rx="2" fill="#000" opacity=".12"/>`
        : `<path d="M-8 -121 L0 -111 L8 -121 Z" fill="${skin}"/>` + sh('M-8 -121 L0 -111 L8 -121 Z', 0.12) +
          `<path d="M-9 -122 L-1 -112 L-6 -109 L-11 -118 Z M9 -122 L1 -112 L6 -109 L11 -118 Z" fill="${top}"/><path d="M-9 -122 L-1 -112 L-6 -109 L-11 -118 Z M9 -122 L1 -112 L6 -109 L11 -118 Z" fill="#fff" opacity=".16"/>` +
          `<path d="M0 -110 V-66" stroke="#000" stroke-opacity=".16" stroke-width="1"/>`;
      front = collar + `<path d="M-6 -119 L-1 -97 M6 -119 L1 -97" stroke="${accent}" stroke-width="1.7" fill="none" stroke-linecap="round"/>` +
        `<rect x="-5" y="-98" width="10" height="12" rx="1.6" fill="#F4F2EC" stroke="${accent}" stroke-width="1.2"/><rect x="-3" y="-95.5" width="6" height="2" rx="1" fill="${accent}"/><rect x="-3" y="-91.5" width="6" height="1.4" rx=".7" fill="#9A968A"/>`;
    }
    const strap = bag ? `<path d="M-18 -118 L21 -80" stroke="#2A2B2F" stroke-width="3.4" stroke-linecap="round"/>` : '';
    const satchel = bag ? `<rect x="14" y="-86" width="18" height="16" rx="2.6" fill="#3A3C42"/><rect x="14" y="-86" width="18" height="6" rx="2.6" fill="#2A2B2F"/><rect x="21" y="-82" width="4" height="3.2" rx=".8" fill="${accent}"/>` : '';
    const neck = `<rect x="-4.8" y="-130" width="9.6" height="12" rx="3" fill="${skin}"/><rect x="-4.8" y="-126" width="9.6" height="4" fill="#000" opacity=".14"/>`;
    const brow = hair === HAIR[4] || hair === HAIR[5] ? '#7A6A55' : hair;
    const head = `<ellipse cx="-11" cy="-136" rx="2.2" ry="3.4" fill="${skin}"/><ellipse cx="11" cy="-136" rx="2.2" ry="3.4" fill="${skin}"/><ellipse cx="0" cy="-137" rx="10.8" ry="13" fill="${skin}"/>` +
      sh('M4 -149.6 Q10.8 -146 10.8 -137 Q10.8 -127 3 -124.2 Q8 -130 8 -138 Q8 -145 4 -149.6 Z', 0.1) +
      `<g class="eye"><circle cx="-4.1" cy="-136.5" r="1.3" fill="#1B1512"/><circle cx="4.1" cy="-136.5" r="1.3" fill="#1B1512"/></g>` +
      `<path d="M-6.4 -139.8 h4.4 M2 -139.8 h4.4" stroke="${brow}" stroke-width="1" stroke-linecap="round" opacity=".8"/>` +
      `<path d="M0 -135 l-1.1 3.4 h1.9" fill="none" stroke="#000" stroke-opacity=".22" stroke-width=".9" stroke-linecap="round"/>` +
      `<path d="M-3 -129.2 q3 1.7 6 0" fill="none" stroke="#6E2F28" stroke-opacity=".65" stroke-width="1.1" stroke-linecap="round"/>`;
    const cap = (d) => `<path d="${d}" fill="${hair}"/>`;
    const fringe = 'M-11.4 -138 Q-13 -152.6 0 -152.6 Q13 -152.6 11.4 -138 Q9 -146 2 -147 Q-5 -145.5 -9.6 -147 Q-10.8 -143 -11.4 -138 Z';
    let hairBack = '', hairTop = '';
    if (style === 'short') hairTop = cap(fringe);
    else if (style === 'side') hairTop = cap('M-11.6 -137.5 Q-14 -153.5 1 -153.5 Q13.4 -153 11.6 -139 Q10.4 -146.6 3 -148 Q-4.5 -143.6 -10 -145.4 Q-11 -141.5 -11.6 -137.5 Z');
    else if (style === 'buzz') hairTop = `<path d="M-10.9 -140 Q-11.4 -150.8 0 -150.8 Q11.4 -150.8 10.9 -140 Q8.4 -147 0 -147 Q-8.4 -147 -10.9 -140 Z" fill="${hair}" opacity=".9"/>`;
    else if (style === 'curly') hairTop = [[-8.4, -146.4, 5.6], [0, -150, 6.6], [8.4, -146.4, 5.6], [-11.6, -140.6, 3.7], [11.6, -140.6, 3.7], [-4, -148, 5], [4, -148, 5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${hair}"/>`).join('');
    else if (style === 'bun') hairTop = `<circle cx="0" cy="-154.5" r="4.8" fill="${hair}"/>` + cap(fringe);
    else if (style === 'long') { hairBack = cap('M-12.8 -140 Q-14.4 -153.4 0 -153.4 Q14.4 -153.4 12.8 -140 L14 -114 Q9.5 -109.5 5.5 -115 V-128 H-5.5 V-115 Q-9.5 -109.5 -14 -114 Z'); hairTop = cap('M-11.6 -137 Q-13.4 -153 0 -153 Q13.4 -153 11.6 -137 Q8.6 -146.6 0 -147.4 Q-7 -145.6 -11.6 -137 Z'); }
    else if (style === 'bob') { hairBack = cap('M-13.2 -140 Q-14.6 -153.4 0 -153.4 Q14.6 -153.4 13.2 -140 V-126.5 Q10 -122.5 6.6 -126 V-131 H-6.6 V-126 Q-10 -122.5 -13.2 -126.5 Z'); hairTop = cap('M-11.8 -136 Q-13.6 -153 0 -153 Q13.6 -153 11.8 -136 Q9.6 -146 3.4 -147.4 Q-6.4 -144 -11.8 -136 Z'); }
    const shine = `<path d="M-7 -149 Q-1 -152.2 5 -150.4" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.4" stroke-linecap="round"/>`;
    const specs = glasses ? `<g fill="none" stroke="#1B1512" stroke-width="1"><rect x="-7.6" y="-139.4" width="6.4" height="5.2" rx="1.8"/><rect x="1.2" y="-139.4" width="6.4" height="5.2" rx="1.8"/><path d="M-1.2 -137.2 h2.4 M-7.6 -137.6 L-10.6 -138.4 M7.6 -137.6 L10.6 -138.4"/></g>` : '';
    return `<g transform="scale(${s})">${shadow}${legs}<g style="display:var(--stand,inline)">${arm(-1)}${arm(1)}</g><g style="display:var(--sit,none)">${sitUpper}</g>${torso}${front}${strap}<g style="display:var(--sit,none)">${sitFore}</g>${hairBack}${neck}${head}${hairTop}${shine}${specs}${satchel}</g>`;
  };
  // Ten colleagues. skin/hair are indexes into SKIN/HAIR.
  const PEOPLE = [
    { skin: 2, hair: 0, style: 'short', kind: 'shirt',  top: '#5B7A9C', pants: '#2C3340' },
    { skin: 0, hair: 3, style: 'long',  kind: 'knit',   top: '#B9A58C', pants: '#2B2B30' },
    { skin: 3, hair: 0, style: 'curly', kind: 'blazer', top: '#39424E', pants: '#2A2E36' },
    { skin: 1, hair: 1, style: 'side',  kind: 'shirt',  top: '#E4E1D8', pants: '#3A3F4A', glasses: true },
    { skin: 4, hair: 0, style: 'buzz',  kind: 'knit',   top: '#3F5A52', pants: '#26282C' },
    { skin: 1, hair: 0, style: 'bob',   kind: 'blazer', top: '#6B5B4B', pants: '#2B2B30' },
    { skin: 0, hair: 5, style: 'side',  kind: 'polo',   top: '#35506E', pants: '#8A7B66' },
    { skin: 3, hair: 0, style: 'bun',   kind: 'shirt',  top: '#C9D3DD', pants: '#2C3340' },
    { skin: 2, hair: 4, style: 'short', kind: 'knit',   top: '#55585F', pants: '#2A2E36', glasses: true },
    { skin: 4, hair: 0, style: 'long',  kind: 'shirt',  top: '#A7B8A0', pants: '#2B2B30' },
  ].map((v) => person({ ...v, skin: SKIN[v.skin], hair: HAIR[v.hair] }));
  const CH = {
    lead:   person({ skin: SKIN[1], hair: HAIR[1], style: 'side',  kind: 'blazer', top: '#2F343C', pants: '#23262C' }),
    ceo:    person({ s: 0.54, skin: SKIN[1], hair: HAIR[4], style: 'side', kind: 'blazer', top: '#23262C', pants: '#1C1E23', tie: '#B5532F', glasses: true, accent: '#F1EEE7' }),
    msgbot: person({ skin: SKIN[2], hair: HAIR[0], style: 'short', kind: 'polo', top: '#3E7C86', pants: '#2B2F38', bag: true, accent: '#9FD0D6' }),
  };

  const DEFS = `<defs>
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
  </defs>`;

  // Room: a work floor (WORK_D deep) then a lounge. Kept compact so a floor reads as one office, not a long hall.
  const ROOM_W = 1040, ROOM_D = 1900, GAP = 40, FAC_W = 440, WORK_D = 740, MIN_D = 2200;
  const OAK = ['#B8A083', '#8F7558', '#745E47'], GRAPH = ['#3B3F47', '#2B2E35', '#24262C'], WOOD = ['#8A6446', '#6E4F37', '#5A402C'];
  const SOFA = ['#5E6672', '#4B525D', '#3E444E'], SEAT = ['#6B7380', '#565D69', '#474D58'];

  // ── Furniture, drawn as true isometric boxes (never flat, front-on shapes) ──
  // A sofa / armchair faces +y (towards the viewer's left). Order matters: far pieces first.
  const sofa = (x, y, len) => box(x, y, x + len, y + 14, 40, SOFA) + box(x - 12, y, x, y + 52, 28, SOFA) + box(x, y + 14, x + len, y + 52, 18, SEAT) + box(x + len, y, x + len + 12, y + 52, 28, SOFA);
  const armchair = (x, y) => box(x, y, x + 46, y + 12, 36, SOFA) + box(x - 9, y, x, y + 46, 24, SOFA) + box(x, y + 12, x + 46, y + 46, 16, SEAT) + box(x + 46, y, x + 55, y + 46, 24, SOFA);
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

  function build(depts) {
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
    const desksF = [], deskRoom = [], spotsF = [], spotProp = [], rooms = [];
    let floor = '', back = '', furn = '';
    // café spots first so their indexes never move: 10 across, 12 rows
    const CAFE_COLS = [fx + 26, fx + 68, fx + 110, fx + 152, fx + 200, fx + 248, fx + 292, fx + 336, fx + 378, fx + 418];
    const CAFE_PROP_CYCLE = ['mug', 'phone', 'rest', 'mug', 'book', 'rest', 'pad', 'mug', 'rest', 'mug', 'phone', 'music'];
    for (let ri = 0; ri < 12; ri++) {
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
      const lt = y0 + WORK_D + 20, lh = ROOM_D - WORK_D - 20, ly = y0 + WORK_D + 60;
      const gy = ly + 230, cy = ly + 520, dy = ly + 800;
      // floors: carpet tiles where people work, timber in the lounge, rugs under the seating groups
      floor += `<rect x="${x0}" y="${y0}" width="${ROOM_W}" height="${WORK_D}" fill="#24262B"/><rect x="${x0}" y="${y0}" width="${ROOM_W}" height="${WORK_D}" fill="url(#carpet)"/><rect class="room-floor" data-room="${i}" x="${x0 + 10}" y="${y0 + 10}" width="${ROOM_W - 20}" height="${WORK_D - 20}" rx="22" fill="#2A2A2E" opacity="0.6"/>
        <rect x="${x0}" y="${lt}" width="${ROOM_W}" height="${lh}" fill="#2B2622"/><rect x="${x0}" y="${lt}" width="${ROOM_W}" height="${lh}" fill="url(#timber)"/>
        <rect x="${x0 + 70}" y="${gy - 26}" width="420" height="190" rx="16" fill="#343942"/><rect x="${x0 + 100}" y="${dy - 30}" width="800" height="200" rx="16" fill="#343942"/>
        <rect class="room-accent" data-room="${i}" x="${x0 + 40}" y="${y0 + WORK_D - 62}" width="10" height="46" rx="3" fill="#55555C"/><text class="room-name" data-room="${i}" x="${x0 + 66}" y="${y0 + WORK_D - 22}" font-family="Newsreader, Georgia, serif" font-size="52" fill="#FAF9F5" opacity="0.72"></text>
        <text x="${x0 + 40}" y="${lt + 40}" font-size="22" font-weight="600" letter-spacing="7" fill="#FAF9F5" opacity="0.2">LOUNGE</text>`;
      furn += `<use href="#leaddesk" x="${f(room.lead[0] - 25)}" y="${f(room.lead[1] + 20)}" class="room-screen" data-room="${i}" style="color:#3A3935"/><g class="lead-slot" data-room="${i}" transform="translate(${f(room.lead[0])} ${f(room.lead[1])})"></g>`;
      furn += use('tallplant', x1 - 40, y0 + 40) + use('plant', x1 - 40, y0 + WORK_D - 30);
      // 50 desks: 10 x 5
      for (let rr = 0; rr < 5; rr++) for (let cc = 0; cc < 10; cc++) { room.desks.push(desksF.length); desksF.push([x0 + 80 + cc * 95, y0 + 200 + rr * 110]); deskRoom.push(i); }
      furn += glass(x0, y0 + WORK_D + 10, x1, y0 + WORK_D + 10, 54, [0.4, 0.62]);
      furn += `<g transform="${onPlaneY(x0 + 430, y0 + WORK_D + 10, 78)}"><rect x="0" y="-16" width="150" height="26" rx="6" fill="#141413" stroke="#55555C" stroke-width="1.2"/><text x="75" y="2" text-anchor="middle" font-size="12" font-weight="600" letter-spacing="3" fill="#D6D4CC">LOUNGE</text></g>`;
      furn += glass(x1, y0, x1, y1, 66, [0.3, 0.42]);
      if (y1 < D - 5) furn += glass(x0, y1, x1, y1, 66, [0.45, 0.58]);

      // ── Lounge: four zones, back to front. `blocked` = floor nobody may stand on (furniture, and just behind tall pieces).
      const blocked = [];
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

      const clear = (sx, sy) => !blocked.some(([a, b, a2, b2]) => sx > a - 16 && sx < a2 + 16 && sy > b - 16 && sy < b2 + 16);
      const LPROPS = ['mug', 'phone', 'rest', 'book', 'pad', 'rest', 'mug', 'music', 'rest', 'phone'];
      for (let lr = 0; lr < 13; lr++) for (let lc = 0; lc < 10; lc++) {
        const sx = x0 + 60 + lc * 98 + (lr % 2) * 30, sy = ly - 5 + lr * 84;
        if (sx > x1 - 40 || !clear(sx, sy)) continue;
        room.rest.push(spotsF.length); spotsF.push([sx, sy]); spotProp.push(LPROPS[(lr * 3 + lc) % LPROPS.length]);
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

    const desks = desksF.map(([x, y]) => P(x, y)), cafe = spotsF.map(([x, y]) => P(x, y));
    const order = desks.map((d, i) => i).sort((a, b) => desks[a][1] - desks[b][1]);
    // chair, then the person (in .seat, low enough to read as sitting), then the desk in front of both
    const deskSvg = order.map((i) => `<g class="desk" data-desk="${i}" transform="translate(${f(desks[i][0])} ${f(desks[i][1])}) scale(1.1)"><use href="#chair" x="24" y="-20"/><g class="seat" transform="translate(24 -14)"></g><use class="desk-top" href="#desk" style="color:#3A3935"/></g>`).join('');
    const ceo = P(fx + 230, 80);
    const helper = P(helperX, helperY);
    const minX = P(0, D)[0], maxX = P(W, 0)[0], maxY = P(W, D)[1] + 30;
    const vb = { x: minX - 40, y: -10, w: maxX - minX + 80, h: maxY + 20 };
    const inner = `${DEFS}<g id="layer-back">${back}${furn}<g id="ceo-slot" transform="translate(${f(ceo[0])} ${f(ceo[1])})"></g><g id="helper-slot" transform="translate(${f(helper[0])} ${f(helper[1])})"></g></g><g id="layer-desks">${deskSvg}</g><g id="layer-free"></g><g id="layer-walk"></g>`;
    return { inner, vb, desks, deskRoom, rooms, hot, cafe, cafeIdx, spotProp, ceo, helper };
  }
  window.VScene = { build, people: PEOPLE.length };
})();
