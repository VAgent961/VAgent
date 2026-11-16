// Voice Receptionist panel. VoiceAgent.mount(element, businessId): hold the button, speak, hear the answer.
// mic (MediaRecorder) -> POST /api/voice (audio + history) -> reply spoken with speechSynthesis.
(function () {
  const MAX_HISTORY = 12;
  const MIN_MS = 500;
  let stopPrev = null;

  function pickMime() {
    const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return (window.MediaRecorder && c.find((m) => MediaRecorder.isTypeSupported(m))) || '';
  }

  function speak(text, onEnd) {
    const ss = window.speechSynthesis;
    if (!ss) { onEnd && onEnd(); return; }
    ss.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const ar = /[؀-ۿ]/.test(text);
    u.lang = ar ? 'ar-SA' : 'en-US';
    const v = ss.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(ar ? 'ar' : 'en'));
    if (v) u.voice = v;
    u.onend = u.onerror = () => onEnd && onEnd();
    ss.speak(u);
  }

  function mount(el, businessId) {
    if (!el) return;
    if (stopPrev) stopPrev();
    el.innerHTML = '<div class="va"><div class="va-log" aria-live="polite"></div>'
      + '<p class="va-state" role="status">Hold the button and talk</p>'
      + '<button class="va-btn" type="button" aria-label="Hold to talk"><span class="va-ring"></span><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2Z"/></svg></button>'
      + '<button class="va-reset" type="button">Start a new call</button></div>';
    const log = el.querySelector('.va-log'), state = el.querySelector('.va-state'), btn = el.querySelector('.va-btn'), reset = el.querySelector('.va-reset');
    let history = [], rec = null, chunks = [], stream = null, t0 = 0, busy = false, alive = true;

    const say = (t) => { state.textContent = t; };
    const bubble = (who, text) => {
      const d = document.createElement('div'); d.className = 'va-msg ' + who; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight;
    };
    const release = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
    const cleanup = () => { alive = false; clearInterval(watch); try { if (rec && rec.state === 'recording') rec.stop(); } catch (e) {} release(); if (window.speechSynthesis) speechSynthesis.cancel(); if (stopPrev === cleanup) stopPrev = null; };
    stopPrev = cleanup;
    const watch = setInterval(() => { if (!el.isConnected) cleanup(); }, 1000); // drawer closed -> stop mic + voice

    async function start(e) {
      e.preventDefault();
      if (busy || rec) return;
      if (!navigator.mediaDevices || !window.MediaRecorder) { say('This browser cannot record. Use Chrome, Edge or Safari.'); return; }
      if (window.speechSynthesis) speechSynthesis.cancel();
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
        if (j.transcript) { bubble('me', j.transcript); history.push({ role: 'user', content: j.transcript }); }
        bubble('ai', j.reply); history.push({ role: 'assistant', content: j.reply });
        history = history.slice(-MAX_HISTORY);
        if (j.order_saved) bubble('note', '✓ Order saved');
        say('Speaking…');
        speak(j.reply, () => { if (alive) say('Hold the button and talk'); });
      } catch (err) { if (alive) say(err.message); }
      busy = false; btn.disabled = false;
    }

    btn.addEventListener('pointerdown', start);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => btn.addEventListener(n, stop));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
    btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') stop(); });
    reset.addEventListener('click', () => { history = []; log.innerHTML = ''; if (window.speechSynthesis) speechSynthesis.cancel(); say('Hold the button and talk'); });
  }

  window.VoiceAgent = { mount };
})();
