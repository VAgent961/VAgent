# VAgent marketing pipeline: plan (26 Nov 2026). Server renderer written; sample not rendered yet, nothing published.

## 0. Owner decisions (these win over anything below)
1. Writing skills: https://github.com/Jakeschincariol/instagram-agent-skill (MIT, pinned `d03c56b`, install `scripts/install-ig-skill.sh`). Voice file `marketing/voice.md` -> `~/.claude/instagram/voice.md`. Used for Reel hooks, scripts, beats, captions, comment reply **drafts**. It cannot post.
2. Rendering and voice run **on the server only**, never on the Mac.
3. Video and temp files are deleted as soon as a post is **published** or **declined**. While in review/scheduled only `video.mp4` + `job.json` are kept.
4. Tue, Thu, Sat 19:00 `Asia/Beirut`. Owner approval first; any edit clears it. Dry run on by default.
5. Topics: the company, agents already built, ideas we can build at zero paid cost. No WhatsApp. Posts never mention free, cost or pricing (`worker.py` blocks it). Backlog: `marketing/ideas.md`.
6. Zero paid media tools.

## Server worker (`tools/marketing-render/`)
- On the server (Docker): `git clone --depth 1 https://github.com/VAgent961/VAgent && ./VAgent/tools/marketing-render/sample.sh`
- Watch: `ssh -N -L 8787:127.0.0.1:8787 USER@SERVER`, open http://localhost:8787 (streams, no download).
- `docker compose run --rm worker list | approve ID --by NAME | decline ID --by NAME | edit ID posts/FILE.json | publish-due | published ID --media-id X`
- Edited post files need `docker compose build` first (they are copied into the image).
- State is files in the `marketing-data` volume; this is enough until the HQ review UI (section 5) exists.
- Not wired yet: n8n publisher, Instagram, cron for `publish-due`, HQ UI. Live publishing is refused by the code.

## 1. Paid media audit
Searched for ElevenLabs, Higgsfield, HeyGen, Runway, Creatomate, Shotstack, Replicate, Suno and similar.
| Place | Result |
|---|---|
| This repo + git history | none found |
| HQ database (workflow cache, tasks, daily, departments, hooks) | none found |
| 16 server workflows (full JSON) | no ElevenLabs/Higgsfield |
| Mac n8n (8 workflows) | no matching workflow or credential |
| `~/agent-tools` | only skill reference text and its backups, no pipeline |
| Fayez's workflow nodes + credentials | **NOT CHECKED** (only names/steps visible) |

Nothing to strip on our side. Fayez's side: when the export arrives, replace each paid node with the local step below, disable (not delete) the old one, then he revokes the keys and cancels the plans.

## 2. Zero-subscription pipeline
`writer (n8n + AI Helper, free tiers) -> HQ queue -> render worker -> storage -> HQ review -> n8n publisher -> Instagram`

| Step | Tool | Notes |
|---|---|---|
| Script | `ig-*` skills (Claude Code); AI Helper may draft later | owner reviews every draft; fixed JSON post format |
| Voice | Kokoro-82M, voice `af_heart`, fixed speed | Apache-2.0, local, English only (no Arabic); needs its own Python 3.11 env via `uv` |
| Frames | HTML/SVG scene captured in headless Chrome | no licence limit; reuses our CSS, brand and product UI |
| Not chosen | Remotion | free only up to 3 people in total; we are at 3 |
| Encode | ffmpeg (installed; libx264) | 1080x1920, 30 fps, H.264 + AAC, loudness about -14 LUFS, music ducked |
| Captions | one TTS clip per sentence gives exact timings | burned in, inside safe margins |
| Music/SFX | `marketing/audio/` + `LICENSES.csv` (file, source URL, licence, date) | Pixabay summary: free, no attribution, no standalone redistribution (read full terms first). Mixkit unverified: excluded. No file without a CSV row |
| 3D | not in v1 | |

Render worker: server, Docker (`kokoro-onnx`, Chromium, ffmpeg). No music in v1. VPS or ZFS server: whichever has Docker, about 4 GB free disk and 4 GB RAM (estimate, check).
Arabic voice: later. Piper `ar_JO kareem` is a different (male, Jordanian) voice with an unverified dataset licence. V1 = English voice, optional Arabic caption text.
Existing VoiceStudio and Groq voices stay with the Voice Receptionist; not used here until licences/limits are checked.

## 3. Signature character
- **Vee** (name to confirm): the call-page character, `assets/char/r6-*.svg` (7 frames: idle, blink, listen, think, 3 talk) + our headset, terracotta top.
- Same voice, same position, same entrance every post. Mouth frames follow voice loudness; `think` during problem, `talk` during demo.
- Official `assets/brand/mark-dark.svg` corner bug + lockup end card. Mascot never replaces the logo.
- Limit: Avataaars is free for commercial use (per DiceBear) but public, so not exclusive. A custom drawing can replace it later with the same frame names.
- Palette ink/cream/terracotta, Newsreader hooks, Inter captions. Small "AI character" label.

