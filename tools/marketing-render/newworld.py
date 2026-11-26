"""Writes worlds/<name>.mjs and .json for a video that has none: a repeatable combination of palette, backdrop,
layout, camera, motion, transition and sound picked from the name, so every video still gets its own look.
Usage: python3 newworld.py <name>   (the renderer also calls this by itself)."""
import hashlib, json, random, sys
from pathlib import Path

WORLDS = Path(__file__).resolve().parent / "worlds"

def write(name):
    r = random.Random(hashlib.sha256(name.encode()).hexdigest())
    look = {"palette": r.randrange(7), "motif": r.randrange(6), "layout": r.randrange(5), "camera": r.randrange(5), "enter": r.randrange(6),
            "word": r.randrange(4), "cut": r.randrange(6), "cell": r.choice([10, 15, 18, 27]), "every": r.choice([1, 2]), "radius": r.choice([8, 28, 48, 70])}
    root = r.randrange(40, 52)
    chords = [[root + step + i for i in r.choice([(0, 4, 7, 11), (0, 3, 7, 10), (0, 5, 7, 12)])] for step in (0, r.choice([5, 8]), r.choice([3, 10]), 7)]
    sound = {"bpm": r.randrange(72, 132), "chords": chords, "arp": [r.randrange(4) for _ in range(8)],
             "wave": r.choice(["bell", "wood", "square", "pluck", "felt", "sine"]), "drums": r.choice(["soft", "knock", "pulse", "chip", "brush", "tick"]),
             "cut": r.choice(["shutter", "blocks", "sonar", "glitch", "sparkle", "paper"]), "base": r.randrange(64, 84)}
    if not (WORLDS / f"{name}.mjs").is_file():
        (WORLDS / f"{name}.mjs").write_text(f"import make from './auto.mjs';\nexport default make({json.dumps(look)});\n")
    if not (WORLDS / f"{name}.json").is_file():
        (WORLDS / f"{name}.json").write_text(json.dumps({"tail": r.choice([0.22, 0.28, 0.34, 0.4]), "sound": sound}) + "\n")

if __name__ == "__main__":
    write(sys.argv[1])
