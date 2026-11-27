"""Runs in GitHub Actions. `check`: send repo drafts to HQ and count the queue. `render`: render and upload each.
Authenticates with the workflow's own OIDC token (no stored secret). Videos exist only in a temp folder."""
import hashlib, json, os, sys, tempfile, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

HQ = "https://vagent.online/hook/marketing"
UA = "vagent-marketing-render"
LOOK = "worlds-2"  # change when the look changes: HQ re-renders unpublished videos, which need approval again

def http(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HQ {e.code}: {e.read()[:200]!r}") from None

def token():
    url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"] + "&audience=vagent-marketing"
    return http(url, headers={"Authorization": "Bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})["value"]

def hq(body=None, raw=None, query=None):
    for attempt in range(4):  # uploads are safe to repeat; ride out short server errors
        try:
            return send(body, raw, query)
        except (RuntimeError, urllib.error.URLError, TimeoutError) as e:
            if attempt == 3 or str(e).startswith("HQ 4"):
                raise
            time.sleep(5 * (attempt + 1))

def send(body, raw, query):
    url = HQ + ("?" + urllib.parse.urlencode(query) if query else "")
    kind = "application/octet-stream" if raw is not None else "application/json"
    return http(url, raw if raw is not None else json.dumps(body).encode(),
                {"Authorization": "Bearer " + token(), "Content-Type": kind})

def main():
    if sys.argv[1] == "check":
        posts = [json.loads(f.read_text()) for f in sorted((Path(__file__).parent / "posts").glob("*.json"))]
        for attempt in range(20):  # a push can arrive before the new site code is live everywhere: wait for it
            if hq({"action": "seed", "posts": posts, "look": LOOK, "timer": os.environ.get("GITHUB_EVENT_NAME") == "schedule"}).get("sync") == 2:
                break
            if attempt == 19:
                raise RuntimeError("HQ is still running old code: deploy the site first")
            time.sleep(15)
        n = len(hq({"action": "queue"})["posts"])
        print("queued:", n)
        with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
            fh.write(f"queued={n}\n")
        return
    from render import render_video
    q = hq({"action": "queue"}); failed = 0
    for item in q["posts"]:
        ref = {"id": item["id"], "version": item["version"]}
        try:
            with tempfile.TemporaryDirectory() as tmp:  # removed as soon as the upload is done
                out = Path(tmp) / "video.mp4"
                render_video(item["post"], out, tmp)
                data = out.read_bytes()
                for n in range(0, (len(data) + q["chunk"] - 1) // q["chunk"]):
                    hq(raw=data[n * q["chunk"]:(n + 1) * q["chunk"]], query={"action": "chunk", "n": n, **ref})
                hq({"action": "complete", "sha": hashlib.sha256(data).hexdigest(), "size": len(data), **ref})
            print("ready for review:", item["id"], len(data))
        except Exception as e:  # report to HQ and carry on with the next post
            failed += 1; print("failed:", item["id"], type(e).__name__, e)
            print(f"::error title=Render {item['id']}::" + f"{type(e).__name__}: {e}".replace("%", "%25").replace("\n", "%0A")[:900], flush=True)
            hq({"action": "fail", "why": f"{type(e).__name__}: {e}", **ref})
    sys.exit(1 if failed else 0)

main()
