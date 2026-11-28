"""Automated Arabic audio check, free and local (faster-whisper). Used twice: on each spoken line before it is
accepted, and on the finished MP4 before an Arabic reel may reach review.
`python3 audio_qa.py file.mp4 voice.wav script.txt` (one script line per row) checks a finished file."""
import difflib, json, os, re, subprocess, sys
from pathlib import Path
import numpy as np
import voice_ar

MODEL = os.environ.get("WHISPER_AR", "large-v3-turbo")
SR = 48000
LINE_MIN, WORD_MIN, ALL_MIN = 0.70, 0.5, 0.80  # share of the script's letters the transcriber hears
SNR_MIN = 15.0      # dB: the voice against everything added to it (music, effects, limiter, codec) while it talks
PAUSE_MAX = 0.75    # seconds of silence inside a line
JOIN_MAX = 1.0      # seconds of silence between two lines
_model = None

def decode(path, rate=SR, stereo=False):
    # stereo files are averaged: ffmpeg's float "-ac 1" adds the channels 3 dB hot, which reads as clipping
    mono = ["-af", "pan=mono|c0=0.5*c0+0.5*c1"] if stereo else ["-ac", "1"]
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-vn", "-f", "f32le", *mono, "-ar", str(rate), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)

def resample(audio, rate, to):
    if rate == to:
        return np.asarray(audio, dtype=np.float32)
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "f32le", "-ac", "1", "-ar", str(rate), "-i", "-", "-f", "f32le", "-ar", str(to), "-"],
                         input=np.asarray(audio, dtype=np.float32).tobytes(), capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)

def hear(audio, rate):
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        root = os.environ.get("MODELS")
        _model = WhisperModel(MODEL, device="cpu", compute_type="int8", download_root=str(Path(root) / "faster-whisper") if root else None)
    segments, _ = _model.transcribe(resample(audio, rate, 16000), language="ar", beam_size=5, temperature=0, condition_on_previous_text=False)
    return " ".join(s.text.strip() for s in segments)

def letters(text):
    """Spelling differences that sound the same are folded; Latin tech words are written as they are said."""
    text = voice_ar.HARAKAT.sub("", voice_ar.spoken(text).lower())
    text = voice_ar.HARAKAT.sub("", text).translate(str.maketrans("أإآٱىةؤئڤپگ", "اااايهويفبك", "ـ"))
    return [w for w in (re.sub(r"[\W_]", "", w) for w in text.split()) if w]

def compare(script, heard):
    """(share of the script's letters heard, words that came out garbled). Spaces are ignored: dialect word splits vary."""
    words, got = letters(script), "".join(letters(heard))
    want = "".join(words)
    if not want:
        return 1.0, []
    hit = np.zeros(len(want))
    for a, _, n in difflib.SequenceMatcher(None, want, got, autojunk=False).get_matching_blocks():
        hit[a:a + n] = 1
    bad, at = [], 0
    for w in words:
        if len(w) >= 3 and hit[at:at + len(w)].mean() < WORD_MIN:
            bad.append(w)
        at += len(w)
    return float(hit.mean()), bad

def gaps(audio, rate, level=0.003):
    """Silent stretches (start, end) in seconds."""
    hop = int(rate * 0.01)
    quiet = np.array([np.abs(audio[i:i + hop]).max() < level for i in range(0, len(audio) - hop + 1, hop)])
    edges = np.flatnonzero(np.diff(np.concatenate([[0], quiet.astype(np.int8), [0]])))
    return [(a * 0.01, b * 0.01) for a, b in zip(edges[::2], edges[1::2])]

def offset(clean, final, rate, at, span=4.0, reach=0.3):
    """How late the final audio runs against the clean voice around `at` seconds."""
    a, n, r = int(at * rate), int(span * rate), int(reach * rate)
    x = clean[a:a + n]
    y = np.pad(final, (r, r + n))[a:a + len(x) + 2 * r]
    size = len(x) + len(y)
    c = np.fft.irfft(np.fft.rfft(y, size) * np.conj(np.fft.rfft(x, size)), size)[:2 * r + 1]
    return (int(np.argmax(c)) - r) / rate

def snr(clean, final, rate):
    """Voice against the rest, in dB, over the 50 ms blocks where it talks; the gain may change from block to block
    only as far as one fixed level explains, so a pumping or distorting limiter counts as noise."""
    n = min(len(clean), len(final)); hop = int(rate * 0.05)
    x, y = clean[:n - n % hop].reshape(-1, hop), final[:n - n % hop].reshape(-1, hop)
    talk = np.sqrt((x ** 2).mean(1)) > 0.03
    if not talk.any():
        return 0.0
    x, y = x[talk].astype(float), y[talk].astype(float)
    g = (x * y).sum() / ((x * x).sum() or 1)
    return float(10 * np.log10(((g * x) ** 2).sum() / (((y - g * x) ** 2).sum() or 1e-12)))

