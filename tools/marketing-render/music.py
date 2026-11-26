"""Original background track generated in code (no licence to track), ducked under the voice, plus soft cut whooshes."""
import numpy as np

BPM = 96
CHORDS = [(48, 55, 59, 64), (45, 52, 55, 60), (41, 48, 52, 57), (43, 50, 55, 59)]  # Cmaj7 Am7 Fmaj7 G

def hz(note):
    return 440.0 * 2 ** ((note - 69) / 12)

def add(track, at, sound):
    if at < len(track):
        n = min(len(sound), len(track) - at); track[at:at + n] += sound[:n]

def bed(n, rate):
    out, beat = np.zeros(n), 60 / BPM
    rng = np.random.default_rng(7)
    for bar in range(int(n / rate / (4 * beat)) + 1):
        start, chord = bar * 4 * beat, CHORDS[bar % len(CHORDS)]
        t = np.arange(int(rate * 4.4 * beat)) / rate
        env = np.minimum(1, t / 0.35) * np.minimum(1, (t[-1] - t) / 0.4)
        pad = sum(np.sin(2 * np.pi * hz(m) * t) + 0.5 * np.sin(2 * np.pi * hz(m) * 1.004 * t) for m in chord)
        add(out, int(start * rate), 0.045 * pad * env)
        for step in range(8):  # plucked arpeggio
            t = np.arange(int(rate * 0.5)) / rate
            f = hz(chord[(0, 2, 1, 3, 2, 1, 3, 2)[step]] + 12)
            pluck = (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 11) * np.minimum(1, t / 0.004)
            add(out, int((start + step * beat / 2) * rate), 0.13 * pluck)
        for b in range(4):  # soft kick on each beat, light shaker off the beat
            t = np.arange(int(rate * 0.22)) / rate
            add(out, int((start + b * beat) * rate), 0.22 * np.sin(2 * np.pi * (48 * t + 3.2 * (1 - np.exp(-t * 30)))) * np.exp(-t * 18))
            s = np.diff(rng.standard_normal(int(rate * 0.06) + 1)) * np.exp(-np.arange(int(rate * 0.06)) / rate * 70)
            add(out, int((start + (b + 0.5) * beat) * rate), 0.025 * s)
    return out

def mix(voice, rate, cuts):
    n = len(voice)
    music = bed(n, rate)
    # ducking: follow the voice (look slightly ahead, slow release) and pull the music down under it
    win = int(rate * 0.25)
    env = np.convolve((np.abs(voice) > 0.015).astype(float), np.ones(win) / win, mode="same")
    env = np.convolve(np.clip(env * 2.5, 0, 1), np.ones(win) / win, mode="same")
    music *= 0.55 * (1 - 0.75 * env)
    fade = np.minimum(1, np.arange(n) / (rate * 0.4)) * np.minimum(1, np.arange(n)[::-1] / (rate * 1.2))
    out = voice.astype(float) + music * fade
    rng = np.random.default_rng(3)
    for c in cuts:
        m = int(rate * 0.36)
        noise = np.convolve(rng.standard_normal(m), np.ones(14) / 14, mode="same")
        add(out, max(0, int((c - 0.2) * rate)), 0.07 * noise * np.sin(np.linspace(0, np.pi, m)) ** 3)
    return out.astype(np.float32)
