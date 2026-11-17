// Voice Receptionist panel. VoiceAgent.mount(element, businessId): hold the button, speak, hear the answer.
// mic (MediaRecorder) -> POST /api/voice (audio + history) -> reply spoken by /api/tts (Groq Orpheus), browser voice as fallback.
(function () {
  const MAX_HISTORY = 12;
  const MIN_MS = 500;
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
    const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), credentials: 'same-origin' });
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

  function mount(el, businessId, ctx) {
    if (!el) return;
    if (stopPrev) stopPrev();
    el.innerHTML = '<div class="va-tabs" role="tablist"><button class="va-tab on" type="button" role="tab" data-t="call">Test Call</button><button class="va-tab" type="button" role="tab" data-t="manage">Manage Businesses &amp; Orders</button></div><div class="va-pane" data-pane="call"><div class="va"><div class="va-log" aria-live="polite"></div>'
      + '<p class="va-state" role="status">Hold the button and talk</p>'
      + '<button class="va-btn" type="button" aria-label="Hold to talk"><span class="va-ring"></span><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2Z"/></svg></button>'
      + '<button class="va-reset" type="button">Start a new call</button></div></div><div class="va-pane" data-pane="manage" hidden></div>';
    el.querySelector('.va').insertAdjacentHTML('afterbegin', '<select class="input va-biz" aria-label="Business" hidden></select>');
    const biz = el.querySelector('.va-biz');
    const loadBiz = () => fetch('/api/businesses', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : [])).then((rows) => {
      if (!Array.isArray(rows) || !alive) return;
      biz.hidden = !rows.length;
      if (!rows.length) return;
      biz.innerHTML = rows.map((b) => '<option value="' + b.id.replace(/"/g, '') + '">' + b.name.replace(/[<&]/g, '') + '</option>').join('');
      if (rows.some((b) => b.id === businessId)) biz.value = businessId; else { businessId = rows[0].id; history = []; log.innerHTML = ''; }
    }).catch(() => {});
    loadBiz();
    biz.onchange = () => { businessId = biz.value; history = []; log.innerHTML = ''; say('Hold the button and talk'); };
    const log = el.querySelector('.va-log'), state = el.querySelector('.va-state'), btn = el.querySelector('.va-btn'), reset = el.querySelector('.va-reset');
    let history = [], rec = null, chunks = [], stream = null, t0 = 0, busy = false, alive = true;

    const say = (t) => { state.textContent = t; };
    const bubble = (who, text) => {
      const d = document.createElement('div'); d.className = 'va-msg ' + who; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight;
    };
    const release = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
    const cleanup = () => { alive = false; clearInterval(watch); try { if (rec && rec.state === 'recording') rec.stop(); } catch (e) {} release(); stopSpeech(); if (stopPrev === cleanup) stopPrev = null; };
    stopPrev = cleanup;
    const watch = setInterval(() => { if (!el.isConnected) cleanup(); }, 1000); // drawer closed -> stop mic + voice

    async function start(e) {
      e.preventDefault();
      if (busy || rec) return;
      prime();
      if (!navigator.mediaDevices || !window.MediaRecorder) { say('This browser cannot record. Use Chrome, Edge or Safari.'); return; }
      stopSpeech();
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (err) { say('Allow the microphone to talk to it.'); return; }
      if (!alive) { release(); return; }
      chunks = []; t0 = Date.now();
      const mime = pickMime();
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = () => send(rec.mimeType || mime || 'audio/webm');
      rec.start();
      btn.classList.add('on'); say('Listening… let go when you finish');
    }

    function stop() {
      if (!rec || rec.state !== 'recording') return;
      btn.classList.remove('on');
      rec.stop();
    }

    async function send(mime) {
      const r = rec; rec = null; release();
      const blob = new Blob(chunks, { type: mime });
      if (!alive) return;
      if (Date.now() - t0 < MIN_MS || blob.size < 1000) { say('Too short. Hold the button while you talk.'); return; }
      busy = true; btn.disabled = true; say('Thinking…');
      const fd = new FormData();
      fd.append('audio', blob, 'audio.' + (/mp4/.test(mime) ? 'mp4' : /ogg/.test(mime) ? 'ogg' : 'webm'));
      fd.append('history', JSON.stringify(history.slice(-10)));
      try {
        const res = await fetch('/api/voice?business_id=' + encodeURIComponent(businessId), { method: 'POST', body: fd, credentials: 'same-origin' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'Something went wrong');
        if (!alive) return;
        // Thinking… stays until the voice is ready; then the text and the sound start together.
        await new Promise((res) => speak(j.reply, () => { if (alive) say('Hold the button and talk'); }, (ok) => {
          if (ok && alive) {
            if (j.transcript) { bubble('me', j.transcript); history.push({ role: 'user', content: j.transcript }); }
            bubble('ai', j.reply); history.push({ role: 'assistant', content: j.reply });
            history = history.slice(-MAX_HISTORY);
            if (j.order_saved) bubble('note', '✓ Order saved');
            if (j.missed_saved) bubble('note', '📝 Request sent to the owner');
            say('Speaking…');
          }
          res();
        }));
      } catch (err) { if (alive) say(err.message); }
      busy = false; btn.disabled = false;
    }

    btn.addEventListener('pointerdown', start);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => btn.addEventListener(n, stop));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
    btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') stop(); });
    reset.addEventListener('click', () => { history = []; log.innerHTML = ''; stopSpeech(); say('Hold the button and talk'); });
    el.querySelectorAll('.va-tab').forEach((t) => t.addEventListener('click', () => {
      const manage = t.dataset.t === 'manage';
      el.querySelectorAll('.va-tab').forEach((x) => x.classList.toggle('on', x === t));
      el.querySelector('[data-pane=call]').hidden = manage;
      const mp = el.querySelector('[data-pane=manage]'); mp.hidden = !manage;
      if (manage) { stop(); stopSpeech(); if (window.VoiceAdmin && ctx) VoiceAdmin.mount(mp, ctx); }
      else loadBiz();
    }));
  }

  window.VoiceAgent = { mount };
})();
