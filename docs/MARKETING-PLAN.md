# VAgent marketing pipeline (built 26 Nov 2026, Instagram in dry run)

## Rules (owner decisions)
- Zero paid video, voice, music or publishing services. Music is generated in code (`music.py`), so there is no track licence to follow.
- 25-35 s per video; opening line scores 75+ in `ig-reel/hookscore.py`. Voice stays Kokoro `af_heart`, speed 1.05.
- Tue, Thu, Sat 19:00 `Asia/Beirut`. Owner approval in HQ; any edit clears it.
- Video is deleted on publish or decline. Nothing renders on a Mac.
- Topics: the company, agents already built, ideas we can build at zero paid cost. No WhatsApp. Posts never mention free, cost or pricing (`lint` in `functions/_marketing.js` blocks it on seed, edit and approve).
- Only drafts are automated; claims about built agents need an owner's check at review (say "ready", never invent clients or numbers; demo data only).

## How it works
`drafts in repo -> HQ queue (Neon) -> render job (GitHub Actions) -> HQ /marketing review -> n8n tick -> Instagram`
- Drafting: Claude Code with https://github.com/Jakeschincariol/instagram-agent-skill (`scripts/install-ig-skill.sh`, voice `marketing/voice.md`). New post = a JSON file in `tools/marketing-render/posts/`, pushed to `main`. A file seeds once; later edits happen in HQ. Writing is on demand, there is no automatic writer. Comment replies: `/ig-reply` drafts only.
- Render: `.github/workflows/marketing-render.yml` (about every 15 min, and on push). Kokoro-82M `af_heart`, our own SVG presenter (`character.js`: poses, expressions, talking and idle motion), official logo, scene types `hook|phone|flow|browser|list|approve|alert|cta` with camera moves, wipes and word-by-word captions (word timing is estimated from word length), ducked music, ffmpeg 1080x1920.
- Changing a repo draft that already seeded does not update HQ: apply it with `edit()` from `functions/_marketing.js` (resets approval, re-renders) or edit in HQ. Signs in with its GitHub OIDC token, so no stored secret. No artifacts; the runner is discarded.
- Why not our server: its n8n has command execution disabled and has no SSH credential. To move later, run `job.py` there with another sign-in method.
- Storage: video chunks in `marketing_media`, private behind the owner session; Instagram gets a signed link valid 1 hour.
- Publisher: n8n `V-Agent | Marketing Publisher` (Z4m9GTCAxMeHCkGm, every 5 min) -> `/hook/marketing` tick: create REELS container -> poll until FINISHED -> publish once -> delete video. Unclear result = failed, never auto-retried. A slot missed by 6 h goes back to review.
- Dry run is the default: logs "would publish", keeps the video, calls nothing at Instagram. Going live = connect a token on /marketing, then press Go live. Posts whose slot passed more than 6 h earlier need approval again.

## Going live needs
Instagram professional account, a Meta app with `instagram_business_content_publish` (Instagram Login), a long-lived token (HQ refreshes it weekly).

## Limits
- GitHub may delay scheduled runs, and disables schedules after 60 days without repo activity. The repo is public (code and drafts visible; videos are not). GitHub's Actions terms tie usage to the repo's software project, so marketing renders are a grey area.
- The live Instagram calls are tested with a mock only.
- English voice only. The public call page keeps its own character.
