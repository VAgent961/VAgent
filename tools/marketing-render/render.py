"""post dict -> 1080x1920 H.264 MP4. Kokoro-82M voice, HTML scene in headless Chromium, ffmpeg."""
import base64, os, re, subprocess, wave
from pathlib import Path
import numpy as np

FPS = 30
ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parent.parent / "assets"
MODELS = Path(os.environ.get("MODELS", "/models"))

def uri(p):
    return "data:image/svg+xml;base64," + base64.b64encode(p.read_bytes()).decode()

def render_video(post, out, tmp):
    from kokoro_onnx import Kokoro
    from playwright.sync_api import sync_playwright
    tts = Kokoro(str(MODELS / "kokoro-v1.0.onnx"), str(MODELS / "voices-v1.0.bin"))
    parts, scenes, t, rate = [], [], 0.0, 24000
    for n, sc in enumerate(post["scenes"]):
        audio, rate = tts.create(sc["say"], voice="af_heart", speed=1.05, lang="en-us")
        tail = 1.4 if n == len(post["scenes"]) - 1 else 0.25
        clip = np.concatenate([audio, np.zeros(int(rate * tail), dtype=audio.dtype)])
        scenes.append({**sc, "start": t, "voice": len(audio) / rate})
        t += len(clip) / rate; parts.append(clip)
    audio = np.concatenate(parts)
    if t > 90:
        raise RuntimeError("video longer than 90 seconds: shorten the script")
    hop = rate / FPS
    level = [float(np.sqrt(np.mean(audio[int(i * hop):int((i + 1) * hop)] ** 2))) for i in range(int(len(audio) / hop))]
    peak = max(level) or 1
    # the headset is the same drawing the public call page uses
    headset = re.search(r"const HEADSET = '(<svg.*?</svg>)';", (ASSETS / "voice-agent.js").read_text()).group(1)
    data = {"scenes": scenes, "level": [v / peak for v in level], "headset": headset,
            "face": {k: uri(ASSETS / "char" / f"r6-{k}.svg") for k in ("idle", "blink", "listen", "think", "talk1", "talk2", "talk3")},
            "mark": uri(ASSETS / "brand" / "mark-dark.svg"), "lockup": uri(ASSETS / "brand" / "lockup-dark.svg")}
    wav = Path(tmp) / "voice.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
    # frames are piped straight into ffmpeg: no frame files on disk
    enc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", str(FPS), "-i", "-",
         "-i", str(wav), "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-maxrate", "4M", "-bufsize", "8M",
         "-pix_fmt", "yuv420p", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000", "-c:a", "aac", "-b:a", "128k",
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
