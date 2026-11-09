// Static isometric office art (no app logic). Floor 1500 x 1000 units: 6 big department rooms (3 x 2),
// CEO office + café + open desks in the right column.
// Floor coords -> screen: X = 600 + 0.8(x - y), Y = 110 + 0.462(x + y).
// Exposes window.VScene = { svg, desks, deskRoom, rooms, hot, cafe, ceo, vb }.
(function () {
  const W = 1500, D = 1000;
  const P = (x, y, h = 0) => [600 + 0.8 * (x - y), 110 + 0.462 * (x + y) - h];
  const pts = (...a) => a.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const poly = (fill, ...a) => `<polygon points="${pts(...a)}" fill="${fill}"/>`;
  const box = (x0, y0, x1, y1, h, [top, front, side], z = 0) =>
    poly(side, P(x1, y0, z), P(x1, y1, z), P(x1, y1, z + h), P(x1, y0, z + h)) +
    poly(front, P(x0, y1, z), P(x1, y1, z), P(x1, y1, z + h), P(x0, y1, z + h)) +
    poly(top, P(x0, y0, z + h), P(x1, y0, z + h), P(x1, y1, z + h), P(x0, y1, z + h));
  const wallR = (x0, x1, h0, h1, fill, extra = '') => `<polygon points="${pts(P(x0, 0, h0), P(x1, 0, h0), P(x1, 0, h1), P(x0, 0, h1))}" fill="${fill}" ${extra}/>`;
  const wallL = (y0, y1, h0, h1, fill, extra = '') => `<polygon points="${pts(P(0, y0, h0), P(0, y1, h0), P(0, y1, h1), P(0, y0, h1))}" fill="${fill}" ${extra}/>`;
  const onR = (x, h) => { const [X, Y] = P(x, 0, h); return `matrix(0.866 0.5 0 1 ${X.toFixed(1)} ${Y.toFixed(1)})`; };
  const at = (x, y, h = 0) => { const [X, Y] = P(x, y, h); return `x="${X.toFixed(1)}" y="${Y.toFixed(1)}"`; };
  const use = (id, x, y, h = 0) => `<use href="#${id}" ${at(x, y, h)}/>`;
  const windowR = (x0, x1, h0, h1) => wallR(x0 - 4, x1 + 4, h0 - 4, h1 + 4, '#F7F3EA') + wallR(x0, x1, h0, h1, 'url(#sky)') + `<polyline points="${pts(P((x0 + x1) / 2, 0, h0), P((x0 + x1) / 2, 0, h1))}" stroke="#F7F3EA" stroke-width="3"/>`;
  const windowL = (y0, y1, h0, h1) => wallL(y0 - 4, y1 + 4, h0 - 4, h1 + 4, '#F7F3EA') + wallL(y0, y1, h0, h1, 'url(#sky)') + `<polyline points="${pts(P(0, (y0 + y1) / 2, h0), P(0, (y0 + y1) / 2, h1))}" stroke="#F7F3EA" stroke-width="3"/>`;
  // glass wall from (x0,y0) to (x1,y1) with an optional door gap [g0,g1] along its length (0..1)
  const glass = (x0, y0, x1, y1, h = 62, gap) => {
    const seg = (a, b) => { const A = [x0 + (x1 - x0) * a, y0 + (y1 - y0) * a], B = [x0 + (x1 - x0) * b, y0 + (y1 - y0) * b];
      return `<polygon points="${pts(P(...A), P(...B), P(...B, h), P(...A, h))}" fill="#CFE3E8" opacity="0.3" stroke="#B9CFD5"/><polyline points="${pts(P(...A, h), P(...B, h))}" stroke="#A9C3CA" stroke-width="2.5" fill="none"/>`; };
    return gap ? seg(0, gap[0]) + seg(gap[1], 1) : seg(0, 1);
  };

  // 6 rooms: columns x 0-380 / 400-780 / 800-1180, rows y 0-470 / 510-1000
  const RW = 380, cols = [0, 400, 800], rowsY = [[0, 470], [510, 1000]];
  const roomsF = []; for (const [y0, y1] of rowsY) for (const x0 of cols) roomsF.push({ x0, y0, x1: x0 + RW, y1 });
  const deskF = [], deskRoom = [];
  roomsF.forEach((r, i) => { for (const dy of [180, 300, 420]) for (const dx of [130, 280]) if (r.y0 + dy < r.y1 - 20) { deskF.push([r.x0 + dx, r.y0 + dy]); deskRoom.push(i); } });
  const hotF = [[1270, 820], [1420, 820], [1270, 940], [1420, 940]];
  const hot = hotF.map((_, i) => deskF.length + i); hotF.forEach((d) => { deskF.push(d); deskRoom.push(-1); });
  const desks = deskF.map(([x, y]) => P(x, y));
  const cafeF = []; for (const y of [470, 545, 620, 695]) for (const x of [1230, 1300, 1370, 1440]) cafeF.push([x + ((y - 470) / 75 % 2) * 22, y]);
  const cafe = cafeF.map(([x, y]) => P(x, y));
  const rooms = roomsF.map((r, i) => ({ lead: P(r.x0 + 75, r.y0 + 70), name: [r.x0 + 40, r.y0 + 130], desks: deskRoom.map((x, j) => (x === i ? j : -1)).filter((j) => j >= 0) }));
  const deskOrder = desks.map((d, i) => i).sort((a, b) => desks[a][1] - desks[b][1]);

  const defs = `<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFD9E6"/><stop offset="1" stop-color="#E4EFF1"/></linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="#F7D9A8" stop-opacity="0.75"/><stop offset="1" stop-color="#F7D9A8" stop-opacity="0"/></radialGradient>
  <pattern id="tiles" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0V50H0" fill="none" stroke="#E7E1D3" stroke-width="1.4"/></pattern>
  <pattern id="planks" width="1000" height="33" patternUnits="userSpaceOnUse"><path d="M0 33H1000" stroke="#D4B796" stroke-width="2"/></pattern>
  <symbol id="desk" overflow="visible"><ellipse cx="0" cy="22" rx="50" ry="14" fill="#141413" opacity="0.07"/><polygon points="-44,-22 0,3 0,25 -44,0" fill="#E6DFCF"/><polygon points="44,-22 0,3 0,25 44,0" fill="#D2C9B5"/><polygon points="-40,-20 -4,1 -4,22 -40,1" fill="#DCD4C2"/><polygon points="0,-47 44,-22 0,3 -44,-22" fill="#F7F3EA" stroke="#CFC8B6"/><polygon points="-14,-34 -6,-30 -6,-26 -14,-30" fill="#3A3935"/><polygon points="-32,-40 -2,-57 -2,-85 -32,-68" fill="#141413"/><polygon class="screen" points="-29,-44 -5,-58 -5,-81 -29,-67" fill="currentColor" opacity="0.9"/><polygon points="-26,-52 -12,-60 -12,-58 -26,-50" fill="#141413" opacity="0.45"/><polygon points="-26,-58 -9,-68 -9,-66 -26,-56" fill="#141413" opacity="0.45"/><polygon points="-26,-64 -15,-70 -15,-68 -26,-62" fill="#141413" opacity="0.3"/><polygon points="8,-28 26,-18 18,-13 0,-23" fill="#E8E6DC" stroke="#D6D1C3" stroke-width="0.6"/><circle cx="30" cy="-22" r="2.6" fill="#D6D1C3"/><g transform="translate(-24 -20)"><rect x="-3.5" y="-8" width="7" height="8" rx="1.5" fill="#B5532F"/><ellipse cx="0" cy="-8" rx="3.5" ry="1.4" fill="#8F3F22"/></g><g transform="translate(26 -40)"><polygon points="0,0 2,-1 2,-16 0,-15" fill="#3A3935"/><polygon points="-6,-15 8,-20 6,-14 -6,-11" fill="#3A3935"/><ellipse cx="1" cy="-12" rx="4" ry="1.6" fill="#F2C98F"/></g></symbol>
  <symbol id="crown" overflow="visible"><path d="M-10 0 L-12 -12 L-5 -6 L0 -15 L5 -6 L12 -12 L10 0 Z" fill="#E9C46A" stroke="#B8862B" stroke-width="1"/><circle cx="0" cy="-15" r="1.8" fill="#B5532F"/></symbol>
  <symbol id="chair" overflow="visible"><ellipse cx="0" cy="0" rx="13" ry="5" fill="#141413" opacity="0.12"/><path d="M-11 0 L11 0 M0 -5 L0 5" stroke="#3A3935" stroke-width="2.4" stroke-linecap="round"/><rect x="-1.5" y="-15" width="3" height="15" fill="#55534D"/><rect x="-11" y="-44" width="22" height="26" rx="8" fill="#3D3D3A"/><rect x="-8" y="-41" width="16" height="20" rx="6" fill="#4A4945"/><ellipse cx="0" cy="-16" rx="13" ry="6" fill="#55534D"/></symbol>
  <symbol id="bot" overflow="visible"><ellipse cx="0" cy="0" rx="14" ry="4.5" fill="#141413" opacity="0.14"/><rect x="-8" y="-9" width="6" height="9" rx="3" fill="#BDB8AA"/><rect x="2" y="-9" width="6" height="9" rx="3" fill="#A9A497"/><ellipse cx="-14" cy="-18" rx="3.5" ry="6.5" fill="#DCD8CC" transform="rotate(12 -14 -18)"/><ellipse cx="14" cy="-18" rx="3.5" ry="6.5" fill="#C8C3B5" transform="rotate(-12 14 -18)"/><rect x="-12" y="-30" width="24" height="23" rx="10" fill="#ECE9E0"/><path d="M2 -30 h0 a10 10 0 0 1 10 10 v3 a10 10 0 0 1 -10 10 z" fill="#D9D5C9"/><rect x="-12" y="-30" width="24" height="5" rx="2.5" fill="currentColor"/><circle cx="-5" cy="-17" r="2.4" fill="currentColor"/><line x1="0" y1="-56" x2="0" y2="-63" stroke="#8A8880" stroke-width="2" stroke-linecap="round"/><circle cx="0" cy="-65" r="5" fill="currentColor" opacity="0.25"/><circle cx="0" cy="-65" r="3" fill="currentColor"/><circle cx="-16" cy="-44" r="3.6" fill="currentColor"/><circle cx="16" cy="-44" r="3.6" fill="currentColor"/><rect x="-16" y="-57" width="32" height="26" rx="11" fill="#F7F5EE"/><path d="M4 -57 h1 a11 11 0 0 1 11 11 v4 a11 11 0 0 1 -11 11 h-1 z" fill="#E4E0D5"/><rect x="-12" y="-52" width="24" height="16" rx="7" fill="#1E1E1C"/><rect class="eye" x="-8" y="-48" width="4.5" height="8" rx="2.25" fill="currentColor"/><rect class="eye" x="3.5" y="-48" width="4.5" height="8" rx="2.25" fill="currentColor"/><circle cx="-6.5" cy="-46.5" r="1" fill="#fff"/><circle cx="4.8" cy="-46.5" r="1" fill="#fff"/><ellipse cx="-10" cy="-39.5" rx="2.2" ry="1.2" fill="#E7B38F" opacity="0.7"/><ellipse cx="10" cy="-39.5" rx="2.2" ry="1.2" fill="#E7B38F" opacity="0.7"/><path d="M-11 -54 q5 -2 9 -1" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity="0.35"/></symbol>
  <symbol id="lead" overflow="visible"><ellipse cx="0" cy="0" rx="22" ry="6.5" fill="#141413" opacity="0.14"/><ellipse cx="-9" cy="-1" rx="6" ry="3.5" fill="#8F3F22"/><ellipse cx="9" cy="-1" rx="6" ry="3.5" fill="#8F3F22"/><path d="M-20 -2 C-20 -30 -11 -48 0 -48 C11 -48 20 -30 20 -2 Q0 4 -20 -2 Z" fill="#B5532F"/><path d="M6 -47 C15 -42 20 -28 20 -2 Q12 1 4 1 C10 -14 11 -32 6 -47 Z" fill="#9C4527"/><ellipse cx="-9" cy="-36" rx="4" ry="7" fill="#D27A57" opacity="0.6" transform="rotate(20 -9 -36)"/><ellipse cx="-21" cy="-16" rx="4" ry="7" fill="#A84B2B" transform="rotate(20 -21 -16)"/><ellipse cx="21" cy="-16" rx="4" ry="7" fill="#8F3F22" transform="rotate(-20 21 -16)"/><circle cx="-6" cy="-28" r="4.5" fill="#FAF9F5"/><circle cx="-5" cy="-27.5" r="2.4" fill="#141413"/><circle cx="-4.2" cy="-28.6" r="0.8" fill="#fff"/><circle cx="7" cy="-28" r="4.5" fill="#FAF9F5"/><circle cx="8" cy="-27.5" r="2.4" fill="#141413"/><circle cx="8.8" cy="-28.6" r="0.8" fill="#fff"/><ellipse cx="-11" cy="-21" rx="3" ry="1.6" fill="#E59A7A" opacity="0.8"/><ellipse cx="12" cy="-21" rx="3" ry="1.6" fill="#E59A7A" opacity="0.8"/><path d="M-3 -20 Q1.5 -16 6 -20" fill="none" stroke="#141413" stroke-width="1.8" stroke-linecap="round"/><path d="M-16 -31 C-16 -53 16 -53 16 -31" fill="none" stroke="#1E1E1C" stroke-width="2.6"/><rect x="-19.5" y="-35" width="6" height="10" rx="3" fill="#1E1E1C"/><rect x="13.5" y="-35" width="6" height="10" rx="3" fill="#1E1E1C"/><path d="M-16 -27 q-2 8 6 10" fill="none" stroke="#1E1E1C" stroke-width="1.5" stroke-linecap="round"/><circle cx="-9" cy="-17" r="1.8" fill="#1E1E1C"/><path d="M-5 -11 L0 -6 L5 -11 L0 -13 Z" fill="currentColor"/><circle cx="0" cy="-13" r="2.6" fill="currentColor"/></symbol>
  <symbol id="leaddesk" overflow="visible"><ellipse cx="0" cy="14" rx="36" ry="10" fill="#141413" opacity="0.07"/><polygon points="-30,-15 0,2 0,16 -30,-1" fill="#E6DFCF"/><polygon points="30,-15 0,2 0,16 30,-1" fill="#D2C9B5"/><polygon points="0,-32 30,-15 0,2 -30,-15" fill="#F7F3EA" stroke="#CFC8B6"/><polygon points="-20,-27 0,-38 0,-56 -20,-45" fill="#141413"/><polygon points="-18,-30 -2,-39 -2,-53 -18,-44" fill="currentColor" opacity="0.85"/><polygon points="6,-20 18,-13 13,-10 1,-17" fill="#FAF9F5" stroke="#D6D1C3" stroke-width="0.6"/></symbol>
  <symbol id="table" overflow="visible"><ellipse cx="0" cy="2" rx="26" ry="9" fill="#141413" opacity="0.08"/><ellipse cx="0" cy="0" rx="12" ry="5" fill="#8A6446"/><rect x="-2" y="-22" width="4" height="22" fill="#8A6446"/><ellipse cx="0" cy="-22" rx="26" ry="12" fill="#B98B64"/><ellipse cx="0" cy="-24" rx="26" ry="12" fill="#CFA47C"/><ellipse cx="-6" cy="-26" rx="10" ry="4" fill="#DDB892" opacity="0.6"/></symbol>
  <symbol id="stool" overflow="visible"><ellipse cx="0" cy="0" rx="7" ry="2.5" fill="#141413" opacity="0.1"/><rect x="-1.5" y="-14" width="3" height="14" fill="#8A6446"/><ellipse cx="0" cy="-14" rx="9" ry="4.5" fill="#3D3D3A"/><ellipse cx="-2" cy="-15" rx="5" ry="2" fill="#55534D"/></symbol>
  <symbol id="cup" overflow="visible"><rect x="-4" y="-9" width="8" height="9" rx="2" fill="#FAF9F5"/><path d="M4 -7 q4 0 4 3 q0 3 -4 3" fill="none" stroke="#FAF9F5" stroke-width="1.6"/><path class="steam" d="M-1 -12 q2 -3 0 -6 q-2 -3 0 -6" fill="none" stroke="#B0AEA5" stroke-width="1.2" stroke-linecap="round"/></symbol>
  <symbol id="plant" overflow="visible"><ellipse cx="0" cy="0" rx="12" ry="4" fill="#141413" opacity="0.1"/><circle cx="-8" cy="-22" r="9" fill="#6E9668"/><circle cx="8" cy="-24" r="9" fill="#5B7F57"/><circle cx="0" cy="-32" r="11" fill="#6E9668"/><circle cx="-3" cy="-36" r="4" fill="#86AE7F"/><polygon points="-10,-14 10,-14 7,0 -7,0" fill="#B5532F"/><polygon points="2,-14 10,-14 7,0 1,0" fill="#9C4527"/></symbol>
  <symbol id="tallplant" overflow="visible"><ellipse cx="0" cy="0" rx="13" ry="4.5" fill="#141413" opacity="0.1"/><path d="M0 -18 C-2 -40 -14 -52 -18 -70 M0 -18 C3 -45 12 -58 16 -78 M0 -18 C0 -50 -2 -70 2 -92" stroke="#5B7F57" stroke-width="2" fill="none"/><ellipse cx="-18" cy="-70" rx="9" ry="5" fill="#6E9668" transform="rotate(-30 -18 -70)"/><ellipse cx="-10" cy="-50" rx="9" ry="4.5" fill="#5B7F57" transform="rotate(-20 -10 -50)"/><ellipse cx="16" cy="-78" rx="9" ry="5" fill="#86AE7F" transform="rotate(30 16 -78)"/><ellipse cx="9" cy="-56" rx="9" ry="4.5" fill="#6E9668" transform="rotate(25 9 -56)"/><ellipse cx="2" cy="-92" rx="7" ry="4.5" fill="#6E9668"/><ellipse cx="-4" cy="-36" rx="8" ry="4" fill="#86AE7F" transform="rotate(-15 -4 -36)"/><polygon points="-11,-20 11,-20 8,0 -8,0" fill="#F7F3EA" stroke="#D2C9B5"/></symbol>
  <symbol id="lamp" overflow="visible"><line x1="0" y1="-130" x2="0" y2="-34" stroke="#55534D" stroke-width="1.2"/><ellipse cx="0" cy="0" rx="34" ry="13" fill="url(#glow)"/><path d="M-12 -20 L-7 -34 L7 -34 L12 -20 Z" fill="#141413"/><ellipse cx="0" cy="-19" rx="12" ry="3" fill="#F2C98F"/></symbol>
  <symbol id="cooler" overflow="visible"><ellipse cx="0" cy="0" rx="12" ry="4" fill="#141413" opacity="0.1"/><rect x="-10" y="-38" width="20" height="38" rx="3" fill="#E8E6DC"/><rect x="0" y="-38" width="10" height="38" rx="2" fill="#D6D1C3"/><rect x="-4" y="-26" width="8" height="5" rx="1" fill="#3A3935"/><path d="M-8 -38 C-8 -56 8 -56 8 -38 Z" fill="#A8C9DA" opacity="0.85"/><ellipse cx="-2" cy="-48" rx="2" ry="5" fill="#FFFFFF" opacity="0.5"/></symbol>
  </defs>`;

  const back = `
  ${poly('#CDC4B0', P(0, D), P(W, D), P(W, D, -16), P(0, D, -16))}${poly('#BFB6A1', P(W, 0), P(W, D), P(W, D, -16), P(W, 0, -16))}
  ${wallR(0, W, 0, 100, '#E9E4D8')}${wallL(0, D, 0, 100, '#DCD5C4')}${wallR(0, W, 100, 106, '#F2EEE4')}${wallL(0, D, 100, 106, '#E6E0D1')}
  <g transform="matrix(0.8 0.462 -0.8 0.462 600 110)">
    <rect width="${W}" height="${D}" fill="#ECE7DC"/><rect width="${W}" height="${D}" fill="url(#tiles)"/>
    ${roomsF.map((r, i) => `<rect x="${r.x0}" y="${r.y0}" width="${RW}" height="${r.y1 - r.y0}" fill="#F4F0E6"/><rect class="room-floor" data-room="${i}" x="${r.x0 + 8}" y="${r.y0 + 8}" width="${RW - 16}" height="${r.y1 - r.y0 - 16}" rx="18" fill="#E8E2D4" opacity="0.6"/><text class="room-name" data-room="${i}" x="${r.x0 + 34}" y="${r.y0 + 150}" font-family="Newsreader, Georgia, serif" font-size="40" font-weight="500" fill="#141413" opacity="0.32"></text>`).join('')}
    <rect x="1200" width="300" height="360" fill="#E6DAC3"/><rect x="1225" y="25" width="250" height="310" rx="16" fill="#D9C27A" opacity="0.3"/>
    <rect x="1200" y="380" width="300" height="370" fill="#E2C9AD"/><rect x="1200" y="380" width="300" height="370" fill="url(#planks)"/>
    <ellipse cx="1350" cy="590" rx="120" ry="110" fill="#C9714F" opacity="0.14"/>
    <text x="1228" y="740" font-family="Newsreader, Georgia, serif" font-size="40" fill="#8A5E3C" opacity="0.35">Café</text>
    <rect x="1200" y="770" width="300" height="230" fill="#EFEAE0"/><text x="1222" y="992" font-size="20" font-weight="600" letter-spacing="3" fill="#141413" opacity="0.18">OPEN DESKS</text>
    <rect width="${W}" height="${D}" fill="none" stroke="#D8D1BF" stroke-width="2"/>
  </g>
  ${wallR(0, W, 0, 7, '#D2C9B5')}${wallL(0, D, 0, 7, '#C9C0AC')}
  ${windowR(110, 270, 50, 92)}${windowR(510, 670, 50, 92)}${windowR(910, 1070, 50, 92)}${windowL(110, 300, 32, 82)}${windowL(640, 860, 32, 82)}
  <g transform="${onR(390, 76)}"><circle r="15" fill="#FAF9F5" stroke="#3A3935" stroke-width="2.5"/><circle r="1.6" fill="#3A3935"/><line id="clock-h" y2="-7" stroke="#3A3935" stroke-width="2" stroke-linecap="round"/><line id="clock-m" y2="-11" stroke="#B5532F" stroke-width="1.5" stroke-linecap="round"/></g>
  ${wallR(1230, 1470, 22, 92, '#141413')}${wallR(1238, 1462, 29, 85, '#232320')}
  <text transform="${onR(1248, 72)}" font-size="12" font-weight="600" letter-spacing="1.2" fill="#E7B38F">TASK BOARD</text>
  <text id="board-line" transform="${onR(1248, 55)}" font-size="11" fill="#D6D4CC">loading…</text>
  ${wallR(1248, 1330, 42, 46, '#8FC79D', 'id="board-bar1"')}${wallR(1248, 1400, 34, 38, '#A8B8E8', 'id="board-bar2"')}
  ${roomsF.map((r, i) => `<use href="#leaddesk" x="${(P(r.x0 + 75, r.y0 + 70)[0] - 25).toFixed(1)}" y="${(P(r.x0 + 75, r.y0 + 70)[1] + 20).toFixed(1)}" class="room-screen" data-room="${i}" style="color:#3A3935"/>${use('plant', r.x0 + 25, r.y0 + 25)}${use('tallplant', r.x1 - 30, r.y0 + 30)}<g class="lead-slot" data-room="${i}" transform="translate(${P(r.x0 + 75, r.y0 + 70)[0].toFixed(1)} ${P(r.x0 + 75, r.y0 + 70)[1].toFixed(1)})"></g>`
    + (r.y1 < D ? glass(r.x0, r.y1, r.x1, r.y1, 62, [0.38, 0.62]) : '') + glass(r.x1, r.y0, r.x1, r.y1, 62, [0.4, 0.6])).join('')}
  ${box(1290, 90, 1390, 160, 34, ['#3D3D3A', '#2B2B29', '#232320'])}${box(1290, 90, 1390, 160, 3, ['#55534D', '#3A3935', '#2B2B29'], 34)}${use('tallplant', 1470, 30)}${use('plant', 1225, 330)}
  <g id="ceo-slot" transform="translate(${P(1340, 60)[0].toFixed(1)} ${P(1340, 60)[1].toFixed(1)})"></g>
  ${glass(1200, 0, 1200, 360, 74, [0.55, 0.8])}${glass(1200, 360, 1500, 360, 74)}
  ${poly('#141413', P(1290, 360, 66), P(1410, 360, 66), P(1410, 360, 50), P(1290, 360, 50))}<text transform="${onR(1302, 54).replace(P(1302, 0, 54)[1].toFixed(1), P(1302, 360, 54)[1].toFixed(1)).replace(P(1302, 0, 54)[0].toFixed(1), P(1302, 360, 54)[0].toFixed(1))}" font-size="10" font-weight="600" letter-spacing="1.5" fill="#D9C27A">CEO OFFICE</text>
  ${box(1230, 395, 1470, 430, 38, ['#CFA47C', '#A9744C', '#8A5E3C'])}${box(1230, 395, 1470, 430, 3, ['#E8D2B6', '#D4B796', '#C9A984'], 38)}
  ${box(1250, 400, 1280, 420, 28, ['#55534D', '#3A3935', '#232320'], 41)}${box(1330, 398, 1400, 425, 16, ['#F3EADB', '#E8DCC6', '#DCCDB3'], 41)}${use('cup', 1430, 412, 41)}
  ${[[1265, 520], [1415, 520], [1340, 600], [1265, 680], [1415, 680]].map(([x, y]) => use('table', x, y) + use('cup', x - 6, y, 24)).join('')}
  <use href="#lamp" ${at(1265, 520)}/><use href="#lamp" ${at(1415, 520)}/><use href="#lamp" ${at(1340, 600)}/>
  ${glass(1200, 760, 1500, 760, 40, [0.4, 0.6])}`;

  const deskSvg = deskOrder.map((i) => `<g class="desk" data-desk="${i}" transform="translate(${desks[i][0].toFixed(1)} ${desks[i][1].toFixed(1)}) scale(1.1)"><use href="#chair" x="22" y="-26"/><g class="seat" transform="translate(20 -30)"></g><use class="desk-top" href="#desk" style="color:#3A3935"/></g>`).join('');
  const front = `${use('plant', 1480, 990)}${use('tallplant', 20, 985)}`;
  const vb = { x: -240, y: -10, w: 2080, h: 1300 };

  window.VScene = {
    desks, deskRoom, rooms, hot, cafe, vb, ceo: P(1340, 60),
    svg: `<svg id="scene" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="The VAgent office: six department rooms, the CEO office, the café and open desks.">${defs}<g id="layer-back">${back}</g><g id="layer-desks">${deskSvg}</g><g id="layer-free"></g>${front}<g id="layer-walk"></g></svg>`,
  };
})();
