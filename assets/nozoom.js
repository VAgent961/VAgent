// Blocks browser zoom (pinch, double-tap, ctrl/cmd + wheel or +/-) on the whole site.
// The office scene (#stage) handles its own zoom in office.js.
(() => {
  const inStage = (e) => e.target && e.target.closest && e.target.closest('#stage');
  document.addEventListener('wheel', (e) => { if (e.ctrlKey && !inStage(e)) e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_', '0'].includes(e.key)) e.preventDefault(); });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !inStage(e)) e.preventDefault(); }, { passive: false });
})();
