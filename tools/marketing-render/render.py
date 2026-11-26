"""post dict -> 1080x1920 H.264 MP4. Kokoro-82M voice, HTML scene in headless Chromium, ffmpeg."""
import base64, difflib, json, os, re, subprocess, sys, wave
from pathlib import Path
import numpy as np
from music import mix

FPS = 30
ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parent.parent / "assets"
MODELS = Path(os.environ.get("MODELS", "/models"))

def uri(p):
    return "data:image/svg+xml;base64," + base64.b64encode(p.read_bytes()).decode()

def captions(text, start, audio, rate):
    """Word timings: sentence breaks are pinned to the real pauses in the clip, words inside a phrase are
    spread by length. Groups are short enough to stay on one or two caption lines."""
    loud = np.flatnonzero(np.abs(audio) > 0.02)
    a, b = (loud[0] / rate, loud[-1] / rate) if len(loud) else (0.0, len(audio) / rate)
    words = text.split()
    gaps = [(loud[i] / rate, loud[i + 1] / rate) for i in np.flatnonzero(np.diff(loud) > rate * 0.12)]
    ends = [i for i, w in enumerate(words[:-1]) if w[-1] in ".?!,;:"]
    spans = [(a, b, 0, len(words) - 1)]
    if ends and len(gaps) >= len(ends):  # the longest pauses are the punctuation breaks
        cut = sorted(sorted(gaps, key=lambda g: g[0] - g[1])[:len(ends)])
        spans = list(zip([a] + [g[1] for g in cut], [g[0] for g in cut] + [b], [0] + [i + 1 for i in ends], ends + [len(words) - 1]))
    timed = []
    for s0, s1, i0, i1 in spans:
        weight = [len(w) + 2 for w in words[i0:i1 + 1]]
        done = 0
        for w, n in zip(words[i0:i1 + 1], weight):
            timed.append({"w": w, "t": start + s0 + (s1 - s0) * done / sum(weight), "end": start + s0 + (s1 - s0) * (done + n) / sum(weight)})
            done += n
    groups, first = [], 0
    for i, w in enumerate(words):
        full = i + 1 < len(words) and len(" ".join(words[first:i + 2])) > 22
        if w[-1] in ".?!," or i - first == 3 or full or i == len(words) - 1:
            groups.append([first, i]); first = i + 1
    return timed, groups

_whisper = None

def align(words, audio, rate, start):
    """Move the estimated word timings onto what local openai/whisper hears. Returns the share matched;
    below 60% (or without whisper) the estimate is kept."""
    global _whisper
    try:
        import whisper
    except ImportError:
        return 0.0
    _whisper = _whisper or whisper.load_model("base.en", device="cpu", download_root=str(MODELS / "whisper"))
    pcm = np.interp(np.arange(0, len(audio), rate / 16000), np.arange(len(audio)), audio).astype(np.float32)
    heard = [w for s in _whisper.transcribe(pcm, language="en", word_timestamps=True, fp16=False, temperature=0,
                                            condition_on_previous_text=False)["segments"] for w in s.get("words", [])]
    key = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
    blocks = difflib.SequenceMatcher(None, [key(w["w"]) for w in words], [key(h["word"]) for h in heard], autojunk=False).get_matching_blocks()
    found = {a + i: heard[b + i] for a, b, n in blocks for i in range(n)}
    share = len(found) / len(words)
    if share >= 0.6:
        known = sorted(found)
        times = np.interp([w["t"] for w in words], [words[i]["t"] for i in known], [start + found[i]["start"] for i in known])
        for i, w in enumerate(words):  # unmatched words keep their spacing between the matched ones
            w["t"] = float(max(times[i], words[i - 1]["t"] + 0.04 if i else start))
        for i, w in enumerate(words):
            end = start + found[i]["end"] if i in found else (words[i + 1]["t"] if i + 1 < len(words) else w["end"])
            w["end"] = float(max(end, w["t"] + 0.08))
    return share

def timeline(scenes, total, page):
    """The plan in video-director's schema, with the on-screen headline boxes measured in the browser."""
    texts = []
    for i, role in ((0, "hook"), (len(scenes) - 1, "term")):
        s = scenes[i]
        at = s["start"] + (0 if i == 0 else 0.9)
        texts.append({"id": role, "text": s["title"], "role": role, "from": round(at, 3), "to": round(s["start"] + s["dur"], 3),
                      **page.evaluate("i => headline(i)", int((at + 0.1) * FPS))})
    return {"meta": {"w": 1080, "h": 1920, "fps": FPS, "dur": round(total, 3), "clock": "voice"},
            "scenes": [{"id": f"s{i}", "start": round(s["start"], 3), "end": round(total if i == len(scenes) - 1 else s["start"] + s["dur"], 3),
                        "transitionOut": {"why": "next spoken line"}} for i, s in enumerate(scenes)],
            "hero": {"t": round(scenes[-1]["start"], 3), "what": "closing card"},
            "captions": [{"text": " ".join(w["w"] for w in s["words"][a:b + 1]), "from": s["words"][a]["t"], "to": s["words"][b]["end"]}
                         for s in scenes for a, b in s["groups"]],
            "texts": texts}

def director(script, *args):
    return subprocess.run([sys.executable, str(ROOT / "vendor" / "video-director" / script), *map(str, args)], capture_output=True, text=True)

def note(title, text):
    """A GitHub Actions annotation, so the QA result is readable on the run page."""
    print(f"::notice title={title}::" + text.replace("%", "%25").replace("\n", "%0A"), flush=True)

