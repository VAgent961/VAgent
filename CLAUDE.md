# VAgent website

Company website for **VAgent**, live at https://vagent.online.

## How it works
- Static pages (`index.html` sign-in, `office.html`) + Cloudflare Pages Functions in `functions/` (no npm, no build step).
- Auth: `functions/api/login.js` checks owners in Neon table `vagent_owners` (PBKDF2 hashes), sets a signed HttpOnly cookie `va_session`. `functions/_middleware.js` protects `/office`. Wrong tries logged in `vagent_login_fails` (10 per 15 min).
- Secrets live only in Cloudflare (Pages project `vagent`): `DATABASE_URL`, `SESSION_SECRET`. Never commit them.
- Add/reset owners: `DATABASE_URL=... OWNER_PASSWORD=... node scripts/create-owners.mjs email1 email2`.
- Deploy: `./scripts/deploy.sh` (uploads to Cloudflare Pages project `vagent`, live at https://vagent.pages.dev). Push to GitHub `VAgent961/VAgent` too.

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
