"""Per-video sound effects, synthesized in code: every world has its own instrument and transition sound,
and each effect is placed on a visual beat reported by the scene."""
import numpy as np

def hz(note):
    return 440.0 * 2 ** ((note - 69) / 12)

def smooth(x, rate, seconds):
    win = max(1, int(rate * seconds))
    c = np.cumsum(np.concatenate([np.zeros(win // 2 + 1), x, np.zeros(win - win // 2 - 1)]))
    return (c[win:] - c[:-win]) / win

def note(wave, f, rate, dur=0.3):
    t = np.arange(int(rate * dur)) / rate
    p = 2 * np.pi * f * t
    attack = np.minimum(1, t / 0.004)
    if wave == "bell":
        s = (np.sin(p) + 0.45 * np.sin(2.76 * p) * np.exp(-t * 14)) * np.exp(-t * 9)
    elif wave == "wood":
        s = (np.sin(p) + 0.6 * np.sin(3.9 * p) * np.exp(-t * 60)) * np.exp(-t * 26)
    elif wave == "square":
        s = 0.45 * np.sign(np.sin(p)) * np.exp(-t * 15)
    elif wave == "pluck":
        s = (np.sin(p) + 0.35 * np.sin(2 * p) + 0.15 * np.sin(4 * p) * np.exp(-t * 30)) * np.exp(-t * 13)
    elif wave == "felt":
        s = (np.sin(p) + 0.2 * np.sin(2 * p)) * np.exp(-t * 7)
        attack = np.minimum(1, t / 0.018)
    else:  # sine ping
        s = np.sin(p) * np.exp(-t * 6)
    return s * attack * np.minimum(1, (dur - t) / 0.02)

def noise(rate, dur, seed, soft):
    n = smooth(np.random.default_rng(seed).standard_normal(int(rate * dur)), rate, soft / rate)
    return n / (np.max(np.abs(n)) or 1)

def transition(style, rate, seed, base):
    """Returns (sound, seconds it starts before the cut)."""
    if style == "shutter":
        n = noise(rate, 0.46, seed, 6); t = np.arange(len(n)) / rate
        return 0.7 * n * (np.sin(2 * np.pi * 26 * t) > 0) * np.sin(np.linspace(0, np.pi, len(n))), 0.24
    if style == "blocks":
        out = np.zeros(int(rate * 0.55))
        for i in range(6):
            k = note("wood", hz(base - 19 + i * 3), rate, 0.14); at = int(rate * i * 0.07); out[at:at + len(k)] += 0.8 * k
        return out, 0.3
    if style == "sonar":
        t = np.arange(int(rate * 0.65)) / rate
        return np.sin(2 * np.pi * (hz(base) * t - 220 * t * t)) * np.exp(-t * 5) * np.minimum(1, t / 0.01), 0.22
    if style == "glitch":
        t = np.arange(int(rate * 0.45)) / rate
        steps = hz(base - 12 + np.random.default_rng(seed).integers(0, 24, 15)[(t * 32).astype(int)])
        return 0.35 * np.sign(np.sin(2 * np.pi * np.cumsum(steps) / rate)) * np.sin(np.pi * t / 0.45), 0.24
    if style == "sparkle":
        out = np.zeros(int(rate * 0.7))
        for i, m in enumerate((0, 4, 7, 12, 16)):
            k = note("bell", hz(base + m), rate, 0.35); at = int(rate * i * 0.06); out[at:at + len(k)] += 0.55 * k
        return out, 0.26
    if style == "paper":
        n = noise(rate, 0.5, seed, 3); t = np.arange(len(n)) / rate
        return 0.8 * (n - smooth(n, rate, 0.002)) * np.sin(np.pi * t / 0.5) ** 2 * (0.6 + 0.4 * np.sin(2 * np.pi * 13 * t)), 0.28
    raise ValueError(f"unknown transition sound {style}")

def effect(kind, i, sound, rate, seed):
    """One effect for a visual beat. Returns (sound, level relative to the voice, lead in seconds)."""
    w, base = sound["wave"], sound["base"]
    seq = lambda notes, gap, dur: sum(np.pad(note(w, hz(base + m), rate, dur), (int(rate * gap * j), int(rate * gap * (len(notes) - 1 - j)))) for j, m in enumerate(notes))
    if kind == "cut":
        s, lead = transition(sound["cut"], rate, seed, base)
        return s, 0.42, lead
    if kind == "title":
        return note(w, hz(base - 5), rate, 0.22), 0.26, 0
    if kind == "msg":
        return seq((0, 7), 0.07, 0.2), 0.3, 0
    if kind == "item":
        return note(w, hz(base + (0, 2, 4, 7)[i % 4]), rate, 0.25), 0.3, 0
    if kind == "type":
        n = noise(rate, 0.03, seed + i, 3)
        return n * np.exp(-np.arange(len(n)) / rate * 140), 0.12, 0
    if kind == "tap":
        return note("wood", hz(base - 24), rate, 0.1), 0.4, 0
    if kind == "press":
        return seq((0, 4, 7, 12), 0.055, 0.35), 0.36, 0
    if kind == "alert":
        return seq((-11, -17), 0.13, 0.3), 0.45, 0
    if kind == "cta":
        return seq((0, 7, 12, 19), 0.1, 0.7), 0.32, 0
    raise ValueError(f"unknown beat kind {kind}")
