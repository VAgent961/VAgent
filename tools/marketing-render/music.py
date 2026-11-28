"""Background track generated in code (no licence to track), different for every video, ducked under the voice,
with that video's sound effects on the visual beats."""
import numpy as np
from sfx import hz, smooth, note, effect

def add(track, at, sound):
    if at < len(track):
        n = min(len(sound), len(track) - at); track[at:at + n] += sound[:n]

def bed(n, rate, s):
    out, beat = np.zeros(n), 60 / s["bpm"]
    rng = np.random.default_rng(s["bpm"])
    hiss = lambda d, decay: np.diff(rng.standard_normal(int(rate * d) + 1)) * np.exp(-np.arange(int(rate * d)) / rate * decay)
    for bar in range(int(n / rate / (4 * beat)) + 1):
        start, chord = bar * 4 * beat, s["chords"][bar % len(s["chords"])]
        t = np.arange(int(rate * 4.4 * beat)) / rate
        env = np.minimum(1, t / 0.35) * np.minimum(1, (t[-1] - t) / 0.4)
        add(out, int(start * rate), 0.04 * env * sum(np.sin(2 * np.pi * hz(m) * t) + 0.5 * np.sin(2 * np.pi * hz(m) * 1.004 * t) for m in chord))
        for step, which in enumerate(s["arp"]):
            add(out, int((start + step * beat / 2) * rate), 0.11 * note(s["wave"], hz(chord[which] + 12), rate, 0.4))
        for b in range(4):
            at = int((start + b * beat) * rate); half = int((start + (b + 0.5) * beat) * rate); style = s["drums"]
            t = np.arange(int(rate * 0.22)) / rate
            kick = np.sin(2 * np.pi * (48 * t + 3.2 * (1 - np.exp(-t * 30)))) * np.exp(-t * 18)
            if style in ("soft", "chip", "knock") or (style in ("pulse", "brush") and b % 2 == 0):
                add(out, at, 0.2 * kick)
            if style == "soft": add(out, half, 0.025 * hiss(0.06, 70))
            if style == "knock" and b % 2: add(out, at, 0.16 * note("wood", 420, rate, 0.1))
            if style == "pulse": add(out, half, 0.07 * note("sine", hz(chord[0]), rate, 0.25))
            if style == "chip": add(out, half, 0.03 * hiss(0.04, 90)); add(out, half + int(rate * beat / 4), 0.02 * hiss(0.03, 120))
            if style == "brush" and b % 2: add(out, at, 0.03 * hiss(0.12, 30))
            if style == "tick": add(out, half, 0.05 * note("wood", 1500, rate, 0.05))
    return out

def rms(x):
    return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0

def mix(voice, rate, cues, sound, under=1.0):
    """Voice is left untouched. Music sits 20 dB under it while she talks and rises to 12 dB under in the gaps."""
    n = len(voice)
    music = smooth(bed(n, rate, sound), rate, 5 / rate)  # gentle low-pass keeps the bed out of the way of speech
    talk = np.abs(voice) > 0.015
    level = rms(voice[talk]) or 0.1
    music *= under * level / (rms(music) or 1)
    hold = np.clip(smooth(talk.astype(float), rate, 0.35) * 6, 0, 1)  # ducking: look ahead, hold short pauses
    env = smooth(hold, rate, 0.3)
    low, high = 10 ** (-20 / 20), 10 ** (-12 / 20)
    fade = np.minimum(1, np.arange(n) / (rate * 0.35)) * np.minimum(1, np.arange(n)[::-1] / (rate * 1.2))
    out = voice.astype(float) + music * (high + (low - high) * env) * fade
    for j, c in enumerate(cues):
        s, gain, lead = effect(c["kind"], c.get("i", 0), sound, rate, 100 + j)
        s = s / (np.max(np.abs(s)) or 1)
        edge = min(len(s) // 2, int(rate * 0.004))
        if edge:  # no clicks at either end of an effect
            ramp = np.linspace(0, 1, edge); s = s.copy(); s[:edge] *= ramp; s[-edge:] *= ramp[::-1]
        at = max(0, int((c["t"] - lead) * rate))
        spoken = hold[at:at + len(s)]
        duck = 1 - 0.3 * (float(spoken.mean()) if len(spoken) else 0)  # about 3 dB lower while she is speaking
        add(out, at, under * level * gain * 1.6 * duck * s)
    return out.astype(np.float32)
