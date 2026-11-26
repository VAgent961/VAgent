# Video craft (every marketing video, current and future)
## A new video (all required; lint, HQ seed or the render rejects anything missing or repeated)
1. Direct it first (video-director): idea, one visual concept from the topic, layout, camera, pacing, sound.
2. `posts/<id>.json`: scenes, caption, hashtags, `direction {world, concept}`, `keyword` (1-2 words, CAPITALS, about this video, unused), `info {title, summary}` (what the auto-reply will send). Caption and last scene say "Comment <KEYWORD>".
3. `worlds/<world>.mjs` (new, never reused): logo, css, labels, layout (card, chips, pet, dock, cta), camera, enter, word, cut, back, front. Draw with pixelfx.
4. `worlds/<world>.json`: tail (pacing), sound (bpm, chords, arp, instrument, drums, transition sound, base note). New tempo, instrument and transition sound; add a synth in `sfx.py` if needed.
5. `node tools/marketing-render/lint.test.mjs`, check still frames, push. Server: `check_timeline.py` -> render -> `qa_video.py`; a FAIL never reaches review.

A render never stops for a missing world: `newworld.py` + `worlds/auto.mjs` generate one from the post id (repeatable). Hand-made worlds are still the standard.
Deploy the site before pushing renderer changes; the job waits until the new code answers.

## Fixed
- Vee: the blocky terracotta pixel pet (12x8 grid, `character.js`), no accessories. Official lockup top-left, "AI character" label.
- Voice: Kokoro `af_heart` 1.05, not processed. Music 20 dB under speech, 12 dB in gaps; -14 LUFS plus limiter.
- Sound effects sit on the beats from `cues()` in `scene.html`, listed in the timeline.
- Captions: fixed box y 1448-1638, up to 4 words, timed by local openai/whisper `base.en`.
- Never move text being read; first frame reads as a cover; flashes are a QA fail.
- 30 fps, x264 slow CRF 19, bt709, under 14 MB. QA results: `QA <post>` notices on the GitHub Actions run.
- Engine change: bump `LOOK` in `job.py` (re-renders unpublished videos, clears approval).
