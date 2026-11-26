"""post dict -> 1080x1920 H.264 MP4. Kokoro-82M voice, HTML scene in headless Chromium, ffmpeg."""
import base64, os, subprocess, wave
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
    """Word timings spread over the spoken part of the clip (by word length), grouped for on-screen captions."""
    loud = np.flatnonzero(np.abs(audio) > 0.02)
    a, b = (loud[0] / rate, loud[-1] / rate) if len(loud) else (0.0, len(audio) / rate)
    words = text.split()
    weight = [len(w) + 2 + (5 if w[-1] in ".?!" else 3 if w[-1] in ",;:" else 0) for w in words]
    done, timed, groups, first = 0, [], [], 0
    for i, w in enumerate(words):
        timed.append({"w": w, "t": start + a + (b - a) * done / sum(weight)}); done += weight[i]
        if w[-1] in ".?!," or i - first == 3 or i == len(words) - 1:
            groups.append([first, i]); first = i + 1
    return timed, groups

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
    peak = max(level) or 1
    data = {"fps": FPS, "total": t, "scenes": scenes, "level": [v / peak for v in level],
            "mark": uri(ASSETS / "brand" / "mark-dark.svg"), "lockup": uri(ASSETS / "brand" / "lockup-dark.svg")}
    wav = Path(tmp) / "mix.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes((np.clip(mix(voice, rate, [s["start"] for s in scenes[1:]]), -1, 1) * 32767).astype("<i2").tobytes())
    # frames are piped straight into ffmpeg: no frame files on disk
    enc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", str(FPS), "-i", "-",
         "-i", str(wav), "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-maxrate", "2800k", "-bufsize", "6M",
         "-pix_fmt", "yuv420p", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "128k",
         "-movflags", "+faststart", "-shortest", str(out)], stdin=subprocess.PIPE)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1080, "height": 1920})
            page.goto((ROOT / "scene.html").as_uri())
            page.evaluate("d => setup(d)", data)
            for i in range(len(data["level"])):
                page.evaluate("i => seek(i)", i)
                enc.stdin.write(page.screenshot(type="jpeg", quality=90))
            browser.close()
        enc.stdin.close()
        if enc.wait():
            raise RuntimeError("ffmpeg failed")
    finally:
        if enc.poll() is None:
            enc.kill()
