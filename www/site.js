// Scroll choreography for vagent.online. One driver (gsap.ticker) runs Lenis, ScrollTrigger and the 3D scene.
// The page is fully readable without this file; every hidden or moving state is set here.
(() => {
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const { gsap, ScrollTrigger, Lenis } = window;
  if (!gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const stage = $('.stage'), poster = $('.poster'), rail = $('.rail'), toggle = $('.motion');
  const state = { target: 0, paused: false, reduced: reduce.matches, covered: false };
  let scene = null, lenis = null;

  // ---- smooth scroll (wheel/trackpad only; touch stays native)
  const startLenis = () => {
    if (!Lenis || state.reduced || lenis) return;
    lenis = new Lenis({ autoRaf: false, anchors: { offset: -64 } });
    lenis.on('scroll', ScrollTrigger.update);
  };
  startLenis();
  gsap.ticker.add((time, delta) => {
    lenis?.raf(time * 1000);
    if (scene && !state.covered && !document.hidden) scene.frame(Math.min(delta, 100) / 1000, state);
  });
  gsap.ticker.lagSmoothing(0);

  // ---- 3D progress: each chapter adds one step (0..5) while it scrolls into place
  const chapters = $$('[data-formation]');
  const tall = matchMedia('(max-width: 860px), (orientation: portrait) and (max-width: 1100px)');
  let steps = [];
  steps = chapters.slice(1).map((el) => ScrollTrigger.create({
    trigger: el,
    // tall screens finish a formation as the section reaches the top, so it shows above the copy
    start: () => (tall.matches ? 'top 72%' : 'top 90%'), end: () => (el.id === 'contact' ? 'top 30%' : tall.matches ? 'top 4%' : 'top 20%'),
    onUpdate: () => sum(), onRefresh: () => sum(),
  }));
  sum();
  function sum() {
    if (!steps.length) return;
    state.target = steps.reduce((a, s) => a + s.progress, 0);
    const k = Math.round(state.target), src = `/www/img/f${k}.webp`;
    if (!stage.classList.contains('live') && poster.getAttribute('src') !== src) poster.src = src;
  }
  // stop drawing while the opaque sections cover the whole screen
  ScrollTrigger.create({ trigger: '#work', start: 'top top', endTrigger: '#process', end: 'bottom bottom', onToggle: (t) => { state.covered = t.isActive; } });
  ScrollTrigger.create({ trigger: '#work', start: 'top 70%', endTrigger: '#process', end: 'bottom 20%', onToggle: (t) => toggle.classList.toggle('away', t.isActive) });

  // ---- header progress + service rail
  gsap.to('.progress i', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } });
  ScrollTrigger.create({ trigger: '#web', start: 'top 55%', endTrigger: '#infra', end: 'bottom 80%', onToggle: (t) => rail.classList.toggle('show', t.isActive) });
  for (const link of $$('.rail a')) {
    ScrollTrigger.create({ trigger: link.hash, start: 'top 55%', end: 'bottom 55%', onToggle: (t) => (t.isActive ? link.setAttribute('aria-current', 'true') : link.removeAttribute('aria-current')) });
  }

  // ---- DOM motion (transform + opacity only), removed entirely for reduced motion
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    if (scrollY < 40) {
      gsap.timeline({ defaults: { ease: 'power4.out' } })
        .from('.hero .line > span', { yPercent: 110, duration: 1.1, stagger: 0.09 })
        .from('.hero .lead, .hero .actions', { y: 24, autoAlpha: 0, duration: 0.8, stagger: 0.1 }, '-=0.7');
    }
    for (const el of chapters.slice(1)) {
      gsap.from(el.querySelectorAll('.copy > *, .chapter ul li'), { y: 28, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.05, scrollTrigger: { trigger: el.querySelector('.copy'), start: 'top 82%', once: true } });
    }
    gsap.fromTo('.feature figure img', { scale: 1.14 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.feature', start: 'top bottom', end: 'center center', scrub: true } });
    for (const group of ['.cards', '.phases']) {
      gsap.from(`${group} > *`, { y: 44, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.1, scrollTrigger: { trigger: group, start: 'top 84%', once: true } });
    }
    // timeline steps light up in order as the card is read
    gsap.from('.times li, .steps li, .talk p', { x: -14, opacity: 0, duration: 0.5, stagger: 0.08, scrollTrigger: { trigger: '.cards', start: 'top 65%', once: true } });
  });

  reduce.addEventListener('change', (e) => {
    state.reduced = e.matches;
    if (e.matches) { lenis?.destroy(); lenis = null; } else startLenis();
    toggle.hidden = !scene || e.matches;
  });
  toggle.addEventListener('click', () => {
    state.paused = !state.paused;
    toggle.setAttribute('aria-pressed', String(state.paused));
    toggle.textContent = state.paused ? 'Play motion' : 'Pause motion';
  });
  addEventListener('load', () => ScrollTrigger.refresh());
  document.fonts?.ready.then(() => ScrollTrigger.refresh());

  // ---- 3D loads after the page is usable; weak or data-saving devices keep the still images
  const nav = navigator, weak = nav.connection?.saveData || (nav.deviceMemory && nav.deviceMemory <= 2);
  async function load3d() {
    if (weak) return;
    try {
      const { createScene } = await import('/www/scene.js');
      scene = createScene(stage.querySelector('canvas'), { onLost: () => { stage.classList.remove('live'); scene = null; toggle.hidden = true; sum(); } });
      scene.frame(0, state, true);
      stage.classList.add('live');
      toggle.hidden = state.reduced;
      window.__vagentScene = scene; // used by scripts/www-shots.mjs to make the still images
      window.__vagentState = state;
    } catch (e) { console.warn('3D unavailable, showing still images.', e.message); }
  }
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  if (document.readyState === 'complete') idle(load3d, { timeout: 1500 });
  else addEventListener('load', () => idle(load3d, { timeout: 1500 }), { once: true });
})();