## 4. Showcase format (20-30 s)
0-2 s hook, 2-6 s problem, 6-20 s real screen demo, 20-25 s result, end card + CTA.
Claim rules: only agents on the approved list, each with a recorded demo; no invented numbers or clients; demo data only; no real leads, phones or client names.

| Agent | Evidence now | Owner sign-off needed |
|---|---|---|
| Voice Receptionist | successful runs to 23 Nov | yes |
| Website builder (PM Tech) | 18 builds marked done | yes |
| Sniper Hunt | successful runs 26 Nov | yes, blur all leads |
| Site Doctor | no recent runs listed | demo first |
(Runs may be our own tests: say "ready", not "used by clients".)

### Sample post: Voice Receptionist
- Hook: "Your shop is closed. Who answers?"
- Voice: "Your shop is closed. Who answers? I'm Vee, from VAgent. This is our voice receptionist. Hold the button and ask, in English or Arabic. It answers from your catalog, shows the product, and takes the order. Want to hear it for your business? Send us a message."
- On screen: Closed? Still answering. / Meet Vee / Ask in English or Arabic / Answers from your catalog / Takes the order / Message us
- Caption: "A voice receptionist that answers from your own catalog, in English or Arabic, and takes orders. Send us a message for a demo."
- Hashtags: #VAgent #AIagents #VoiceAI #SmallBusiness #Lebanon #Beirut #LebaneseBusiness #Automation

Rotation: Receptionist, Website builder, Sniper. Next hooks: "From one chat to a working website." / "Finding your next client, district by district."

## 5. Queue, approval, scheduler
Tables: `marketing_posts` (id, slot_at timestamptz, status, version, approved_version, approved_sha256, approved_by/at, content jsonb, media_key, media_sha256, attempts, ig_container_id, ig_media_id, dry_run_at, error), `marketing_events` (audit log), `marketing_settings` (dry_run default true).

| From | To | Who / when |
|---|---|---|
| idea | draft | writer |
| draft | rendering | writer, after schema + claim checks |
| rendering | review | worker uploads MP4 + hash (or failed) |
| review | approved / rejected | owner (reject needs a note) |
| rejected | (media deleted) | automatic; a rewrite renders again |
| approved | scheduled | automatic, future slot |
| scheduled | publishing | publisher, atomic claim |
| publishing | published / failed | publisher |
| failed | previous safe step | owner presses Retry |

- Any edit: version+1, approval cleared. Script/visual/voice edit goes to `rendering`; caption/hashtag/time edit goes to `review`.
- Publish only if status=scheduled, due, approved_version=version and hash matches.
- Never double-post: one claim; on an unclear publish result, check Instagram before any retry.
- Slots: Tue, Thu, Sat 19:00 `Asia/Beirut` (gaps 2/2/3; starting guess, tune from insights). Convert with Postgres `AT TIME ZONE 'Asia/Beirut'` (DST safe).
- Daily job keeps the next 3 slots filled, so a video reaches review about 5 days early. Not approved by slot time: nothing posts, owner picks a new slot.
- Dry run: checks everything, logs "would publish", stays `scheduled` with `dry_run_at`; no Instagram write call. Going live = owner switch + credential added.

Code: `functions/api/marketing.js` (owner session), `functions/hook/marketing.js` (own `MARKETING_SECRET`, not the shared webhook secret), `assets/marketing.js` review queue in the office (video, metadata, edit, approve, reject, phone friendly), `tools/marketing-render/`, 2 new n8n workflows on our server (writer, publisher) with the crash alert.
Storage: server disk only, deleted on publish/decline. Instagram needs a public `video_url`: the publisher exposes a short-lived one just before posting (phase 4).

## 6. Instagram (phase 4)
Professional account; `instagram_business_content_publish` (Instagram Login). Own account needs Standard Access only, no app review. Long-lived token 60 days, refresh + expiry alert. Create REELS container with `video_url`, poll `status_code` until FINISHED, `media_publish`. API limit 100 posts/24 h.

## 7. Phases (each ends with a check)
1. One sample MP4 rendered on the server; owners approve character, voice, look.
2. Tables, API, review UI; check: every transition + edit-resets-approval tests.
3. Writer + render worker + slot filler; check: 3 videos in review.
4. Publisher in dry run for 1 week; check DST and no duplicates.
5. Connect Instagram; owner turns dry run off.

## Open decisions
Fayez export; name "Vee" + `af_heart`; which server + SSH access; Instagram handle; which agents are signed off.

## Sources
github.com/remotion-dev/remotion/blob/main/LICENSE.md · huggingface.co/hexgrad/Kokoro-82M · developers.facebook.com/docs/instagram-platform/content-publishing · pixabay.com/service/license-summary · dicebear.com/styles/avataaars
