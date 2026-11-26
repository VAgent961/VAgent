"""Owner review page (reachable only through an SSH tunnel: compose binds it to the server's 127.0.0.1)."""
import html, json, os, re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

JOBS = Path(os.environ.get("MARKETING_DATA", "/data")) / "jobs"

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        m = re.fullmatch(r"/([a-z0-9-]+)\.mp4", self.path)
        if m:
            f = JOBS / m[1] / "video.mp4"
            if not f.is_file():
                return self.send_error(404)
            size = f.stat().st_size; a, b = 0, size - 1
            r = re.fullmatch(r"bytes=(\d+)-(\d*)", self.headers.get("Range", ""))
            if r:
                a = int(r[1]); b = min(int(r[2] or b), b)
                if a > b:
                    return self.send_error(416)
            self.send_response(206 if r else 200)
            self.send_header("Content-Type", "video/mp4"); self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(b - a + 1))
            if r:
                self.send_header("Content-Range", f"bytes {a}-{b}/{size}")
            self.end_headers()
            with open(f, "rb") as fh:
                fh.seek(a); self.wfile.write(fh.read(b - a + 1))
            return
        if self.path != "/":
            return self.send_error(404)
        body = "<meta charset=utf-8><meta name=viewport content='width=device-width'><title>Review</title>"
        for j in sorted(JOBS.glob("*/job.json")):
            d = json.loads(j.read_text()); p = d["post"]; i = html.escape(p["id"])
            body += (f"<h2>{i} ({d['status']})</h2><video src='/{i}.mp4' controls playsinline style='max-width:360px;width:100%'></video>"
                     f"<p>{html.escape(p['caption'])}<br>{html.escape(' '.join(p.get('hashtags', [])))}</p>")
        self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.end_headers()
        self.wfile.write(body.encode())

ThreadingHTTPServer(("0.0.0.0", 8787), H).serve_forever()
