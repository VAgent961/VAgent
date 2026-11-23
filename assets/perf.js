/* VPerf — keeps browser zoom / resize / pinch smooth. Sets <html data-zooming> while the viewport is changing (resize, devicePixelRatio, visualViewport)
   and for 180 ms after; CSS pauses animations + blur then, render loops skip their work (VPerf.busy()), and VPerf.debounce() batches layout work to
   150 ms + one rAF. Also exposes VPerf.watch(el, cb) = IntersectionObserver visibility so offscreen scenes stop animating. */
(function () {
  'use strict';
  const root = document.documentElement; let t = 0, on = false, dpr = window.devicePixelRatio || 1;
  const stop = () => { on = false; root.removeAttribute('data-zooming'); };
  const bump = () => { if (!on) { on = true; root.setAttribute('data-zooming', ''); } clearTimeout(t); t = setTimeout(stop, 180); };
  const check = () => { const d = window.devicePixelRatio || 1; if (d !== dpr) { dpr = d; bump(); } };
  window.addEventListener('resize', () => { bump(); check(); }, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', bump, { passive: true });
  const debounce = (fn, ms = 150) => { let h = 0, q = 0; return function () { const a = arguments, c = this; clearTimeout(h); h = setTimeout(() => { if (q) return; q = requestAnimationFrame(() => { q = 0; fn.apply(c, a); }); }, ms); }; };
  const watch = (el, cb) => { if (!window.IntersectionObserver || !el) return { visible: true }; const s = { visible: true }; new IntersectionObserver((e) => { s.visible = e[e.length - 1].isIntersecting; if (cb) cb(s.visible); }).observe(el); return s; };
  window.VPerf = { busy: () => on, debounce, watch, dpr: () => Math.min(window.devicePixelRatio || 1, 2) };
})();
