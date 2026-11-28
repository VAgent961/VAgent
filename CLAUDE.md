# VAgent HQ — rules for Claude (read this + TREE.md first, nothing else)

Company site for VAgent (owners: Hassan, Fayez, Boudy). Sign-in page + a live isometric "office" where every n8n workflow is an agent.

## Save tokens (always)
- Read `TREE.md` first. It maps every file, endpoint, table and command. Do NOT list/explore folders or read files you don't need.
- Read only the file you will change; edit with small targeted edits, never rewrite whole files.
- Don't print secrets or big JSON. Pipe API output through `head -c 600` or a jq/node one-liner.
- After adding/removing a file, endpoint or table: update `TREE.md` (one line each). Keep this file short.
- Test with the commands in TREE.md, not by opening many screenshots. One desktop + one phone screenshot is enough.

## Stack
- Plain static HTML/CSS/JS (no framework, no build, no npm). GSAP from cdnjs for movement only (`www/` self-hosts GSAP, Lenis and Three.js in `www/vendor/`).
- App live at https://city.vagent.online; https://vagent.online is the public company site (`www/`, static, no internal links or data beyond the team sign-in). Cloudflare Pages project `vagent` (Fayez's account) + Pages Functions in `functions/` (no npm packages; Neon over HTTPS fetch).
- Neon Postgres. Secrets only in Cloudflare: `DATABASE_URL`, `SESSION_SECRET`, `ENC_KEY`, `WEBHOOK_SECRET` (+ optional `GROQ_API_KEY`). Never commit secrets.
- n8n API keys are stored AES-GCM encrypted (ENC_KEY) and only used server-side.

## Rules
- Every `/api/*` route except login/logout needs an owner session (middleware does it; use `data.owner`). One exception: the marketing-only account (`MARKETING_EMAIL`) may use only `/api/marketing`.
- Never deactivate/activate an agent without the user confirming in the UI.
- Sign-in page must fit one screen (no scroll) on desktop and phones.
- Brand: cream #FAF9F5 / #F3F1EA, ink #141413, terracotta #B5532F (hover #9A4527), Newsreader headings, Inter text.
- **Brand logo (locked):** the ONLY official VAgent mark is the "node tile" in `assets/brand/`: `mark.svg` (light surfaces), `mark-dark.svg` (dark surfaces), `mark-mono.svg` / `mark-mono-white.svg` (one colour), `lockup*.svg` (mark + VAgent wordmark, same four variants), `favicon.svg`, `app-icon.svg`; root rasters `favicon.ico`, `favicon-32x32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` (rendered from them). Use only these files on every page, component, host and email. Never redraw, recolour, restyle or add another logo or stand-in glyph; no old logo (teal tile) anywhere.
- Deploy = `./scripts/deploy.sh`, then `git push`. A push to `main` is a release.

## Prospect research (`/sniper-research`)
- `/sniper-research <niche in place>` (batch CSV) or `<company|URL>` (deep audit); flow in `.claude/skills/sniper-research/SKILL.md`.
- Sales voice: `.claude/shared/voice-profile.md`. Outreach is draft only, never auto-sent. Output goes to `leads/` (never commit it).
