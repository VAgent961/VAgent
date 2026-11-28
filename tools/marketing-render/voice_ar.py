"""Lebanese Arabic reel voice, locked to ar-SY-AmanyNeural (picked by the owner): Microsoft's neural voices through edge-tts (no key, no charge), with real word timings.
Arabic is only ever read by an Arabic neural voice: if none answers, the render fails (Kokoro does not speak Arabic)."""
import asyncio, re, subprocess, time
import numpy as np

RATE = 24000  # what the voices are made at; the master resamples once, to 48 kHz
VOICES = ("ar-SY-AmanyNeural",)  # locked: no other speaker, the render fails instead
SPEED, PITCH = "+5%", "+2Hz"  # the approved take, 05_edge_SY_Amany
TRIES = 4
GOOD, FLOOR = 0.85, 0.70  # transcribed share of a line: accept at once / the least that may be used
# Tech words kept in Latin letters on screen, spelled the way Beirut says them for the voice.
# functions/_autopilot.js allows exactly these in an Arabic spoken line (SAID_LATIN): change both together.
SAY = {"ai": "إِي آي", "agent": "إيجِنت", "agents": "إيجِنتس", "online": "أونلاين", "google": "غوغِل", "email": "إيميل",
       "website": "وِبسايت", "app": "آبّ", "dashboard": "داشبورد", "link": "لينك", "order": "أوردر", "instagram": "إنستغرام",
       "vagent": "ڤي إيجِنت", "claude": "كْلود", "message": "مَسِج", "system": "سيستِم"}
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

PAUSE = 0.55  # longest silence kept inside a line (audio_qa rejects over 0.75 s)

def squeeze(audio, words, rate=RATE):
    """Shorten over-long breaks inside a line and move the word timings with them."""
    hop = rate // 100
    quiet = np.array([np.abs(audio[i:i + hop]).max() < 0.003 for i in range(0, len(audio) - hop + 1, hop)], dtype=np.int8)
    edges = np.flatnonzero(np.diff(np.concatenate([[0], quiet, [0]])))
    keep, cuts = np.ones(len(audio), bool), []
    for a, b in zip(edges[::2] * hop, edges[1::2] * hop):
        extra = (b - a) - int(PAUSE * rate)
        if a and b < len(quiet) * hop and extra > 0:  # never the lead-in or the tail
            start = a + int(PAUSE * rate) // 2
            keep[start:start + extra] = False
            cuts.append((start / rate, extra / rate))
    moved = lambda t: t - sum(min(max(t - at, 0), n) for at, n in cuts)
    return audio[keep], [{**w, "start": moved(w["start"]), "end": moved(w["end"])} for w in words]

async def stream(text, voice, speed, pitch=PITCH):
    import edge_tts
    mp3, words = bytearray(), []
    async for c in edge_tts.Communicate(text, voice, rate=speed, pitch=pitch, boundary="WordBoundary").stream():
        if c["type"] == "audio":
            mp3 += c["data"]
        elif c["type"] == "WordBoundary":  # times are in 100 ns units
            words.append({"word": c["text"], "start": c["offset"] / 1e7, "end": (c["offset"] + c["duration"]) / 1e7})
    return bytes(mp3), words

def edge(text, voice, speed=SPEED):
    for attempt in range(TRIES):
        try:
            mp3, words = asyncio.run(asyncio.wait_for(stream(text, voice, speed), 40))
            pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", "-", "-f", "f32le", "-ac", "1", "-ar", str(RATE), "-"],
                                 input=mp3, capture_output=True, check=True).stdout
            audio = np.frombuffer(pcm, dtype=np.float32)
            if len(audio) < RATE // 2 or np.abs(audio).max() < 0.05 or not words:
                raise RuntimeError("empty or silent audio")
            return squeeze(audio, words)
        except Exception as e:
            if attempt == TRIES - 1:
                raise
            print("edge-tts retry:", voice, type(e).__name__, e, flush=True)
            time.sleep(2 ** (attempt + 1))

# ways to read one line, tried in order until the transcriber hears it well: (keep harakat, speed)
TAKES = ((True, SPEED), (False, SPEED), (True, "-4%"), (False, "-4%"))

def line(text, voice, judge):
    """The first take that sounds right, else the best one: (score, (audio, words))."""
    best, tried = None, set()
    for marks, speed in TAKES:
        said = spoken(text if marks else shown(text))
        if (said, speed) in tried:
            continue
        tried.add((said, speed))
        take = edge(said, voice, speed)
        score = judge(text, take[0]) if judge else 1.0
        if not best or score > best[0]:
            best = (score, take)
        if score >= GOOD:
            break
        print(f"retake: {voice} heard {score:.0%} of: {text}", flush=True)
    return best

def speak(lines, judge=None, skip=()):
    """One voice for the whole video: every line is made by the same speaker, or the next one is tried.
    `judge(text, audio)` returns the share of the line a transcriber hears; a line under FLOOR rejects the voice."""
    why = []
    for voice in VOICES:
        if voice in skip:
            continue
        try:
            takes = []
            for text in lines:
                score, take = line(text, voice, judge)
                if score < FLOOR:
                    raise RuntimeError(f"garbled ({score:.0%}): {text}")
                takes.append(take)
            return voice, takes
        except Exception as e:
            why.append(f"{voice}: {type(e).__name__}: {e}"[:150])
            print(f"::warning title=Arabic voice::{why[-1]}", flush=True)
    raise RuntimeError("No Arabic neural voice succeeded, nothing was rendered. " + " | ".join(why))