def mix_defects(clean, final, rate=SR):
    """Level and timing faults of the finished soundtrack against the clean voice track (same rate)."""
    out, facts = [], {}
    clipped = int((np.abs(final) >= 0.995).sum())
    if clipped:
        out.append(f"clipping: {clipped} samples at full scale")
    length = len(clean) / rate
    late = [offset(clean, final, rate, t) for t in (0.0, max(0.0, length / 2 - 2), max(0.0, length - 5))]
    facts["lag_ms"] = [round(v * 1000) for v in late]
    if max(map(abs, late)) > 0.06 or max(late) - min(late) > 0.03:
        out.append(f"A/V drift: voice offset {facts['lag_ms']} ms")
    shift = int(late[0] * rate)
    aligned = final[shift:] if shift >= 0 else np.pad(final, (-shift, 0))
    # the master's high-pass only turns the phase of the voice: give the reference the same one
    ref = np.frombuffer(subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "f32le", "-ac", "1", "-ar", str(rate), "-i", "-", "-af", "highpass=f=55", "-f", "f32le", "-"],
                                       input=np.asarray(clean, dtype=np.float32).tobytes(), capture_output=True, check=True).stdout, dtype=np.float32)
    facts["snr_db"] = round(snr(ref, aligned, rate), 1)
    if facts["snr_db"] < SNR_MIN:
        out.append(f"voice buried or distorted: {facts['snr_db']} dB, needs {SNR_MIN}")
    dead = [g for g in gaps(final, rate, 0.001) if g[1] - g[0] > 0.3 and g[1] < length - 1.5]
    if dead:
        out.append(f"dead air at {dead[0][0]:.1f}s ({dead[0][1] - dead[0][0]:.1f}s)")
    return out, facts

def voice_defects(clean, rate, spans):
    """Lagging pauses in the clean voice track. spans: (start, end) of each line's voice."""
    out = []
    for i, (a, b) in enumerate(spans):
        for s, e in gaps(clean[int(a * rate):int(b * rate)], rate):
            if s > 0.15 and e < b - a - 0.25 and e - s > PAUSE_MAX:
                out.append(f"line {i + 1}: {e - s:.1f}s silence inside the line")
    for s, e in gaps(clean, rate):
        if s > 0.2 and e < spans[-1][1] - 0.3 and e - s > JOIN_MAX:
            out.append(f"{e - s:.1f}s gap at {s:.1f}s")
    return out

def check(mp4, voice, rate, spans, lines):
    """Everything wrong with a finished Arabic video (empty list = pass), and the measurements."""
    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,duration,start_time", "-of", "json", str(mp4)],
                                      capture_output=True, text=True, check=True).stdout)["streams"]
    av = {s["codec_type"]: (float(s["start_time"]), float(s["duration"])) for s in probe}
    out = []
    if "audio" not in av or "video" not in av:
        return ["missing audio or video stream"], {}
    if abs(av["audio"][0] - av["video"][0]) > 0.05 or abs(av["audio"][1] - av["video"][1]) > 0.12:
        out.append(f"A/V drift: video {av['video']} audio {av['audio']}")
    final = decode(mp4, stereo=True)
    clean = resample(voice, rate, SR)
    mixed, facts = mix_defects(clean, final)
    out += mixed + voice_defects(clean, SR, spans)
    heard = hear(final, SR)
    facts["heard"], facts["match"] = heard, round(compare(" ".join(lines), heard)[0], 3)
    if facts["match"] < ALL_MIN:
        out.append(f"transcript matches only {facts['match']:.0%} of the script: {heard[:200]}")
    facts["lines"] = []
    for i, ((a, b), text) in enumerate(zip(spans, lines)):
        score, bad = compare(text, hear(final[int(max(0, a - 0.1) * SR):int((b + 0.15) * SR)], SR))
        facts["lines"].append(round(score, 2))
        if score < LINE_MIN:
            out.append(f"line {i + 1} garbled ({score:.0%}): {' '.join(bad)}")
    return out, facts

if __name__ == "__main__":
    lines = [l for l in Path(sys.argv[3]).read_text().splitlines() if l.strip()]
    voice = decode(sys.argv[2])
    bad, facts = check(sys.argv[1], voice, SR, [(0, len(voice) / SR)] if len(lines) == 1 else json.loads(os.environ["SPANS"]), lines)
    print(json.dumps({"defects": bad, **facts}, ensure_ascii=False, indent=1))
    sys.exit(1 if bad else 0)
