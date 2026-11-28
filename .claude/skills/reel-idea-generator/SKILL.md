---
name: reel-idea-generator
description: Generate fresh, non-duplicate 9:16 Instagram Reel drafts for VAgent (@v_agent961) in the format the renderer reads. Use when asked for new reel ideas, new marketing videos, to refill the review queue, or to change the automatic Tue/Thu/Sat schedule.
---

# reel-idea-generator

Writes drafts only. Never publishes, approves, declines or changes Dry Run. Instagram only.

## Schedule (automatic, no Claude session needed)
`functions/_autopilot.js`, driven by the n8n publisher tick, writes the scheduled reels with the office AI. every day Beirut from 06:00 (Lebanese Arabic and English alternate; every post needs `topic {key, summary}` in English, unique across both) (waiting for approval by 08:00); a declined or failed one is replaced 2 hours later until a post holds that day's 19:00 slot or it is 19:00. Sun/Mon/Wed/Fri: nothing. Its videos use generated worlds. This skill is for **manual** requests (hand-made worlds); do not schedule it as well.

## Duplicates (never render one)
Every idea is checked against the whole queue (published and declined included) and every post on the Instagram page: keyword, title, first line, script, caption (`repeats()` in `_marketing.js`), then a meaning check by the office AI (`sameTopic()`). `check.mjs <id>` runs both for a new draft; an unreadable page or unclear answer = FAIL.

## Generate now through the autopilot (when asked for videos without topics)
`node scripts/generate-reels.mjs <n>`: HQ invents n ideas itself and queues them for rendering. Give it no topic. Then follow `reel-render-and-cleanup` step 4.

## Run (no questions needed)
1. Read `marketing/voice.md`, `marketing/video-craft.md`, `marketing/ideas.md`. Script with the `short-form-video` and `explainer-video` skills, direct the world with `motion-art-direction` and `sound-design-foley` (open others from the "Quality bar" list only when needed).
2. `node .claude/skills/reel-idea-generator/check.mjs list`: used topics, keywords, worlds, hooks.
3. How many: the number asked for. If none was given, top the unpublished buffer up to 3. At 3 or more, stop and say so. If the queue is unreachable, make at most 1.
4. **idea**: pick a topic not in the list (company, a built agent, or an idea we can build with what we run today). Add its row to `marketing/ideas.md`.
5. **draft**: for each, copy the shape of one recent file in `tools/marketing-render/posts/` into `posts/<id>.json`:
   - `id` (kebab-case + `-01`), `keyword` (1-2 words, CAPITALS), `info {title, summary}`, `direction {world, concept}`
   - 6-8 `scenes`: `say` (the Kokoro `af_heart` narration, 65-90 words in total), `title`, `shot` (`hook|phone|flow|browser|list|approve|alert|cta`), `items` (max 4), `mood`; `chat` for a phone demo. Last scene: `shot: "cta"`, `end: true`, "Comment <KEYWORD>".
   - Story: hook (open question) -> pain -> how it works in order (a `flow` of 3-4 items, then `approve`) -> payoff that answers the hook -> cta. One idea per scene; titles 2-5 words; items 1-4 words; hook has exactly 2 items.
   - First `title`: 18 characters at most.
   - First `say`: 12 words or fewer, scores 75+.
   - `caption` (asks to comment the keyword) and `hashtags`.
6. Own world, never reused: `worlds/<world>.mjs` (logo, css, labels, card, chips, pet, dock, cta, camera, enter, word, cut, back, front; scene drawn with pixelfx) and `worlds/<world>.json` (`tail`, `sound`: new tempo, instrument, transition sound; add a synth to `sfx.py` if needed). Start from the closest existing world but write every function and the layout anew. Do not use `newworld.py` for drafts: the test rejects repeated parts.
   - Presenter is always the terracotta pixel pet from `character.js`. Do not redraw it or the logo.
   - Sound-effect cues are not hand-listed: `cues()` in `scene.html` places them from each scene's `shot` and `items`; the world's `sound` sets how they sound. Choose shots and items to get the beats you want.
7. Verify, fix until both pass:
   - `node .claude/skills/reel-idea-generator/check.mjs <id> ...`
   - `node tools/marketing-render/lint.test.mjs`
8. Hand off to the `reel-render-and-cleanup` skill with the new ids.

## Content rules
No WhatsApp, no mention of free, cost, price or discounts, no invented clients or numbers (say "ready"), demo data only. A topic that was declined stays used.
