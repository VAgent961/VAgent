# VAgent website

Company website for **VAgent**, live at https://vagent.online.

## How it works
- Plain static site: `index.html` plus image files. No framework, no build step, no npm.
- Hosted free on **Cloudflare Pages**, connected to this GitHub repo.
- **Every push to `main` deploys to production automatically** (live about 1 minute later). Treat a push to `main` as a release.

## Brand
- Logo: `logo.png` (teal rounded square, dark "V" with a dot). Use it as the logo everywhere.
- Brand teal: `#2EE6C5` (used as `theme-color`).
- Favicons made from `logo.png`: `favicon.ico` (16/32/48), `favicon-32x32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`.
  To regenerate after a logo change, use `sips -z <size> <size> logo.png --out <file>` (macOS built-in). Pack `favicon.ico` from the 16/32/48 PNGs with a short Python script.

## Pages
- `index.html`: owner sign-in page (warm cream #FAF9F5, near-black #141413, terracotta #B5532F; Newsreader headings, Inter text). Must fit one screen with no scrolling on desktop and phones (portrait and landscape).
- Sign-in is not connected to a backend yet; the office page comes next.

## Rules
- Keep changes small. No frameworks or new dependencies unless asked.
- Test by opening `index.html` in a browser before pushing to `main`. Responsive check: `node ~/agent-tools/site-checker/resp-test.js index.html` (all sizes must say OK).
