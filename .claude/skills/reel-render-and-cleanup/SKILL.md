---
name: reel-render-and-cleanup
description: Render VAgent Instagram Reel drafts into the "Waiting for approval" queue on vagent.online/marketing, and delete video files of published or declined posts (server and this Mac). Use after reel-idea-generator, when asked to render or queue reels, to check a stuck render, or to free video storage.
---

# reel-render-and-cleanup

Ends at the review queue. Never approve, publish, "Publish now" or turn Dry Run off: those are the owner's clicks on /marketing. Instagram (`@v_agent961`) only.

## Render and queue
1. Both checks pass: `node .claude/skills/reel-idea-generator/check.mjs <id> ...` and `node tools/marketing-render/lint.test.mjs`.
2. Commit only the new `posts/`, `worlds/`, `sfx.py` and `marketing/ideas.md` changes. If site code changed, run `./scripts/deploy.sh` first. Then `git push` to `main` (a release; do it from an up-to-date `main`).
3. GitHub Actions `marketing-render` seeds each draft (`rendering`), renders it (Kokoro `af_heart`, sound effects, pixel pet, world; 1080x1920), runs QA and uploads it (`review` = Waiting for approval). Do not render full videos on the Mac.
4. `node .claude/skills/reel-render-and-cleanup/reel.mjs wait <id> ...` (run it again if still `rendering`; GitHub can be slow).
5. On `failed` or no progress: `gh run list --workflow marketing-render.yml -L 3`, `gh run view <run> --log-failed | tail -40`. Fix the draft or world, push, and ask the owner to press "Render again". A draft that already seeded does not reseed: scene or caption edits go through HQ.
6. `not in queue` after a successful run = HQ rejected the seed (invalid, or keyword/world taken).

## Cleanup
| When | Server (automatic, in `functions/`) | This Mac |
|---|---|---|
| Published to Instagram | chunks deleted once Instagram confirms; the publisher tick sweeps leftovers | `reel.mjs clean` |
| Declined | chunks deleted at once | `reel.mjs clean` |
| Dry run, failed publish | video kept (still needed) | kept |
| Render run | temp folder removed, runner discarded | nothing created |

- Always finish with `node .claude/skills/reel-render-and-cleanup/reel.mjs clean` (`--dry` to preview).
- Anything made locally (preview frames, test clips) must be named `vagent-reel-<id>...` and live in `~/Movies/VAgent/`, `tools/marketing-render/out|tmp/`, `tmp/` or the system temp folder; delete previews when checked. `clean` touches no other names.
- Mac files are removed only when `clean` runs; the website cannot reach the Mac.

## Review days
Scheduled reels come from `functions/_autopilot.js` (see `reel-idea-generator`). Approving takes the next free Tue/Thu/Sat 19:00 Beirut slot (today's, if free and before 19:00). Scheduled publishing runs only on those days; "Publish now" works any day.
`scripts/install-reel-cleanup.sh` runs `reel.mjs clean` on this Mac Tue/Thu/Sat 10:00 and 21:00.
