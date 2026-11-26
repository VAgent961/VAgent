"""post dict -> 1080x1920 H.264 MP4. Kokoro-82M voice, HTML scene in headless Chromium, ffmpeg."""
import base64, json, os, subprocess, wave
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

def master(wav):
    """Static gain to -14 LUFS plus a peak limiter: no pumping, so the voice and music balance is kept."""
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(wav), "-af", "loudnorm=I=-14:TP=-1.5:print_format=json", "-f", "null", "-"],
                         capture_output=True, text=True, check=True).stderr
    gain = -14 - float(json.loads(log[log.rindex("{"):log.rindex("}") + 1])["input_i"])
    return f"volume={gain:.2f}dB,alimiter=limit=0.84:attack=4:release=60:level=false"

def render_video(post, out, tmp):
    from kokoro_onnx import Kokoro
    from playwright.sync_api import sync_playwright
    tts = Kokoro(str(MODELS / "kokoro-v1.0.onnx"), str(MODELS / "voices-v1.0.bin"))
    parts, scenes, t, rate = [], [], 0.0, 24000
    for n, sc in enumerate(post["scenes"]):
        audio, rate = tts.create(sc["say"], voice="af_heart", speed=1.05, lang="en-us")
        tail = 1.4 if n == len(post["scenes"]) - 1 else 0.3
        clip = np.concatenate([audio, np.zeros(int(rate * tail), dtype=audio.dtype)])
        words, groups = captions(sc["say"], t, audio, rate)
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
            page.goto((ROOT / "scene.html").as_uri())
            page.evaluate("d => setup(d)", data)
            for i in range(len(data["level"])):
                page.evaluate("i => seek(i)", i)
                enc.stdin.write(page.screenshot(type="jpeg", quality=96))
            browser.close()
        enc.stdin.close()
        if enc.wait():
            raise RuntimeError("ffmpeg failed")
    finally:
        if enc.poll() is None:
            enc.kill()
