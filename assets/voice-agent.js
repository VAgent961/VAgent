// Voice Receptionist panel. VoiceAgent.mount(element, businessId): one click starts a continuous call; each turn ends after 1 s of silence.
// mic (MediaRecorder + Web Audio silence detector) -> POST /api/voice (audio + history) -> reply spoken by /api/tts (Groq Orpheus), browser voice as fallback.
(function () {
  const MAX_HISTORY = 12;
  const MIN_MS = 500;
  const BARS = 36;   // radial level bars around the public call button
  let stopPrev = null;

  function pickMime() {
    const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return (window.MediaRecorder && c.find((m) => MediaRecorder.isTypeSupported(m))) || '';
  }

  // Voice: server TTS (/api/tts, Groq Orpheus, <=200 chars per call so long replies are split by sentence) played with one shared
  // Audio element; if the server voice is not available it falls back to the browser's own voice.
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  const player = new Audio();
  let token = 0;
  let voiceUrl = '/api/voice', ttsUrl = '/api/tts'; // public mode (call.html) uses the open, rate-limited /api/public-* endpoints
  function prime() { try { player.src = SILENT; player.play().catch(() => {}); } catch (e) {} } // unlocks audio on Safari (runs inside the button press)
  function stopSpeech() { token++; try { player.pause(); } catch (e) {} if (window.speechSynthesis) speechSynthesis.cancel(); }
  function chunks(text) {
    const out = []; let cur = '';
    for (const p of (text.match(/[^.!?\u061F\n]+[.!?\u061F]*/g) || [text]).map((x) => x.trim()).filter(Boolean)) {
      if ((cur + ' ' + p).trim().length <= 190) cur = (cur + ' ' + p).trim(); else { if (cur) out.push(cur); cur = p.slice(0, 190); }
    }
    if (cur) out.push(cur);
    return out;
  }
  async function fetchAudio(text) {
    const r = await fetch(ttsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), credentials: 'same-origin' });
    if (!r.ok) throw new Error('tts ' + r.status);
    return URL.createObjectURL(await r.blob());
  }
  function playUrl(url) {
    return new Promise((resolve, reject) => {
      player.onended = () => { URL.revokeObjectURL(url); resolve(); };
      player.onerror = () => { URL.revokeObjectURL(url); reject(new Error('play')); };
      player.src = url; player.play().catch(reject);
    });
  }
  function browserSpeak(text, onEnd) {
    const ss = window.speechSynthesis;
    if (!ss) { onEnd && onEnd(); return; }
    ss.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const ar = /[\u0600-\u06FF]/.test(text);
    u.lang = ar ? 'ar-SA' : 'en-US';
    const v = ss.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(ar ? 'ar' : 'en'));
    if (v) u.voice = v;
    u.onend = u.onerror = () => onEnd && onEnd();
    ss.speak(u);
  }
  // onStart(ok) fires right before the first sound, so the caller can show the text at the very same moment.
  async function speak(text, onEnd, onStart) {
    stopSpeech();
    const my = token, parts = chunks(text);
    let started = false;
    const go = (ok) => { if (!started) { started = true; onStart && onStart(ok); } };
    try {
      let next = fetchAudio(parts[0]);
      for (let i = 0; i < parts.length; i++) {
        const url = await next;
        if (my !== token) { URL.revokeObjectURL(url); go(false); return; }
        if (i + 1 < parts.length) next = fetchAudio(parts[i + 1]);
        go(true);
        await playUrl(url);
        if (my !== token) return;
      }
      onEnd && onEnd();
    } catch (e) { if (my === token) { go(true); browserSpeak(text, onEnd); } else go(false); }
  }

  // ctx.public = true: the public call page (no tabs, no business picker, no manage panel, no login).
  // One-click call: Start Call opens the mic and keeps it open. Speech turns are cut by silence (1 s after you stop talking),
  // sent to the receptionist, answered by voice; the mic is muted (no capture at all) while the AI thinks and speaks, then listening resumes.
  const cfg = { silenceMs: 1000 };
  const ICON_MIC = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2Z"/></svg>';
  const ICON_END = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9Z"/></svg>';
  const hhmm = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const mmss = (ms) => { const t = Math.floor(ms / 1000); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function mount(el, businessId, ctx) {
    if (!el) return;
    const pub = !!(ctx && ctx.public);
    voiceUrl = pub ? '/api/public-voice' : '/api/voice'; ttsUrl = pub ? '/api/public-tts' : '/api/tts';
    if (stopPrev) stopPrev();
    el.innerHTML = (pub ? '' : '<div class="va-tabs" role="tablist"><button class="va-tab on" type="button" role="tab" data-t="call">Test Call</button><button class="va-tab" type="button" role="tab" data-t="manage">Manage Businesses &amp; Orders</button><button class="va-tab" type="button" role="tab" data-t="clients">Clients &amp; Accounts</button></div>') + '<div class="va-pane" data-pane="call"><div class="va"><div class="va-log" aria-live="polite"></div>'
      + '<p class="va-state" role="status"><span class="va-st">Tap Start Call and talk</span><span class="va-timer" hidden>00:00</span></p>'
      + (pub ? '<div class="va-stage"><span class="va-halo" aria-hidden="true"></span><span class="va-bars" aria-hidden="true">' + Array.from({ length: BARS }, (_, i) => '<i style="--i:' + i + '"><b></b></i>').join('') + '</span><span class="va-core" aria-hidden="true">' + ICON_MIC + '</span></div>' : '')
      + '<button class="va-call" type="button"><span class="va-call-i">' + ICON_MIC + '</span><span class="va-call-t">Start Call</span></button>'
      + (SR ? '<button class="va-lang" type="button" aria-label="Speech language" title="Language shown while you speak"></button>' : '')
      + '<button class="va-reset" type="button">Start a new call</button></div></div>' + (pub ? '' : '<div class="va-pane" data-pane="manage" hidden></div><div class="va-pane" data-pane="clients" hidden></div>');
    if (!pub) el.querySelector('.va').insertAdjacentHTML('afterbegin', '<select class="input va-biz" aria-label="Business" hidden></select>');
    const biz = el.querySelector('.va-biz') || document.createElement('select'); // detached in public mode
    const loadBiz = () => fetch('/api/businesses', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : [])).then((rows) => {
      if (!Array.isArray(rows) || !alive) return;
      const n = rows.reduce((t, b) => t + (b.unread || 0), 0), mt = el.querySelector('[data-t=manage]');
      if (mt) mt.innerHTML = 'Manage Businesses &amp; Orders' + (n ? ' <span class="va-count">' + n + '</span>' : '');
      biz.hidden = !rows.length;
      if (!rows.length) return;
      biz.innerHTML = rows.map((b) => '<option value="' + b.id.replace(/"/g, '') + '">' + b.name.replace(/[<&]/g, '') + '</option>').join('');
      if (rows.some((b) => b.id === businessId)) biz.value = businessId; else { businessId = rows[0].id; newCall(); }
    }).catch(() => {});
    if (!pub) loadBiz();
    biz.onchange = () => { businessId = biz.value; newCall(); };
    const log = el.querySelector('.va-log'), stEl = el.querySelector('.va-st'), timerEl = el.querySelector('.va-timer'), callBtn = el.querySelector('.va-call'), reset = el.querySelector('.va-reset'), langBtn = el.querySelector('.va-lang');
    const va = el.querySelector('.va');
    let history = [], alive = true, on = false, phase = 'idle', callId = 0, t0 = 0, timerH = 0, stream = null, rec = null, chunks = [], recMime = '';
    let ac = null, an = null, tdata = null, vadH = 0, raf = 0, sr = null, interim = '', myBubble = null, ctl = null;
    let floor = 0.01, hasSpoken = false, voicedTicks = 0, lastVoice = 0, turnStart = 0, resumeAt = 0, lang = (navigator.language || '').toLowerCase().startsWith('ar') ? 'ar-LB' : 'en-US';
    if (langBtn) { const paint = () => { langBtn.textContent = lang.startsWith('ar') ? 'عربي · tap for EN' : 'EN · tap for عربي'; }; paint(); langBtn.onclick = () => { lang = lang.startsWith('ar') ? 'en-US' : 'ar-LB'; paint(); if (on && phase === 'listening') { stopSR(); startSR(); } }; }

    const say = (t) => { stEl.textContent = t; va.dataset.v = phase === 'listening' ? 'listening' : phase === 'thinking' ? 'thinking' : phase === 'speaking' ? 'speaking' : 'idle'; };
    va.dataset.v = 'idle';
    const setBtn = () => { callBtn.classList.toggle('on', on); callBtn.querySelector('.va-call-t').textContent = on ? 'End Call' : 'Start Call'; callBtn.querySelector('.va-call-i').innerHTML = on ? ICON_END : ICON_MIC; callBtn.setAttribute('aria-label', on ? 'End the call' : 'Start the call'); timerEl.hidden = !on; };
    const bubble = (who, text, extra) => {
      const d = document.createElement('div'); d.className = 'va-msg ' + who + (extra ? ' ' + extra : '');
      if (who === 'note') d.textContent = text; else { const m = document.createElement('span'); m.className = 'va-tx'; m.textContent = text; const t = document.createElement('time'); t.textContent = hhmm(); d.append(m, t); }
      log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
    };
    const setBubbleText = (b, text) => { const m = b.querySelector('.va-tx'); if (m) m.textContent = text; log.scrollTop = log.scrollHeight; };

    // ── mic level + silence detector: one analyser feeds the radial bars (public page) and the 3 s silence rule ──
    function openAudio(s) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        ac = new AC(); if (ac.state === 'suspended') ac.resume().catch(() => {});
        an = ac.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.6; ac.createMediaStreamSource(s).connect(an);
        tdata = new Uint8Array(an.fftSize); const fd = new Uint8Array(an.frequencyBinCount), bars = pub ? el.querySelectorAll('.va-bars b') : [], n = bars.length;
        if (n) va.dataset.meter = '1';
        const draw = () => { raf = requestAnimationFrame(draw); if (phase !== 'listening') return; an.getByteFrequencyData(fd); let sum = 0;
          for (let i = 0; i < n; i++) { const m = Math.min(i, n - 1 - i) / (n / 2), v = fd[1 + Math.floor(m * 22)] / 255; sum += v; bars[i].style.transform = 'scaleY(' + (0.12 + Math.min(1, v * 1.25) * 0.88).toFixed(3) + ')'; }
          if (n) va.style.setProperty('--lvl', Math.min(1, sum / n * 2.2).toFixed(3)); };
        draw(); vadH = setInterval(vad, 60);
      } catch (e) { closeAudio(); }
    }
    function closeAudio() { cancelAnimationFrame(raf); raf = 0; clearInterval(vadH); vadH = 0; try { if (ac) ac.close(); } catch (e) {} ac = an = null; delete va.dataset.meter; va.style.removeProperty('--lvl'); el.querySelectorAll('.va-bars b').forEach((b) => { b.style.transform = ''; }); }
    function rms() { an.getByteTimeDomainData(tdata); let s = 0; for (let i = 0; i < tdata.length; i++) { const v = (tdata[i] - 128) / 128; s += v * v; } return Math.sqrt(s / tdata.length); }
    function vad() { // runs every 60 ms; does nothing unless we are listening (so the AI's own voice is never taken as a turn)
      if (!on || phase !== 'listening' || !an) return; const now = Date.now(); if (now < resumeAt) return;
      const r = rms(), thr = Math.min(0.15, Math.max(0.02, floor * 2.6 + 0.012)), loud = r > thr;
      if (!hasSpoken && !loud) floor = floor * 0.94 + r * 0.06; // learn the room noise while nobody talks
      if (loud) { voicedTicks++; if (r > thr * 0.8) lastVoice = now; if (!hasSpoken && voicedTicks >= 3) { hasSpoken = true; turnStart = now; lastVoice = now; if (!myBubble) myBubble = bubble('me', interim || '…', 'interim'); } } else voicedTicks = 0;
      if (hasSpoken) { // speech recognition activity also counts as "still talking"
        if (now - lastVoice >= cfg.silenceMs || now - turnStart > 55000) endTurn();
      } else if (rec && rec.state === 'recording' && now - turnStart > 12000) restartRec(); // nobody talking: do not keep minutes of silence
    }

    // ── live words while you speak (browser speech recognition; the server transcript replaces them) ──
    function startSR() {
      if (!SR || !on || phase !== 'listening') return;
      try {
        sr = new SR(); sr.lang = lang; sr.continuous = true; sr.interimResults = true;
        sr.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; interim = t.trim(); if (interim) { lastVoice = Date.now(); if (myBubble) setBubbleText(myBubble, interim); else if (hasSpoken) myBubble = bubble('me', interim, 'interim'); } };
        let dead = false; sr.onend = () => { if (!dead && on && phase === 'listening' && sr) { try { sr.start(); } catch (e) {} } };
        sr.onerror = (e) => { if (/not-allowed|service-not-allowed|network|language-not-supported/.test(e.error || '')) dead = true; }; sr.start();
      } catch (e) { sr = null; }
    }
    function stopSR() { const r = sr; sr = null; if (r) { r.onend = null; try { r.abort(); } catch (e) {} } }

    // ── recorder: one blob per turn ──
    function startRec() {
      if (!stream || !window.MediaRecorder) return; chunks = []; recMime = pickMime(); turnStart = Date.now();
      rec = new MediaRecorder(stream, recMime ? { mimeType: recMime } : undefined);
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.start();
    }
    function restartRec() { const r = rec; rec = null; if (r) { r.onstop = null; try { r.stop(); } catch (e) {} } startRec(); }
    function listen() { // (re)open a turn: fresh recorder, fresh speech recognition
      if (!on || !alive) return; phase = 'listening'; hasSpoken = false; voicedTicks = 0; interim = ''; myBubble = null; lastVoice = Date.now(); resumeAt = Date.now() + 450; // short grace so the tail of the AI voice is not heard
      startRec(); startSR(); say('Listening…');
    }
    function endTurn() {
      if (phase !== 'listening') return; const id = callId, spoke = Date.now() - turnStart, bub = myBubble, r = rec; rec = null; phase = 'thinking'; stopSR(); say('Thinking…');
      const finish = () => {
        const blob = new Blob(chunks, { type: (r && r.mimeType) || recMime || 'audio/webm' }); chunks = [];
        if (id !== callId || !on) return;
        if (spoke < MIN_MS || blob.size < 1000) { if (bub) bub.remove(); listen(); return; }
        send(blob, bub, id);
      };
      if (r && r.state !== 'inactive') { r.onstop = finish; try { r.stop(); } catch (e) { finish(); } } else finish();
    }

    async function send(blob, bub, id) {
      const mime = blob.type, fd = new FormData();
      fd.append('audio', blob, 'audio.' + (/mp4/.test(mime) ? 'mp4' : /ogg/.test(mime) ? 'ogg' : 'webm'));
      fd.append('history', JSON.stringify(history.slice(-10)));
      ctl = new AbortController();
      try {
        const res = await fetch(voiceUrl + '?business_id=' + encodeURIComponent(businessId), { method: 'POST', body: fd, credentials: 'same-origin', signal: ctl.signal });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'Something went wrong');
        if (id !== callId || !on) return;
        if (!j.transcript && !j.reply) throw new Error('empty');
        if (j.transcript) { if (bub) { setBubbleText(bub, j.transcript); bub.classList.remove('interim'); } else bubble('me', j.transcript); history.push({ role: 'user', content: j.transcript }); } else if (bub) bub.remove();
        phase = 'speaking'; say('Speaking…');
        // the text and the sound start together; the mic stays closed until the voice has finished
        await new Promise((done) => speak(j.reply, done, (ok) => {
          if (ok && id === callId && on) {
            bubble('ai', j.reply); history.push({ role: 'assistant', content: j.reply }); history = history.slice(-MAX_HISTORY);
            if (j.order_saved) bubble('note', '✓ Order saved');
            if (j.missed_saved) bubble('note', '📝 Request sent to the owner');
          }
        }));
      } catch (err) {
        if (id !== callId || !on) return;
        if (bub && bub.classList.contains('interim')) bub.remove();
        if (err && err.name !== 'AbortError') bubble('note', err.message === 'empty' ? 'I did not catch that. Try again.' : err.message);
      }
      if (id === callId && on) listen();
    }

    // ── call lifecycle ──
    async function startCall() {
      if (on) return; prime();
      if (!navigator.mediaDevices || !window.MediaRecorder) { say('This browser cannot record. Use Chrome, Edge or Safari.'); return; }
      stopSpeech(); callBtn.disabled = true; say('Connecting…');
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
      catch (err) { callBtn.disabled = false; phase = 'idle'; say('Allow the microphone to start the call.'); return; }
      callBtn.disabled = false;
      if (!alive) { releaseMic(); return; }
      on = true; callId++; t0 = Date.now(); floor = 0.01; setBtn(); timerEl.textContent = '00:00'; timerH = setInterval(() => { timerEl.textContent = mmss(Date.now() - t0); }, 1000);
      openAudio(stream); listen();
    }
    function releaseMic() { stopSR(); closeAudio(); const r = rec; rec = null; if (r) { r.onstop = null; try { if (r.state !== 'inactive') r.stop(); } catch (e) {} } chunks = []; if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; }
    function endCall(msg) {
      callId++; on = false; phase = 'idle'; clearInterval(timerH); timerH = 0;
      if (ctl) { try { ctl.abort(); } catch (e) {} ctl = null; }
      stopSpeech(); releaseMic();
      if (myBubble && myBubble.classList.contains('interim')) myBubble.remove(); myBubble = null; interim = '';
      setBtn(); say(msg || 'Call ended. Tap Start Call to talk again.');
    }
    function newCall() { endCall('Tap Start Call and talk'); history = []; log.innerHTML = ''; }
    const cleanup = () => { alive = false; clearInterval(watch); endCall(); if (stopPrev === cleanup) stopPrev = null; };
    stopPrev = cleanup;
    const watch = setInterval(() => { if (!el.isConnected) cleanup(); }, 1000); // drawer closed -> stop mic + voice

    callBtn.addEventListener('click', () => { if (on) endCall(); else startCall(); });
    reset.addEventListener('click', newCall);
    setBtn();
    el.querySelectorAll('.va-tab').forEach((t) => t.addEventListener('click', () => {
      const k = t.dataset.t;
      el.querySelectorAll('.va-tab').forEach((x) => x.classList.toggle('on', x === t));
      el.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== k; });
      if (k !== 'call') endCall();
      if (k === 'manage' && window.VoiceAdmin && ctx) VoiceAdmin.mount(el.querySelector('[data-pane=manage]'), ctx);
      else if (k === 'clients' && window.VoiceClients && ctx) VoiceClients.mount(el.querySelector('[data-pane=clients]'), ctx);
      else if (k === 'call') loadBiz();
    }));
  }

  window.VoiceAgent = { mount, cfg };
})();
