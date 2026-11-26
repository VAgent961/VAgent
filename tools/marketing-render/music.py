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

def smooth(x, rate, seconds):
    win = max(1, int(rate * seconds))
    c = np.cumsum(np.concatenate([np.zeros(win // 2 + 1), x, np.zeros(win - win // 2 - 1)]))
    return (c[win:] - c[:-win]) / win

def rms(x):
    return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0

def mix(voice, rate, cuts):
    """Voice is left untouched. Music sits 20 dB under it while she talks and rises to 12 dB under in the gaps."""
    n = len(voice)
    music = smooth(bed(n, rate), rate, 5 / rate)  # gentle low-pass keeps the bed out of the way of speech
    talk = np.abs(voice) > 0.015
    level = rms(voice[talk]) or 0.1
    music *= level / (rms(music) or 1)
    # ducking: look ahead 0.15 s, hold through short pauses, smooth both ways
    hold = np.clip(smooth(talk.astype(float), rate, 0.35) * 6, 0, 1)
    env = smooth(hold, rate, 0.3)
    low, high = 10 ** (-20 / 20), 10 ** (-12 / 20)
    gain = high + (low - high) * env
    fade = np.minimum(1, np.arange(n) / (rate * 0.35)) * np.minimum(1, np.arange(n)[::-1] / (rate * 1.2))
    out = voice.astype(float) + music * gain * fade
    rng = np.random.default_rng(3)
    for i, c in enumerate(cuts):
        m = int(rate * 0.46)
        noise = smooth(rng.standard_normal(m), rate, 12 / rate)
        sweep = noise / (np.max(np.abs(noise)) or 1) * np.sin(np.linspace(0, np.pi, m)) ** 3
        add(out, max(0, int((c - 0.28) * rate)), level * (0.5 if i % 2 else 0.28) * sweep)
        t = np.arange(int(rate * 0.16)) / rate  # soft pop as the next headline lands
        add(out, int((c + 0.08) * rate), level * 0.35 * np.sin(2 * np.pi * (520 * t + 900 * t * t)) * np.exp(-t * 34) * np.minimum(1, t / 0.003))
    if cuts:  # two-note chime on the closing card
        t = np.arange(int(rate * 0.9)) / rate
        for j, note in enumerate((79, 84)):
            add(out, int((cuts[-1] + 0.2 + j * 0.13) * rate), level * 0.22 * np.sin(2 * np.pi * hz(note) * t) * np.exp(-t * 5) * np.minimum(1, t / 0.005))
    return out.astype(np.float32)
