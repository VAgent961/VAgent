# VAgent HQ — rules for Claude (read this + TREE.md first, nothing else)

Company site for VAgent (owners: Hassan, Fayez, Boudy). Sign-in page + a live isometric "office" where every n8n workflow is an agent.

## Save tokens (always)
- Read `TREE.md` first. It maps every file, endpoint, table and command. Do NOT list/explore folders or read files you don't need.
- Read only the file you will change; edit with small targeted edits, never rewrite whole files.
- Don't print secrets or big JSON. Pipe API output through `head -c 600` or a jq/node one-liner.
- After adding/removing a file, endpoint or table: update `TREE.md` (one line each). Keep this file short.
- Test with the commands in TREE.md, not by opening many screenshots. One desktop + one phone screenshot is enough.

## Stack
- Plain static HTML/CSS/JS (no framework, no build, no npm). GSAP from cdnjs for movement only.
- Live at https://vagent.online. Cloudflare Pages project `vagent` (Fayez's account) + Pages Functions in `functions/` (no npm packages; Neon over HTTPS fetch).
- Neon Postgres. Secrets only in Cloudflare: `DATABASE_URL`, `SESSION_SECRET`, `ENC_KEY`, `WEBHOOK_SECRET` (+ optional `GROQ_API_KEY`). Never commit secrets.
- n8n API keys are stored AES-GCM encrypted (ENC_KEY) and only used server-side.

## Rules
- Every `/api/*` route except login/logout needs an owner session (middleware does it; use `data.owner`).
- Never deactivate/activate an agent without the user confirming in the UI.
- Sign-in page must fit one screen (no scroll) on desktop and phones.
- Brand: cream #FAF9F5 / #F3F1EA, ink #141413, terracotta #B5532F (hover #9A4527), Newsreader headings, Inter text.
- Deploy = `./scripts/deploy.sh`, then `git push`. A push to `main` is a release.
