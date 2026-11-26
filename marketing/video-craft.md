# Video craft (use for every change to `tools/marketing-render/`)
- Presenter: Vee, the girl terracotta pet with a black bow (`character.js`). Official lockup top-left, "AI character" label stays.
- Hierarchy, top to bottom: progress segments, logo, eyebrow, headline (max 2 lines), one demo card, pet + voice dock, captions. One focal point per scene.
- Safe zones (1080x1920): captions in the fixed box y 1448-1638; nothing important below it.
- Motion: ease out on entry, short ease in on exit, stagger lists, camera push per scene, layered sweep on every other cut. Never move text the viewer is reading. The first frame must read as a cover.
- Captions: up to 4 words / 22 characters, spoken word highlighted without reflow, sentence breaks pinned to real pauses.
- Audio: Kokoro `af_heart` 1.05, voice not processed. Music 20 dB under speech, 12 dB under in gaps. Static gain to -14 LUFS plus limiter.
- Export: 30 fps, x264 slow CRF 19, bt709, under 14 MB.
- Changing the look: bump `LOOK` in `job.py` (re-renders unpublished videos and clears approval). Check still frames before release; videos render only on the server.
