"""State rules, no video tools needed: python3 -B test_worker.py"""
import json, os, tempfile, unittest
from datetime import datetime
from pathlib import Path
import worker

POST = json.loads((Path(__file__).parent / "posts/voice-receptionist.json").read_text())

class T(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory(); worker.DATA = Path(self.t.name)
        def fake(post):
            d = worker.jdir(post["id"]); d.mkdir(parents=True, exist_ok=True); (d / "video.mp4").write_bytes(b"v")
            return worker.sha(d / "video.mp4")
        worker.render = fake; self.i = POST["id"]; self.run_("render", self.file(POST))
    def tearDown(self): self.t.cleanup()
    def file(self, p):
        f = Path(self.t.name) / "p.json"; f.write_text(json.dumps(p)); return str(f)
    def run_(self, *a): worker.main(list(a))
    def test_edit_resets_approval(self):
        self.run_("approve", self.i, "--by", "h")
        self.run_("edit", self.i, self.file({**POST, "caption": "New words"}))
        j = worker.load(self.i); self.assertEqual((j["status"], j["version"], "approved" in j), ("review", 2, False))
    def test_decline_deletes(self):
        self.run_("decline", self.i, "--by", "h"); self.assertFalse(worker.jdir(self.i).exists())
    def test_publish(self):
        with self.assertRaises(SystemExit): self.run_("published", self.i, "--media-id", "1")
        self.run_("approve", self.i, "--by", "h")
        j = worker.load(self.i); j["slot"] = "2020-01-02T19:00:00+02:00"; worker.save(j)
        self.run_("publish-due"); self.assertTrue((worker.jdir(self.i) / "video.mp4").exists())
        self.run_("published", self.i, "--media-id", "1"); self.assertFalse(worker.jdir(self.i).exists())
    def test_rules(self):
        for bad in ("It is free", "Low prices", "Message us on WhatsApp", "Only $5"):
            with self.assertRaises(SystemExit): worker.lint({**POST, "caption": bad})
        worker.lint(POST)
    def test_slots_dst(self):
        s = worker.next_slot(datetime.fromisoformat("2026-03-27T00:00:00+00:00"), set())
        self.assertEqual(s, "2026-03-28T19:00:00+02:00")
        self.assertEqual(worker.next_slot(datetime.fromisoformat("2026-03-29T00:00:00+00:00"), set()), "2026-03-31T19:00:00+03:00")

if __name__ == "__main__":
    unittest.main()
