"""Lebanese Arabic voice: Microsoft's neural voices through edge-tts (no key, no charge), with real word timings.
Arabic is only ever read by an Arabic neural voice: if none answers, the render fails (Kokoro does not speak Arabic)."""
import asyncio, re, subprocess, time
import numpy as np

RATE = 24000  # what the voices are made at; the master resamples once, to 48 kHz
VOICES = ("ar-LB-RamiNeural", "ar-LB-LaylaNeural", "ar-SY-LaithNeural")  # Lebanese first, Levantine backup
TRIES = 4
# Tech words kept in Latin letters on screen, spelled the way Beirut says them for the voice.
# functions/_autopilot.js allows exactly these in an Arabic spoken line (SAID_LATIN): change both together.
SAY = {"ai": "إِي آي", "agent": "إيجِنت", "agents": "إيجِنتس", "online": "أونلاين", "google": "غوغِل", "email": "إيميل",
       "website": "وِبسايت", "app": "آبّ", "dashboard": "داشبورد", "link": "لينك", "order": "أوردر", "instagram": "إنستغرام",
       "vagent": "ڤي إيجِنت", "message": "مَسِج", "system": "سيستِم"}
HARAKAT = re.compile("[ً-ْٰ]")

def shown(text):
    """The on-screen caption: the line without the pronunciation marks."""
    return HARAKAT.sub("", text)

def spoken(text):
    """The line the voice reads: no links, symbols or emoji; Latin tech words in Arabic letters."""
    text = re.sub(r"(https?://|www\.)\S+|\S+\.(online|com|net)\b", " ", text)
    text = re.sub(r"(?:(ال)ـ?[\s-]*)?([A-Za-z]+)", lambda m: (m[1] or "") + SAY.get(m[2].lower(), m[2]), text)
    text = re.sub(r"[^\w\sً-ْٰ.,!?:;،؛؟%']|_|ـ", " ", text)
    return " ".join(text.split())

async def stream(text, voice):
    import edge_tts
    mp3, words = bytearray(), []
    async for c in edge_tts.Communicate(text, voice, rate="+5%", pitch="+2Hz", boundary="WordBoundary").stream():
        if c["type"] == "audio":
            mp3 += c["data"]
        elif c["type"] == "WordBoundary":  # times are in 100 ns units
            words.append({"word": c["text"], "start": c["offset"] / 1e7, "end": (c["offset"] + c["duration"]) / 1e7})
    return bytes(mp3), words

def edge(text, voice):
    for attempt in range(TRIES):
        try:
            mp3, words = asyncio.run(asyncio.wait_for(stream(text, voice), 40))
            pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", "-", "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"],
                                 input=mp3, capture_output=True, check=True).stdout
            audio = np.frombuffer(pcm, dtype=np.float32)
            if len(audio) < RATE // 2 or np.abs(audio).max() < 0.05 or not words:
                raise RuntimeError("empty or silent audio")
            return audio, words
        except Exception as e:
            if attempt == TRIES - 1:
                raise
            print("edge-tts retry:", voice, type(e).__name__, e, flush=True)
            time.sleep(2 ** (attempt + 1))

def speak(lines):
    """One voice for the whole video: every line is made by the same speaker, or the next one is tried."""
    why = []
    for voice in VOICES:
        try:
            return voice, [edge(spoken(text), voice) for text in lines]
        except Exception as e:
            why.append(f"{voice}: {type(e).__name__}: {e}"[:150])
            print(f"::warning title=edge-tts::{why[-1]}", flush=True)
    raise RuntimeError("No Arabic neural voice succeeded, nothing was rendered. " + " | ".join(why))
