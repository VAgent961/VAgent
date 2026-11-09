// Static isometric office (no logic). Floor coords -> screen: X = 600 + 0.8(x - y), Y = 110 + 0.462(x + y).
// Exposes window.VScene = { svg, desks, cafe, rooms }.
(function () {
  const desks = [[488, 443], [600, 507], [712, 572], [824, 637], [936, 701], [360, 517], [472, 581], [584, 646], [696, 711], [808, 775]];
  const cafe = [[1226, 634], [1012, 578], [1100, 566], [1150, 650], [1300, 600], [1190, 536], [1262, 578], [960, 612], [1060, 700]];
  const rooms = [[590, 185], [450, 266], [310, 347], [170, 427]];
  const deskOrder = desks.map((d, i) => i).sort((a, b) => desks[a][1] - desks[b][1]);

  const defs = `<defs>
  <symbol id="desk" overflow="visible"><ellipse cx="0" cy="22" rx="50" ry="14" fill="#141413" opacity="0.07"/><polygon points="-44,-22 0,3 0,25 -44,0" fill="#E6DFCF"/><polygon points="44,-22 0,3 0,25 44,0" fill="#D2C9B5"/><polygon points="0,-47 44,-22 0,3 -44,-22" fill="#F7F3EA" stroke="#CFC8B6"/><polygon points="-14,-34 -6,-30 -6,-26 -14,-30" fill="#3A3935"/><polygon points="-32,-40 -2,-57 -2,-85 -32,-68" fill="#141413"/><polygon class="screen" points="-29,-44 -5,-58 -5,-81 -29,-67" fill="currentColor" opacity="0.9"/><polygon points="-26,-52 -12,-60 -12,-58 -26,-50" fill="#141413" opacity="0.45"/><polygon points="-26,-58 -9,-68 -9,-66 -26,-56" fill="#141413" opacity="0.45"/><polygon points="8,-28 26,-18 18,-13 0,-23" fill="#E8E6DC"/><circle cx="24" cy="-28" r="4" fill="#FAF9F5" stroke="#CFC8B6"/></symbol>
  <symbol id="bot" overflow="visible"><ellipse cx="0" cy="0" rx="14" ry="4.5" fill="#141413" opacity="0.14"/><rect x="-8" y="-9" width="6" height="9" rx="3" fill="#BDB8AA"/><rect x="2" y="-9" width="6" height="9" rx="3" fill="#A9A497"/><ellipse cx="-14" cy="-18" rx="3.5" ry="6.5" fill="#DCD8CC" transform="rotate(12 -14 -18)"/><ellipse cx="14" cy="-18" rx="3.5" ry="6.5" fill="#C8C3B5" transform="rotate(-12 14 -18)"/><rect x="-12" y="-30" width="24" height="23" rx="10" fill="#ECE9E0"/><path d="M2 -30 h0 a10 10 0 0 1 10 10 v3 a10 10 0 0 1 -10 10 z" fill="#D9D5C9"/><rect x="-12" y="-30" width="24" height="5" rx="2.5" fill="currentColor"/><circle cx="-5" cy="-17" r="2.4" fill="currentColor"/><line x1="0" y1="-56" x2="0" y2="-63" stroke="#8A8880" stroke-width="2" stroke-linecap="round"/><circle cx="0" cy="-65" r="5" fill="currentColor" opacity="0.25"/><circle cx="0" cy="-65" r="3" fill="currentColor"/><circle cx="-16" cy="-44" r="3.6" fill="currentColor"/><circle cx="16" cy="-44" r="3.6" fill="currentColor"/><rect x="-16" y="-57" width="32" height="26" rx="11" fill="#F7F5EE"/><path d="M4 -57 h1 a11 11 0 0 1 11 11 v4 a11 11 0 0 1 -11 11 h-1 z" fill="#E4E0D5"/><rect x="-12" y="-52" width="24" height="16" rx="7" fill="#1E1E1C"/><rect x="-8" y="-48" width="4.5" height="8" rx="2.25" fill="currentColor"/><rect x="3.5" y="-48" width="4.5" height="8" rx="2.25" fill="currentColor"/><circle cx="-6.5" cy="-46.5" r="1" fill="#fff"/><circle cx="4.8" cy="-46.5" r="1" fill="#fff"/><ellipse cx="-10" cy="-39.5" rx="2.2" ry="1.2" fill="#E7B38F" opacity="0.7"/><ellipse cx="10" cy="-39.5" rx="2.2" ry="1.2" fill="#E7B38F" opacity="0.7"/></symbol>
  <symbol id="lead" overflow="visible"><ellipse cx="0" cy="0" rx="22" ry="6.5" fill="#141413" opacity="0.14"/><ellipse cx="-9" cy="-1" rx="6" ry="3.5" fill="#8F3F22"/><ellipse cx="9" cy="-1" rx="6" ry="3.5" fill="#8F3F22"/><path d="M-20 -2 C-20 -30 -11 -48 0 -48 C11 -48 20 -30 20 -2 Q0 4 -20 -2 Z" fill="#B5532F"/><path d="M6 -47 C15 -42 20 -28 20 -2 Q12 1 4 1 C10 -14 11 -32 6 -47 Z" fill="#9C4527"/><ellipse cx="-9" cy="-36" rx="4" ry="7" fill="#D27A57" opacity="0.6" transform="rotate(20 -9 -36)"/><ellipse cx="-21" cy="-16" rx="4" ry="7" fill="#A84B2B" transform="rotate(20 -21 -16)"/><ellipse cx="21" cy="-16" rx="4" ry="7" fill="#8F3F22" transform="rotate(-20 21 -16)"/><circle cx="-6" cy="-28" r="4.5" fill="#FAF9F5"/><circle cx="-5" cy="-27.5" r="2.4" fill="#141413"/><circle cx="7" cy="-28" r="4.5" fill="#FAF9F5"/><circle cx="8" cy="-27.5" r="2.4" fill="#141413"/><ellipse cx="-11" cy="-21" rx="3" ry="1.6" fill="#E59A7A" opacity="0.8"/><ellipse cx="12" cy="-21" rx="3" ry="1.6" fill="#E59A7A" opacity="0.8"/><path d="M-3 -20 Q1.5 -16 6 -20" fill="none" stroke="#141413" stroke-width="1.8" stroke-linecap="round"/><path d="M-16 -31 C-16 -53 16 -53 16 -31" fill="none" stroke="#1E1E1C" stroke-width="2.6"/><rect x="-19.5" y="-35" width="6" height="10" rx="3" fill="#1E1E1C"/><rect x="13.5" y="-35" width="6" height="10" rx="3" fill="#1E1E1C"/><path d="M-5 -11 L0 -6 L5 -11 L0 -13 Z" fill="currentColor"/><circle cx="0" cy="-13" r="2.6" fill="currentColor"/></symbol>
  <symbol id="leaddesk" overflow="visible"><polygon points="-30,-15 0,2 0,16 -30,-1" fill="#E6DFCF"/><polygon points="30,-15 0,2 0,16 30,-1" fill="#D2C9B5"/><polygon points="0,-32 30,-15 0,2 -30,-15" fill="#F7F3EA" stroke="#CFC8B6"/><polygon points="-20,-27 0,-38 0,-56 -20,-45" fill="#141413"/><polygon points="-18,-30 -2,-39 -2,-53 -18,-44" fill="currentColor" opacity="0.85"/></symbol>
  <symbol id="table" overflow="visible"><ellipse cx="0" cy="2" rx="26" ry="9" fill="#141413" opacity="0.08"/><ellipse cx="0" cy="0" rx="12" ry="5" fill="#8A6446"/><rect x="-2" y="-22" width="4" height="22" fill="#8A6446"/><ellipse cx="0" cy="-22" rx="26" ry="12" fill="#B98B64"/><ellipse cx="0" cy="-24" rx="26" ry="12" fill="#CFA47C"/></symbol>
  <symbol id="stool" overflow="visible"><rect x="-1.5" y="-14" width="3" height="14" fill="#8A6446"/><ellipse cx="0" cy="-14" rx="9" ry="4.5" fill="#3D3D3A"/></symbol>
  <symbol id="cup" overflow="visible"><rect x="-4" y="-9" width="8" height="9" rx="2" fill="#FAF9F5"/><path d="M4 -7 q4 0 4 3 q0 3 -4 3" fill="none" stroke="#FAF9F5" stroke-width="1.6"/></symbol>
  <symbol id="plant" overflow="visible"><ellipse cx="0" cy="0" rx="12" ry="4" fill="#141413" opacity="0.1"/><circle cx="-8" cy="-22" r="9" fill="#6E9668"/><circle cx="8" cy="-24" r="9" fill="#5B7F57"/><circle cx="0" cy="-32" r="11" fill="#6E9668"/><polygon points="-10,-14 10,-14 7,0 -7,0" fill="#B5532F"/></symbol>
  <symbol id="lamp" overflow="visible"><line x1="0" y1="-120" x2="0" y2="-30" stroke="#55534D" stroke-width="1.2"/><path d="M-12 -18 L-7 -30 L7 -30 L12 -18 Z" fill="#141413"/><ellipse cx="0" cy="-17" rx="12" ry="3" fill="#F2C98F"/></symbol>
  </defs>`;

  const back = `
  <polygon points="600,128 1400,590 840,913 40,451" fill="#141413" opacity="0.07"/>
  <polygon points="600,110 1400,572 1400,472 600,10" fill="#E9E4D8"/><polygon points="600,110 40,433 40,333 600,10" fill="#DCD5C4"/>
  <polygon points="600,110 1400,572 1400,562 600,100" fill="#D2C9B5"/><polygon points="600,110 40,433 40,423 600,100" fill="#C9C0AC"/>
  <polyline points="40,333 600,10 1400,472" fill="none" stroke="#CFC8B6" stroke-width="2"/>
  <g transform="matrix(0.8 0.462 -0.8 0.462 600 110)">
    <rect width="1000" height="700" fill="#F2EEE4"/>
    <rect width="150" height="175" fill="#EDE6D6"/><rect y="175" width="150" height="175" fill="#E8E1D1"/><rect y="350" width="150" height="175" fill="#EDE6D6"/><rect y="525" width="150" height="175" fill="#E8E1D1"/>
    <rect x="700" width="300" height="330" fill="#E2C9AD"/>
    <path d="M700 33H1000M700 66H1000M700 99H1000M700 132H1000M700 165H1000M700 198H1000M700 231H1000M700 264H1000M700 297H1000" stroke="#D4B796" stroke-width="2"/>
    <ellipse cx="850" cy="230" rx="120" ry="80" fill="#C9714F" opacity="0.18"/>
    <rect x="240" y="370" width="760" height="320" rx="24" fill="#E7E1D2"/>
    <rect x="252" y="382" width="736" height="296" rx="18" fill="none" stroke="#DCD4C1" stroke-width="2" stroke-dasharray="10 10"/>
    <rect width="1000" height="700" fill="none" stroke="#D8D1BF" stroke-width="2"/>
  </g>
  <polygon points="1024,325 1128,385 1128,335 1024,275" fill="#CFE0E4"/><polygon points="568,98 488,145 488,95 568,48" fill="#CFE0E4"/><polygon points="360,219 280,265 280,215 360,169" fill="#CFE0E4"/>
  <polygon points="800,204 984,310 984,240 800,134" fill="#141413"/><polygon points="807,197 977,302 977,247 807,148" fill="#232320"/>
  <text transform="matrix(0.866 0.5 0 1 820 170)" font-size="11" font-weight="600" letter-spacing="1.2" fill="#E7B38F">TASK BOARD</text>
  <text id="board-line" transform="matrix(0.866 0.5 0 1 820 188)" font-size="10" fill="#D6D4CC">loading…</text>
  <polygon id="board-bar1" points="820,200 884,237 884,241 820,204" fill="#8FC79D"/><polygon id="board-bar2" points="820,212 914,266 914,270 820,216" fill="#A8B8E8"/>
  <polygon points="1208,416 1304,472 1304,442 1208,386" fill="#B5532F"/>
  <text transform="matrix(0.866 0.5 0 1 1230 417)" font-family="Newsreader, Georgia, serif" font-size="20" fill="#FAF9F5">Café</text>
  <use href="#lamp" x="1150" y="540"/><use href="#lamp" x="1250" y="600"/>
  <polygon points="1136,475 1328,586 1328,546 1136,435" fill="#A9744C"/><polygon points="1328,586 1364,565 1364,525 1328,546" fill="#8A5E3C"/><polygon points="1172,414 1364,525 1328,546 1136,435" fill="#CFA47C"/>
  <polygon points="1195,420 1215,432 1215,404 1195,392" fill="#3A3935"/><polygon points="1215,432 1226,426 1226,398 1215,404" fill="#232320"/><polygon points="1195,392 1215,404 1226,398 1206,386" fill="#55534D"/>
  <use href="#cup" x="1270" y="497"/><use href="#cup" x="1300" y="514"/>
  <use href="#stool" x="1160" y="500"/><use href="#stool" x="1215" y="532"/><use href="#stool" x="1270" y="564"/>
  <use href="#plant" x="728" y="202"/>
  ${rooms.map((r, i) => `<use href="#leaddesk" x="${r[0] - 25}" y="${r[1] + 20}" class="room-screen" data-room="${i}" style="color:#3A3935"/><g class="lead-slot" data-room="${i}" transform="translate(${r[0]} ${r[1]})"></g>`
    + ['<polygon points="460,191 580,260 580,190 460,121" fill="#CFE3E8" opacity="0.35" stroke="#B9CFD5"/>', '<polygon points="320,272 440,341 440,271 320,202" fill="#CFE3E8" opacity="0.35" stroke="#B9CFD5"/>', '<polygon points="180,353 300,422 300,352 180,283" fill="#CFE3E8" opacity="0.35" stroke="#B9CFD5"/>', ''][i]).join('')}
  <polygon points="720,179 160,503 160,433 720,109" fill="#CFE3E8" opacity="0.28" stroke="#B9CFD5"/><polyline points="720,109 160,433" fill="none" stroke="#A9C3CA" stroke-width="2"/>
  <ellipse cx="816" cy="418" rx="80" ry="36" fill="#141413" opacity="0.07"/><ellipse cx="816" cy="405" rx="76" ry="34" fill="#D2C9B5"/><ellipse cx="816" cy="400" rx="76" ry="34" fill="#F7F3EA" stroke="#CFC8B6"/>
  <use href="#stool" x="752" y="398"/><use href="#stool" x="880" y="398"/>
  <use href="#table" x="1048" y="554"/><use href="#cup" x="1042" y="532"/><use href="#table" x="1184" y="604"/><use href="#cup" x="1190" y="582"/><use href="#table" x="1060" y="648"/>
  <use href="#stool" x="1012" y="560"/><use href="#stool" x="1150" y="616"/><use href="#stool" x="1095" y="662"/>`;

  const deskSvg = deskOrder.map((i) => `<g class="desk" data-desk="${i}" transform="translate(${desks[i][0]} ${desks[i][1]}) scale(1.1)"><g class="seat" transform="translate(20 -30)"></g><use href="#desk" style="color:#3A3935"/></g>`).join('');
  const front = `<use href="#plant" x="540" y="736"/><use href="#plant" x="1124" y="722"/><use href="#plant" x="176" y="503"/><use href="#plant" x="1360" y="580"/>`;

  window.VScene = {
    desks, cafe, rooms,
    svg: `<svg id="scene" viewBox="20 0 1400 915" preserveAspectRatio="xMidYMid meet" role="img" aria-label="The VAgent office. Agents work at desks or rest in the café.">${defs}<g id="layer-back">${back}</g><g id="layer-desks">${deskSvg}</g><g id="layer-free"></g>${front}<g id="layer-walk"></g></svg>`,
  };
})();
