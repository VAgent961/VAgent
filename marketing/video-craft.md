# Video craft (every marketing video, current and future)
## A new video (all required; lint, HQ seed or the render rejects anything missing or repeated)
1. Direct it first (video-director): idea, one visual concept from the topic, layout, camera, pacing, sound.
2. `posts/<id>.json`: scenes, caption, hashtags, `direction {world, concept}`, `keyword` (1-2 words, CAPITALS, about this video, unused), `info {title, summary}` (what the auto-reply will send). Caption and last scene say "Comment <KEYWORD>".
3. `worlds/<world>.mjs` (new, never reused): logo, css, labels, layout (card, chips, pet, dock, cta), camera, enter, word, cut, back, front. Draw with pixelfx.
4. `worlds/<world>.json`: tail (pacing), sound (bpm, chords, arp, instrument, drums, transition sound, base note). New tempo, instrument and transition sound; add a synth in `sfx.py` if needed.
5. `node tools/marketing-render/lint.test.mjs`, check still frames, push. Server: `check_timeline.py` -> render -> `qa_video.py`; a FAIL never reaches review.

A render never stops for a missing world: `newworld.py` + `worlds/auto.mjs` generate one from the post id (repeatable). Hand-made worlds are still the standard.
Deploy the site before pushing renderer changes; the job waits until the new code answers.

## Quality bar (installed skills in `.claude/skills/`)
- Story and script: `short-form-video`, `explainer-video`, `explainer-video-production`, `social-short-production`, `saas-product-demo-production`. Hook (open question) -> pain -> 3 steps -> payoff -> one ask; one idea per scene; hook on screen in frame 1.
- Motion and type: `motion-art-direction`, `motion-graphics-direction`, `animation-principles`, `title-kinetic-typography`, `caption-animation`, `diagram-animation`, `procedural-canvas-animation` (worlds).
- Sound: `sound-design-foley`, `audio-mixing-mastering` (`scripts/measure_loudness.py <mp4>`).
- Delivery QA: `ffmpeg-media-finishing`, `media-qc-delivery` (`scripts/media_probe.py <mp4>`).
- Skip their cloud providers, Remotion and paid tools: this pipeline stays free and local.

## Fixed
- Built into the engine: "i/N" step counter on the middle scenes, current workflow step spotlighted, `done` chime when a flow completes, long labels shrink to fit, first hook chip at 0.2 s.
- First scene title: 18 characters at most (longer fails the 84 px headline check).
- Vee: the blocky terracotta pixel pet (12x8 grid, `character.js`), no accessories. Official lockup top-left, "AI character" label.
- Voice: Kokoro `af_heart` 1.05, not processed (silence trimmed, 8 ms edge fades). Music 20 dB under speech, 12 dB in gaps; -14 LUFS plus limiter (55 Hz high-pass); effects 3 dB lower under speech.
- Sound effects sit on the beats from `cues()` in `scene.html`, listed in the timeline.
- Captions: fixed box y 1448-1638, up to 4 words, timed by local openai/whisper `base.en`.
- Never move text being read; first frame reads as a cover; flashes are a QA fail.
- 30 fps, x264 slow CRF 18 High, lanczos, 192k AAC, bt709, under 14 MB. QA results: `QA <post>` notices on the GitHub Actions run.
- Engine change: bump `LOOK` in `job.py` (re-renders unpublished videos, clears approval).