def serve(route):
    f = (ROOT / route.request.url.split("scene.local/", 1)[1]).resolve()
    if ROOT not in f.parents or not f.is_file():
        return route.abort()
    kind = {".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript"}.get(f.suffix, "application/octet-stream")
    route.fulfill(body=f.read_bytes(), content_type=kind)

def master(wav):
    """Static gain to -14 LUFS plus a peak limiter: no pumping, so the voice and music balance is kept."""
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(wav), "-af", "loudnorm=I=-14:TP=-1.5:print_format=json", "-f", "null", "-"],
                         capture_output=True, text=True, check=True).stderr
    gain = -14 - float(json.loads(log[log.rindex("{"):log.rindex("}") + 1])["input_i"])
    chain = lambda g: f"volume={g:.2f}dB,alimiter=limit=0.79:attack=4:release=60:level=false"
    # second pass: make up whatever the limiter took away
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(wav), "-af", chain(gain) + ",loudnorm=I=-14:TP=-1.5:print_format=json", "-f", "null", "-"],
                         capture_output=True, text=True, check=True).stderr
    return chain(gain + (-14 - float(json.loads(log[log.rindex("{"):log.rindex("}") + 1])["input_i"])))

def render_video(post, out, tmp):
    from kokoro_onnx import Kokoro
    from playwright.sync_api import sync_playwright
    tts = Kokoro(str(MODELS / "kokoro-v1.0.onnx"), str(MODELS / "voices-v1.0.bin"))
    parts, scenes, t, rate, heard = [], [], 0.0, 24000, []
    for n, sc in enumerate(post["scenes"]):
        audio, rate = tts.create(sc["say"], voice="af_heart", speed=1.05, lang="en-us")
        tail = 1.4 if n == len(post["scenes"]) - 1 else 0.3
        clip = np.concatenate([audio, np.zeros(int(rate * tail), dtype=audio.dtype)])
        words, groups = captions(sc["say"], t, audio, rate)
        heard.append(align(words, audio, rate, t))
        scenes.append({**sc, "start": t, "voice": len(audio) / rate, "dur": len(clip) / rate, "words": words, "groups": groups})
        t += len(clip) / rate; parts.append(clip)
    voice = np.concatenate(parts)
    if t > 45:
        raise RuntimeError(f"video is {t:.0f}s: shorten the script (target 25 to 35s)")
    print(f"length {t:.1f}s")
    hop = rate / FPS
    level = [float(np.sqrt(np.mean(voice[int(i * hop):int((i + 1) * hop)] ** 2))) for i in range(int(len(voice) / hop))]
    peak = float(np.percentile(level, 95)) or 1
    level = [min(1.0, v / peak) for v in level]
    level = [(0.2 * level[max(0, i - 1)] + 0.6 * v + 0.2 * level[min(len(level) - 1, i + 1)]) for i, v in enumerate(level)]
    data = {"fps": FPS, "total": t, "scenes": scenes, "level": level,
            "mark": uri(ASSETS / "brand" / "mark-dark.svg"), "lockup": uri(ASSETS / "brand" / "lockup-dark.svg")}
    wav = Path(tmp) / "mix.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes((np.clip(mix(voice, rate, [s["start"] for s in scenes[1:]]), -1, 1) * 32767).astype("<i2").tobytes())
    rate_cap = min(3600, int(14e6 * 8 / t / 1000) - 192)  # stay under the HQ upload limit
    # frames are piped straight into ffmpeg: no frame files on disk
    enc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", str(FPS), "-i", "-",
         "-i", str(wav), "-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p",
         "-c:v", "libx264", "-preset", "slow", "-tune", "animation", "-crf", "19", "-maxrate", f"{rate_cap}k", "-bufsize", f"{rate_cap * 2}k",
         "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
         "-af", master(wav), "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "160k",
         "-movflags", "+faststart", "-shortest", str(out)], stdin=subprocess.PIPE)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1080, "height": 1920})
            page.route("http://scene.local/**", serve)
            page.goto("http://scene.local/scene.html")
            page.wait_for_function("() => window.FX")
            page.evaluate("d => setup(d)", data)
            plan = Path(tmp) / "timeline.json"
            plan.write_text(json.dumps(timeline(scenes, t, page)))
            pre = director("check_timeline.py", plan)
            if pre.returncode:
                raise RuntimeError("timeline check: " + (pre.stdout + pre.stderr)[-250:])
            for i in range(len(data["level"])):
                page.evaluate("i => seek(i)", i)
                enc.stdin.write(page.screenshot(type="jpeg", quality=96))
            browser.close()
        enc.stdin.close()
        if enc.wait():
            raise RuntimeError("ffmpeg failed")
        qa = director("qa_video.py", out, "--out", Path(tmp) / "qa", "--beats", plan)
        report = Path(tmp) / "qa" / "report.json"
        if not report.exists():
            raise RuntimeError("QA could not run: " + qa.stderr[-250:])
        checks = json.loads(report.read_text())["checks"]
        bad = [f"{c['level']} {c['check']}: {c['detail']}" for c in checks if c["level"] != "PASS"]
        note(f"QA {post['id']}", "\n".join([f"{len(checks) - len(bad)} of {len(checks)} checks passed; captions matched by whisper {np.mean(heard):.0%}; length {t:.1f}s", *bad,
                                             *[x.strip() for x in pre.stdout.splitlines() if "WARN" in x][:5]]))
        if qa.returncode:  # a failed check never reaches review
            raise RuntimeError("QA: " + " | ".join(x for x in bad if x.startswith("FAIL"))[:280])
    finally:
        if enc.poll() is None:
            enc.kill()
