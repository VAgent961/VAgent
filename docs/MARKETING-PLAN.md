# VAgent marketing pipeline (built 26 Nov 2026, Instagram in dry run)

## Rules (owner decisions)
- Zero paid video, voice, music or publishing services. Music is generated in code (`music.py`), so there is no track licence to follow.
- 25-35 s per video; opening line scores 75+ in `ig-reel/hookscore.py`. Voice stays Kokoro `af_heart`, speed 1.05.
- Tue, Thu, Sat 19:00 `Asia/Beirut`. Owner approval in HQ; any edit clears it.
- Video is deleted on publish or decline. Nothing renders on a Mac.
- Topics: the company, agents already built, ideas we can build at zero paid cost. No WhatsApp. Posts never mention free, cost or pricing (`lint` in `functions/_marketing.js` blocks it on seed, edit and approve).
- Only drafts are automated; claims about built agents need an owner's check at review (say "ready", never invent clients or numbers; demo data only).

- Every video has its own world (look, layout, camera, transition, sound) and a 1-2 word comment keyword. The post record (`marketing_posts.post`) holds `keyword`, `info {title, summary}` and `direction`; the future comment auto-reply reads them. Rules: `marketing/video-craft.md`. The auto-reply is not built yet.
- Failed renders show their error on /marketing, retry up to 3 times, then offer "Render again". Rows missing a keyword or direction are completed from the repo draft on the next render check.

## How it works
`drafts in repo -> HQ queue (Neon) -> render job (GitHub Actions) -> HQ /marketing review -> n8n tick -> Instagram`
- Drafting: Claude Code with https://github.com/Jakeschincariol/instagram-agent-skill (`scripts/install-ig-skill.sh`, voice `marketing/voice.md`). New post = a JSON file in `tools/marketing-render/posts/` plus its own `worlds/` pair (see `marketing/video-craft.md`), pushed to `main`. A file seeds once; later edits happen in HQ. Writing is on demand, there is no automatic writer. Comment replies: `/ig-reply` drafts only.
- Render: `.github/workflows/marketing-render.yml` (about every 15 min, and on push). Kokoro-82M `af_heart`, our SVG presenter Vee, the blocky terracotta pixel pet (`character.js`: side arms, four legs, eyes, mouth shapes, idle bounce), pixelfx accents (`fx.mjs`), whisper caption timing, video-director QA gates (a failed check blocks review); editing rules in `marketing/video-craft.md`; bumping `LOOK` in `job.py` re-renders unpublished videos and clears approval, official logo, scene types `hook|phone|flow|browser|list|approve|alert|cta` with per-video camera moves, transitions, sound effects and word-by-word captions, ducked music, ffmpeg 1080x1920.
- Changing a repo draft that already seeded does not update HQ: apply it with `edit()` from `functions/_marketing.js` (resets approval, re-renders) or edit in HQ. Signs in with its GitHub OIDC token, so no stored secret. No artifacts; the runner is discarded.
- Why not our server: its n8n has command execution disabled and has no SSH credential. To move later, run `job.py` there with another sign-in method.
- Storage: video chunks in `marketing_media`, private behind the owner session; Instagram gets a signed link valid 1 hour.
- Publisher: n8n `V-Agent | Marketing Publisher` (Z4m9GTCAxMeHCkGm, every 5 min) -> `/hook/marketing` tick: create REELS container -> poll until FINISHED -> publish once -> delete video. Unclear result = failed, never auto-retried. A slot missed by 6 h goes back to review.
- Dry run is the default: logs "would publish", keeps the video, publishes nothing. Going live = connect a token on /marketing, then turn Dry Run off. Posts whose slot passed more than 6 h earlier need approval again.

## Platforms (Instagram + TikTok)
- States: draft = repo file; `rendering -> review -> scheduled` (approved) `-> publishing -> published | failed`; `declined` = rejected.
- Per post `targets` (default: connected platforms, both while none is connected); changing them clears approval. Posts approved before TikTok existed go to Instagram only. Per platform state and error in `pub`.
- One Dry Run switch on /marketing (setting `dry_run`, on unless `off`). Turning it off needs a confirmation; a platform publishes only when it is connected (TikTok: privacy chosen too), otherwise it is simulated. Connecting an account turns Dry Run on again; turning it on stops a waiting Instagram container before publish. A post whose live targets all succeed is `published` and its video deleted, even if another target was only simulated.
- Approved posts: "Save time" moves the slot (approval kept); "Publish now" starts at once when a platform is live (confirmed; the next tick finishes it), otherwise it only simulates and keeps the time.
- /marketing: status tabs, and a progress bar fed by each post's `pub` states (refreshes every 5 s while publishing; results stay 2 minutes).
- A failed platform keeps the video; "Try publishing again" needs a new approval and skips platforms that already published.

## Going live needs
- Instagram: professional account, Meta app with `instagram_business_content_publish`, long-lived token (or a short-lived one plus the app secret, exchanged on connect). HQ checks account type and publish permission, and refreshes the token weekly on the publisher tick, also in Dry Run.
- TikTok: developer app with Login Kit + Content Posting API (Direct Post), scopes `user.info.basic,video.publish`, redirect `https://vagent.online/api/tiktok-callback`; terms + privacy page URLs for review. Verify URL prefix `https://vagent.online/hook/` (paste the signature file on /marketing) or choose file upload. Until TikTok audits the app, posts are private only. The audit expects the creator to pick privacy / interaction settings per post; today they are account-wide.

## Limits
- GitHub may delay scheduled runs, and disables schedules after 60 days without repo activity. The repo is public (code and drafts visible; videos are not). GitHub's Actions terms tie usage to the repo's software project, so marketing renders are a grey area.
- Instagram tokens: `EAA…` (Meta Unified Login) goes to graph.facebook.com, resolves the Page-linked account (prefers @v_agent961) and is not auto-renewed; `IG…` (Instagram Login) goes to graph.instagram.com and is renewed weekly. Test: `node scripts/test-instagram.mjs`.
- The live Instagram calls are tested with a mock only.
- English voice only. The public call page keeps its own character.
