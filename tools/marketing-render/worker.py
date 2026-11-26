#!/usr/bin/env python3
"""Server-side post queue: render -> review -> scheduled -> published. Media is deleted on publish or decline."""
import argparse, fcntl, hashlib, json, os, re, shutil, sys
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

DATA = Path(os.environ.get("MARKETING_DATA", "/data"))
TZ = ZoneInfo("Asia/Beirut")
DAYS = (1, 3, 5)  # Tue, Thu, Sat
BANNED = re.compile(r"whats\s?app|wa\.me|\bfree(ly)?\b|\bcosts?\b|\bpric(e|es|ed|ing)\b|[$€£]|\bpaid\b|\bcheap|"
                    r"\bdiscount|\bsubscri|\bfees?\b|\bafford|واتس|مجان|سعر|أسعار|كلفة|تكلفة", re.I)
MEDIA_KEYS = ("scenes",)  # editing these needs a new render

def lint(post):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,60}", post.get("id", "")):
        sys.exit("bad post id")
    if not post.get("scenes") or not post.get("caption"):
        sys.exit("post needs scenes and caption")
    text = json.dumps({k: v for k, v in post.items() if k != "id"}, ensure_ascii=False)
    hit = BANNED.search(text)
    if hit:
        sys.exit(f"content rule broken: '{hit.group(0)}'")

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def digest(job):
    return hashlib.sha256((json.dumps(job["post"], sort_keys=True) + job["video_sha"]).encode()).hexdigest()

def jdir(i):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,60}", i):
        sys.exit("bad post id")
    return DATA / "jobs" / i

def load(i):
    f = jdir(i) / "job.json"
    if not f.exists():
        sys.exit(f"no such job: {i}")
    return json.loads(f.read_text())

def save(job):
    f = jdir(job["post"]["id"]) / "job.json"
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(job, indent=1, ensure_ascii=False))
    tmp.replace(f)

def log(i, event, **extra):
    with open(DATA / "events.jsonl", "a") as fh:
        fh.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(), "id": i, "event": event, **extra}) + "\n")

def next_slot(now, taken):
    d = now.astimezone(TZ).date()
    for n in range(366):
        day = d + timedelta(days=n)
        slot = datetime.combine(day, time(19), TZ)
        if day.weekday() in DAYS and slot > now and slot.isoformat() not in taken:
            return slot.isoformat()
    sys.exit("no slot")

def render(post):
    from render import render_video  # heavy imports only inside the container
    d = jdir(post["id"])
    d.mkdir(parents=True, exist_ok=True)
    try:
        render_video(post, d / "video.mp4")
    except BaseException:
        shutil.rmtree(d, ignore_errors=True)
        raise
    return sha(d / "video.mp4")

def cmd_render(a):
    post = json.loads(Path(a.file).read_text()); lint(post)
    if (jdir(post["id"]) / "job.json").exists():
        sys.exit("job exists: use edit or decline")
    job = {"post": post, "version": 1, "status": "review", "video_sha": render(post)}
    save(job); log(post["id"], "rendered"); print("review:", post["id"])

def cmd_edit(a):
    job = load(a.id); post = json.loads(Path(a.file).read_text()); lint(post)
    if post["id"] != a.id:
        sys.exit("id cannot change")
    if post == job["post"]:
        return print("no change")
    redo = any(post.get(k) != job["post"].get(k) for k in MEDIA_KEYS)
    # approval is cleared first, so a failed re-render can never leave an approved post behind
    for k in ("approved", "slot", "dry_run_at"):
        job.pop(k, None)
    job.update(post=post, version=job["version"] + 1, status="review")
    if redo:
        job["video_sha"] = render(post)
    save(job); log(a.id, "edited", rerendered=redo); print("review again:", a.id)

def cmd_approve(a):
    job = load(a.id)
    if job["status"] != "review":
        sys.exit(f"status is {job['status']}")
    lint(job["post"])
    if sha(jdir(a.id) / "video.mp4") != job["video_sha"]:
        sys.exit("video changed since render")
    taken = {json.loads(f.read_text()).get("slot") for f in (DATA / "jobs").glob("*/job.json")}
    job.update(status="scheduled", slot=next_slot(datetime.now(timezone.utc), taken),
               approved={"by": a.by, "hash": digest(job)})
    save(job); log(a.id, "approved", by=a.by); print("scheduled", job["slot"])

def remove(i, event, **extra):
    load(i); shutil.rmtree(jdir(i)); log(i, event, **extra); print(event, "- media deleted:", i)

def cmd_decline(a):
    remove(a.id, "declined", by=a.by)

def cmd_published(a):
    """Called only after Instagram confirms the post (media id)."""
    job = load(a.id)
    if job["status"] != "scheduled" or job.get("approved", {}).get("hash") != digest(job):
        sys.exit("not an approved scheduled post")
    remove(a.id, "published", media_id=a.media_id)

def cmd_publish_due(a):
    dry = os.environ.get("MARKETING_DRY_RUN", "true").lower() != "false"
    if not dry:
        sys.exit("live publishing is not wired yet (n8n + Instagram): keep MARKETING_DRY_RUN=true")
    now = datetime.now(timezone.utc)
    for f in (DATA / "jobs").glob("*/job.json"):
        job = json.loads(f.read_text()); i = job["post"]["id"]
        if job["status"] != "scheduled" or job.get("dry_run_at") or datetime.fromisoformat(job["slot"]) > now:
            continue
        if job["approved"]["hash"] != digest(job) or sha(f.parent / "video.mp4") != job["video_sha"]:
            log(i, "blocked", why="hash mismatch"); print("blocked", i); continue
        job["dry_run_at"] = now.isoformat(); save(job); log(i, "dry_run"); print("DRY RUN would publish", i)

def cmd_list(a):
    for f in sorted((DATA / "jobs").glob("*/job.json")):
        j = json.loads(f.read_text()); print(j["post"]["id"], j["status"], f"v{j['version']}", j.get("slot", ""))

def main(argv=None):
    p = argparse.ArgumentParser(); s = p.add_subparsers(required=True)
    def add(name, fn, *args):
        c = s.add_parser(name); c.set_defaults(fn=fn)
        for x in args:
            c.add_argument(x, **({"required": True} if x.startswith("--") else {}))
    add("render", cmd_render, "file"); add("edit", cmd_edit, "id", "file")
    add("approve", cmd_approve, "id", "--by"); add("decline", cmd_decline, "id", "--by")
    add("published", cmd_published, "id", "--media-id"); add("publish-due", cmd_publish_due); add("list", cmd_list)
    a = p.parse_args(argv)
    (DATA / "jobs").mkdir(parents=True, exist_ok=True)
    with open(DATA / ".lock", "w") as lock:  # one state change at a time
        fcntl.flock(lock, fcntl.LOCK_EX)
        a.fn(a)

if __name__ == "__main__":
    main()
