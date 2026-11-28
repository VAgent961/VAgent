"""Lebanese Arabic voice: Microsoft's neural voices through edge-tts (no key, no charge), with real word timings.
Kokoro has no Arabic voice: reading through espeak's Arabic sounds is only the last resort, and is reported."""
import asyncio, subprocess, time
import numpy as np

RATE = 24000
VOICES = ("ar-LB-LaylaNeural", "ar-LB-RamiNeural")

async def stream(text, voice):
    import edge_tts
    mp3, words = bytearray(), []
    async for c in edge_tts.Communicate(text, voice, rate="+6%", boundary="WordBoundary").stream():
        if c["type"] == "audio":
            mp3 += c["data"]
        elif c["type"] == "WordBoundary":  # times are in 100 ns units
            words.append({"word": c["text"], "start": c["offset"] / 1e7, "end": (c["offset"] + c["duration"]) / 1e7})
    return bytes(mp3), words

def edge(text, voice):
    for attempt in range(3):
        try:
            mp3, words = asyncio.run(asyncio.wait_for(stream(text, voice), 40))
            pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", "-", "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"],
                                 input=mp3, capture_output=True, check=True).stdout
            audio = np.frombuffer(pcm, dtype=np.float32)
            if len(audio) < RATE // 2:
                raise RuntimeError("empty audio")
            return audio, words
        except Exception as e:
            if attempt == 2:
                raise
            print("edge-tts retry:", voice, type(e).__name__, e)
            time.sleep(3 * (attempt + 1))

def speak(lines, kokoro):
    """One voice for the whole video: every line is made by the same speaker, or the next one is tried."""
    for voice in VOICES:
        try:
            return voice, [edge(text, voice) for text in lines]
        except Exception as e:
            print(f"::warning title=edge-tts::{voice} failed: {type(e).__name__}: {e}"[:300], flush=True)
    print("::warning title=Voice fallback::edge-tts failed: Kokoro reads the Arabic (rough, check the sound before approving)", flush=True)
    out = []
    for text in lines:
        audio, rate = kokoro().create(text, voice="af_heart", speed=0.95, lang="ar")
        out.append((audio, []))
    return "kokoro-fallback", out
