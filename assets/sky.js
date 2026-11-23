/* VSky — the real sky over Beirut. Sun + moon position from astronomy (no libs), weather from Open-Meteo (cached 12 min, solar-only fallback).
   Paints a sky layer behind the office/city (#sky, z -1), an ambient tint above it (#sky-tint) and the top-bar pill (#sky-pill).
   Dev/test: office.html?sky=2026-06-21T05:40:00%2B03:00&code=61&cloud=80&temp=18  or  VSky.simulate({time:'…', code:61, cloud:80, temp:18}). */
(function () {
  'use strict';
  const LAT = 33.8938, LON = 35.5018, TZ = 'Asia/Beirut';
  const URL_WX = 'https://api.open-meteo.com/v1/forecast?latitude=33.8938&longitude=35.5018&current=temperature_2m,weather_code,cloud_cover,is_day&daily=sunrise,sunset&timezone=Asia%2FBeirut';
  const TTL = 12 * 60 * 1000, KEY = 'vsky-wx-v1';
  const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI, norm = (d) => ((d % 360) + 360) % 360;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // ── astronomy ────────────────────────────────────────────────────────────────
  const jdOf = (t) => t / 86400000 + 2440587.5;
  function horiz(ha, dec, lat) { // ha, dec, lat in radians → {alt, az} in degrees (az from north, clockwise)
    const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
    let alt = deg(Math.asin(clamp(sinAlt, -1, 1)));
    if (alt > -1) alt += 0.0167 / Math.tan(rad(alt + 7.31 / (alt + 4.4))); // refraction
    const az = norm(deg(Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat))) + 180);
    return { alt, az };
  }
  function sun(t, lat = LAT, lon = LON) { // NOAA solar position
    const jd = jdOf(t), T = (jd - 2451545) / 36525;
    const L0 = norm(280.46646 + T * (36000.76983 + T * 0.0003032));
    const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
    const om = 125.04 - 1934.136 * T, lam = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(om));
    const eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(rad(om));
    const dec = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lam)));
    const y = Math.tan(rad(eps / 2)) ** 2;
    const eq = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
    const d = new Date(t), utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
    const tst = ((utcMin + eq + 4 * lon) % 1440 + 1440) % 1440, ha = rad(tst / 4 - 180);
    const h = horiz(ha, dec, rad(lat));
    return { alt: h.alt, az: h.az, lam: norm(lam), dec: deg(dec) };
  }
  function moon(t, sn, lat = LAT, lon = LON) { // low-precision lunar position (Schlyter) + phase
    const jd = jdOf(t), d = jd - 2451543.5;
    const N = norm(125.1228 - 0.0529538083 * d), i = 5.1454, w = norm(318.0634 + 0.1643573223 * d), a = 60.2666, e = 0.0549, M = norm(115.3654 + 13.0649929509 * d);
    let E = M + deg(e * Math.sin(rad(M)) * (1 + e * Math.cos(rad(M))));
    for (let k = 0; k < 3; k++) E = E - (E - deg(e * Math.sin(rad(E))) - M) / (1 - e * Math.cos(rad(E)));
    const xv = a * (Math.cos(rad(E)) - e), yv = a * Math.sqrt(1 - e * e) * Math.sin(rad(E));
    const v = deg(Math.atan2(yv, xv)), r = Math.hypot(xv, yv);
    const xh = r * (Math.cos(rad(N)) * Math.cos(rad(v + w)) - Math.sin(rad(N)) * Math.sin(rad(v + w)) * Math.cos(rad(i)));
    const yh = r * (Math.sin(rad(N)) * Math.cos(rad(v + w)) + Math.cos(rad(N)) * Math.sin(rad(v + w)) * Math.cos(rad(i)));
    const zh = r * Math.sin(rad(v + w)) * Math.sin(rad(i));
    let lon_ = deg(Math.atan2(yh, xh)); const lat_ = deg(Math.atan2(zh, Math.hypot(xh, yh)));
    const Ms = norm(356.047 + 0.9856002585 * d), Ls = norm(282.9404 + 4.70935e-5 * d + Ms), Lm = norm(N + w + M), D = Lm - Ls, F = Lm - N, s = (x) => Math.sin(rad(x));
    lon_ += -1.274 * s(M - 2 * D) + 0.658 * s(2 * D) - 0.186 * s(Ms) - 0.059 * s(2 * M - 2 * D) - 0.057 * s(M - 2 * D + Ms) + 0.053 * s(M + 2 * D) + 0.046 * s(2 * D - Ms) + 0.041 * s(M - Ms) - 0.035 * s(D) - 0.031 * s(M + Ms) - 0.015 * s(2 * F - 2 * D) + 0.011 * s(M - 4 * D);
    const ecl = rad(23.4393 - 3.563e-7 * d), cl = Math.cos(rad(lat_)), x = cl * Math.cos(rad(lon_)), y = cl * Math.sin(rad(lon_)), z = Math.sin(rad(lat_));
    const ye = y * Math.cos(ecl) - z * Math.sin(ecl), ze = y * Math.sin(ecl) + z * Math.cos(ecl);
    const ra = Math.atan2(ye, x), dec = Math.atan2(ze, Math.hypot(x, ye));
    const lst = rad(norm(280.46061837 + 360.98564736629 * (jd - 2451545) + lon));
    const h = horiz(lst - ra, dec, rad(lat));
    const el = rad(norm(lon_ - sn.lam)); // elongation
    return { alt: h.alt, az: h.az, frac: (1 - Math.cos(el)) / 2, waxing: Math.sin(el) > 0 };
  }

  // Phase of the day from the sun's altitude and side of the sky.
  function phaseOf(sn) {
    const rising = sn.az < 180, a = sn.alt;
    if (a >= 8) return { id: 'day', label: 'Day', warm: 0 };
    if (a >= -0.83) return rising ? { id: 'sunrise', label: 'Sunrise', warm: 1 } : { id: 'sunset', label: 'Sunset', warm: 1 };
    if (a >= -12) return rising ? { id: 'dawn', label: 'Dawn', warm: 0.6 } : { id: 'dusk', label: 'Dusk', warm: 0.6 };
    return { id: 'night', label: 'Night', warm: 0 };
  }

  // ── weather ──────────────────────────────────────────────────────────────────
  const wxInfo = (code, cloud) => {
    if (code >= 95) return { k: 'storm', label: 'Storm' };
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { k: 'rain', label: code >= 61 || code >= 80 ? 'Rain' : 'Drizzle' };
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { k: 'snow', label: 'Snow' };
    if (code === 45 || code === 48) return { k: 'fog', label: 'Fog' };
    if (code === 3 || cloud >= 85) return { k: 'cloud', label: 'Cloudy' };
    if (code === 2 || cloud >= 40) return { k: 'part', label: 'Partly cloudy' };
    if (code === 1 || cloud >= 15) return { k: 'clear', label: 'Mostly clear' };
    return { k: 'clear', label: 'Clear' };
  };
  const readCache = () => { try { const c = JSON.parse(localStorage.getItem(KEY)); return c && Date.now() - c.at < TTL ? c : null; } catch (e) { return null; } };
  const state = { wx: null, sim: null, sunTimes: null };
  async function loadWeather(force) {
    const c = !force && readCache(); if (c) { state.wx = c.wx; state.sunTimes = c.times; return; }
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(URL_WX, { signal: ctl.signal, cache: 'no-store' }); clearTimeout(to);
      if (!r.ok) throw new Error('wx ' + r.status);
      const j = await r.json(), cur = j.current || {};
      const wx = { temp: Math.round(cur.temperature_2m), code: cur.weather_code, cloud: cur.cloud_cover, isDay: cur.is_day };
      const times = j.daily ? { rise: (j.daily.sunrise || [])[0], set: (j.daily.sunset || [])[0] } : null;
      state.wx = wx; state.sunTimes = times;
      try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), wx, times })); } catch (e) { /* private mode */ }
    } catch (e) { const old = (() => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (x) { return null; } })(); if (old && !state.wx) { state.wx = old.wx; state.sunTimes = old.times; } /* else solar only */ }
  }

  // ── colour helpers ───────────────────────────────────────────────────────────
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const css = (c, al) => al == null ? 'rgb(' + c.map(Math.round).join(',') + ')' : 'rgba(' + c.map(Math.round).join(',') + ',' + al + ')';
  const grey = (c) => { const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return [l, l, l]; };
  const KEYS = [ // [sun altitude, zenith, horizon]
    [-18, '#04060c', '#0a0e1c'], [-10, '#0a1030', '#1a2044'], [-4, '#16204c', '#2c3566'], [0, '#26376e', '#3c4e86'],
    [6, '#3f6aac', '#8fb1d8'], [15, '#4382c6', '#9cc4e6'], [35, '#3a7bd0', '#8cbde8'], [70, '#2f6fcb', '#7db4e6']
  ].map((k) => [k[0], hex(k[1]), hex(k[2])]);
  const WARM_UP = hex('#f0a24a'), WARM_DN = hex('#d4552e'); // golden-amber sunrise, copper-crimson sunset
  function skyColors(sn, ph, wx) {
    const a = clamp(sn.alt, -18, 70); let i = 0; while (i < KEYS.length - 2 && a > KEYS[i + 1][0]) i++;
    const k0 = KEYS[i], k1 = KEYS[i + 1], t = clamp((a - k0[0]) / (k1[0] - k0[0]), 0, 1);
    let top = mix(k0[1], k1[1], t), hor = mix(k0[2], k1[2], t);
    const rising = sn.az < 180, bell = clamp(1 - Math.abs(sn.alt - 0.5) / 13, 0, 1) * clamp((sn.alt + 11) / 8, 0, 1);
    hor = mix(hor, rising ? WARM_UP : WARM_DN, bell * 0.9); top = mix(top, rising ? [88, 70, 110] : [96, 50, 90], bell * 0.28);
    if (wx) { const c = wx.cloud / 100, wet = wx.k === 'rain' ? 0.3 : wx.k === 'storm' ? 0.5 : wx.k === 'snow' ? 0.2 : 0; const g = clamp(c * 0.55 + wet, 0, 0.85);
      top = mix(top, grey(top), g); hor = mix(hor, grey(hor), g * 0.8); if (wet) { top = mix(top, [10, 12, 18], wet * 0.5); hor = mix(hor, [24, 28, 36], wet * 0.4); } }
    return { top, hor };
  }

  // ── DOM ──────────────────────────────────────────────────────────────────────
  const $ = (s) => document.querySelector(s);
  let sky, tint, built = false, cloudKey = '';
  const ICON = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    part: '<path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9.5a3.8 3.8 0 0 1 0 7.5H7z"/><path d="M5.2 6.2 4 5M9 3.5V2M2.5 10H1"/>',
    cloud: '<path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9.5a3.8 3.8 0 0 1 0 7.5H7z"/>',
    rain: '<path d="M7 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 6.5a3.8 3.8 0 0 1 0 7.5"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
    storm: '<path d="M7 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 6.5a3.8 3.8 0 0 1 0 7.5"/><path d="M12.5 13l-3 4.5h3l-1.5 4"/>',
    snow: '<path d="M7 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 6.5a3.8 3.8 0 0 1 0 7.5"/><path d="M8 18h.01M12 20h.01M16 18h.01"/>',
    fog: '<path d="M4 9h16M3 13h18M6 17h12"/>',
    sunrise: '<path d="M12 4v4M5.6 9.6l1.4 1.4M18.4 9.6 17 11M2 17h20M7 17a5 5 0 0 1 10 0M9 21h6"/>'
  };
  const icon = (n) => '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[n] || ICON.sun) + '</svg>';

  function build() {
    const stage = $('#stage'); if (!stage) return false;
    if (!sky) {
      sky = document.createElement('div'); sky.id = 'sky'; sky.setAttribute('aria-hidden', 'true');
      sky.innerHTML = '<div class="sk-glow"></div><div class="sk-stars"></div><div class="sk-sun"></div><svg class="sk-moon" viewBox="-16 -16 32 32"><circle r="14" fill="#1b2236" opacity=".9"/><path class="mp" fill="#EDEBE0"/></svg><div class="sk-clouds"></div><div class="sk-rain"></div><div class="sk-rain r2"></div><div class="sk-flash"></div>';
      tint = document.createElement('div'); tint.id = 'sky-tint'; tint.setAttribute('aria-hidden', 'true');
    }
    if (sky.parentNode !== stage) stage.prepend(sky);
    if (tint.parentNode !== stage) stage.append(tint);
    if (!built) { built = true; new MutationObserver(() => { if (sky.parentNode !== stage) stage.prepend(sky); if (tint.parentNode !== stage || tint.nextSibling) stage.append(tint); }).observe(stage, { childList: true }); }
    return true;
  }
  function moonPath(frac, waxing) { // lit part of the disc, radius 14
    const r = 14, k = Math.abs(1 - 2 * frac) * r, lit = frac > 0.5;
    if (frac < 0.02) return ''; if (frac > 0.98) return 'M0,-14A14,14 0 1,1 0,14A14,14 0 1,1 0,-14Z';
    const limb = waxing ? 1 : 0; // waxing → lit on the right
    return 'M0,-14A14,14 0 0,' + limb + ' 0,14A' + k + ',14 0 0,' + (lit ? limb : 1 - limb) + ' 0,-14Z';
  }
  function drawClouds(n, ph, wx) {
    const key = n + ph.id; if (key === cloudKey) return; cloudKey = key;
    const box = sky.querySelector('.sk-clouds'); let h = '';
    for (let i = 0; i < n; i++) { const r = (x) => { const s = Math.sin(i * 91.7 + x * 12.9) * 43758.5453; return s - Math.floor(s); };
      h += '<i style="left:' + (r(1) * 90 - 10).toFixed(1) + '%;top:' + (4 + r(2) * 30).toFixed(1) + '%;width:' + Math.round(180 + r(3) * 220) + 'px;height:' + Math.round(54 + r(4) * 46) + 'px;--dur:' + Math.round(140 + r(5) * 160) + 's;--dx:' + Math.round(120 + r(6) * 200) + 'px;animation-delay:-' + Math.round(r(7) * 200) + 's"></i>'; }
    box.innerHTML = h;
  }

  function current() {
    if (state.sim) return state.sim;
    return { t: Date.now(), wx: state.wx };
  }
  function render() {
    if (!build()) return;
    const cur = current(), t = cur.t, sn = sun(t), mn = moon(t, sn), ph = phaseOf(sn);
    const w = cur.wx ? Object.assign({}, cur.wx, wxInfo(cur.wx.code, cur.wx.cloud)) : null;
    const cloud = w ? clamp(w.cloud / 100, 0, 1) : 0, wet = w && (w.k === 'rain' || w.k === 'storm');
    const col = skyColors(sn, ph, w), dark = clamp((-sn.alt - 2) / 10, 0, 1);
    sky.style.background = 'linear-gradient(' + css(col.top) + ' 0%,' + css(mix(col.top, col.hor, 0.8)) + ' 24%,' + css(col.hor) + ' 42%,' + css(mix(col.hor, [11, 13, 18], 0.8)) + ' 100%)';
    const pos = (az, alt) => ({ x: clamp(50 + (az - 180) * 0.5, 3, 97), y: clamp(38 - Math.max(alt, -4) / 90 * 32, 5, 42) });
    const sp = pos(sn.az, sn.alt), mp = pos(mn.az, mn.alt);
    const sunEl = sky.querySelector('.sk-sun'), glow = sky.querySelector('.sk-glow'), moonEl = sky.querySelector('.sk-moon'), stars = sky.querySelector('.sk-stars');
    const sunVis = clamp((sn.alt + 3) / 4, 0, 1) * (1 - 0.82 * cloud) * (wet ? 0.3 : 1);
    const lowSun = clamp(1 - sn.alt / 14, 0, 1), sz = 34 + lowSun * 22;
    sunEl.style.cssText = 'left:' + sp.x + '%;top:' + sp.y + '%;width:' + sz + 'px;height:' + sz + 'px;opacity:' + sunVis.toFixed(2) + ';background:radial-gradient(circle,' + css(mix([255, 250, 225], [255, 150, 70], lowSun)) + ' 0 55%,' + css(mix([255, 235, 170], [255, 120, 50], lowSun), 0.0) + ' 72%);box-shadow:0 0 ' + Math.round(40 + lowSun * 60) + 'px ' + Math.round(14 + lowSun * 26) + 'px ' + css(mix([255, 230, 160], [255, 120, 50], lowSun), 0.45 * (1 - 0.6 * cloud)) + '';
    const gl = ph.warm ? (ph.warm * (1 - 0.6 * cloud)) : 0;
    glow.style.cssText = 'left:' + sp.x + '%;top:' + Math.min(sp.y + 3, 44) + '%;opacity:' + gl.toFixed(2) + ';background:radial-gradient(ellipse at center,' + css(sn.az < 180 ? WARM_UP : WARM_DN, 0.75) + ' 0,' + css(sn.az < 180 ? WARM_UP : WARM_DN, 0) + ' 68%)';
    const mVis = clamp((mn.alt + 2) / 5, 0, 1) * (0.28 + 0.72 * dark) * (1 - 0.78 * cloud) * (wet ? 0.35 : 1);
    moonEl.style.cssText = 'left:' + mp.x + '%;top:' + mp.y + '%;opacity:' + mVis.toFixed(2);
    moonEl.querySelector('.mp').setAttribute('d', moonPath(mn.frac, mn.waxing));
    stars.style.opacity = (clamp((-sn.alt - 3) / 11, 0, 1) * (1 - 0.92 * cloud) * (wet ? 0.1 : 1)).toFixed(2);
    // clouds
    const nCl = w ? Math.round(cloud * 8) + (w.k === 'cloud' || wet ? 2 : 0) : 0; drawClouds(nCl, ph, w);
    const cc = sn.alt > 8 ? [255, 255, 255, wet ? 0.28 : 0.5] : ph.id === 'sunrise' ? [255, 190, 130, 0.5] : ph.id === 'sunset' ? [255, 140, 100, 0.5] : ph.id === 'dawn' || ph.id === 'dusk' ? [150, 120, 160, 0.42] : [70, 82, 118, 0.5];
    sky.style.setProperty('--cl', css(cc.slice(0, 3), cc[3])); sky.style.setProperty('--cl0', css(cc.slice(0, 3), 0));
    if (wet) sky.style.setProperty('--cl', css(mix(cc.slice(0, 3), [40, 46, 58], 0.55), 0.6));
    const rain = sky.querySelectorAll('.sk-rain'); rain.forEach((e) => { e.style.opacity = w && wet ? (w.k === 'storm' ? 0.85 : 0.55) : 0; });
    sky.dataset.storm = w && w.k === 'storm' ? '1' : '0';
    // ambient tint over the scene
    const tintC = ph.id === 'night' ? [6, 10, 42, 0.34] : ph.id === 'dusk' || ph.id === 'dawn' ? [70, 44, 110, 0.2] : ph.id === 'sunrise' ? [255, 160, 70, 0.1] : ph.id === 'sunset' ? [215, 75, 40, 0.14] : [30, 40, 60, 0.0];
    const extra = w ? (w.k === 'storm' ? 0.26 : wet ? 0.17 : cloud * 0.1) : 0;
    tint.style.background = css(mix(tintC.slice(0, 3), [30, 38, 54], extra > 0 && tintC[3] < 0.1 ? 0.8 : 0), Math.min(0.6, tintC[3] + extra));
    // hooks for CSS
    const root = document.documentElement; root.dataset.phase = ph.id; root.dataset.wx = w ? w.k : 'none'; root.style.setProperty('--lit', ph.id === 'night' || ph.id === 'dusk' ? '1' : '0');
    const pill = $('#sky-pill'); if (pill) paintPill(pill, t, sn, ph, w, mn);
    state.last = { sun: sn, moon: mn, phase: ph.id, weather: w, sky: col };
  }
  const fmtT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  function paintPill(pill, t, sn, ph, w, mn) {
    const night = sn.alt < -0.83, ic = w ? (w.k === 'clear' || w.k === 'part' ? (night ? (w.k === 'part' ? 'part' : 'moon') : w.k === 'clear' ? (ph.id === 'sunrise' || ph.id === 'sunset' ? 'sunrise' : 'sun') : 'part') : w.k) : (night ? 'moon' : ph.id === 'sunrise' || ph.id === 'sunset' ? 'sunrise' : 'sun');
    const time = fmtT.format(t), tip = ['Beirut ' + time + ' (Asia/Beirut)', 'Sun ' + sn.alt.toFixed(1) + '° up, azimuth ' + Math.round(sn.az) + '°', night ? 'Moon ' + Math.round(mn.frac * 100) + '% lit' : ''];
    if (state.sunTimes && state.sunTimes.rise) tip.push('Sunrise ' + String(state.sunTimes.rise).slice(11, 16) + ' · Sunset ' + String(state.sunTimes.set).slice(11, 16));
    tip.push(w ? 'Live weather: Open-Meteo' : 'Weather unavailable, showing the sun only');
    pill.title = tip.filter(Boolean).join('\n'); pill.dataset.phase = ph.id;
    pill.innerHTML = icon(ic) + '<span class="sp-city">Beirut<i>·</i></span><span class="sp-time">' + time + '</span>' + (w ? '<i>·</i><span class="sp-temp">' + w.temp + '°C</span><span class="sp-wx">' + w.label + '</span>' : '') + '<span class="sp-ph">' + ph.label + '</span>';
  }

  function simulate(o) {
    if (!o) { state.sim = null; return render(); }
    const t = o.time ? new Date(String(o.time).replace(' ', '+')).getTime() : Date.now();
    state.sim = { t, wx: o.code == null && o.cloud == null ? null : { temp: o.temp == null ? 20 : +o.temp, code: +o.code || 0, cloud: +o.cloud || 0, isDay: 1 } };
    state.simWx = true; render(); return state.last;
  }

  function init() {
    const q = new URLSearchParams(location.search);
    if (q.get('sky')) simulate({ time: q.get('sky'), code: q.get('code'), cloud: q.get('cloud'), temp: q.get('temp') });
    render(); loadWeather().then(render);
    setInterval(render, 30000);
    setInterval(() => loadWeather(true).then(render), TTL);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadWeather().then(render); });
    // office.js builds the stage after load: retry until it exists
    let n = 0; const iv = setInterval(() => { if (build()) { render(); } if (++n > 40) clearInterval(iv); }, 500);
  }
  window.VSky = { sun, moon, phaseOf, wxInfo, simulate, state, render, loadWeather };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
