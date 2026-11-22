#!/usr/bin/env python3
"""YouTubeD local backend.

Serves the static site from the repo root and exposes a small yt-dlp API:

    GET  /api/health          -> {"ok": true, "version": "..."}
    POST /api/info   {url}    -> title, thumbnail, duration, max quality
    POST /api/start  {url, mode:"audio"|"video"} -> {"id": "..."}
    GET  /api/status?id=...   -> {"state", "progress", "title", "filename", "error"}
    GET  /api/file?id=...     -> the finished file, as an attachment

Run:  python3 youtubed/server.py [--port 8099] [--host 127.0.0.1]
Then: http://localhost:8099/youtubed/

Files land in a per-job temp directory and are removed after JOB_TTL.
Binds to loopback by default; it is a downloader, not a public proxy.
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(tempfile.gettempdir(), "youtubed")
YTDLP = shutil.which("yt-dlp") or os.path.expanduser("~/.local/bin/yt-dlp")

MAX_BODY = 8192
MAX_JOBS = 2
JOB_TTL = 2 * 60 * 60
MAX_RUNTIME = 45 * 60
STALL_LIMIT = 240

jobs = {}
jobs_lock = threading.Lock()
slots = threading.Semaphore(MAX_JOBS)
pct_re = re.compile(r"\[download\]\s+(\d+(?:\.\d+)?)%")
ansi_re = re.compile(r"\x1b\[[0-9;]*m")

reload_hits = {}
blocked_until = {}
guard_lock = threading.Lock()
RELOAD_WINDOW = 3.0
RELOAD_LIMIT = 3
BLOCK_SECONDS = 10.0


def clean(text, limit=400):
    text = ansi_re.sub("", str(text or "")).strip()
    text = re.sub(r"\s+", " ", text)
    return text[:limit]


def ytdlp_version():
    try:
        p = subprocess.run([YTDLP, "--version"], capture_output=True, text=True, timeout=20)
        return clean(p.stdout or p.stderr, 40) or "unknown"
    except Exception:
        return None


def extract_info(url):
    cmd = [
        YTDLP, "-J", "--no-playlist", "--no-warnings",
        "--socket-timeout", "20", "--retries", "3", url,
    ]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        raise RuntimeError(clean(p.stderr.splitlines()[-1] if p.stderr else "extract failed"))
    data = json.loads(p.stdout)
    if data.get("_type") == "playlist" or data.get("entries"):
        entries = [e for e in (data.get("entries") or []) if e]
        if not entries:
            raise RuntimeError("empty playlist")
        data = entries[0]

    heights, abrs = set(), set()
    for f in data.get("formats") or []:
        if f.get("vcodec") not in (None, "none") and f.get("height"):
            heights.add(int(f["height"]))
        if f.get("acodec") not in (None, "none") and f.get("abr"):
            abrs.add(float(f["abr"]))
    return {
        "id": data.get("id"),
        "title": data.get("title") or "Untitled",
        "uploader": data.get("uploader") or data.get("channel") or data.get("extractor_key") or "",
        "duration": data.get("duration"),
        "thumbnail": data.get("thumbnail"),
        "webpage_url": data.get("webpage_url") or url,
        "extractor": data.get("extractor_key") or "",
        "maxHeight": max(heights) if heights else None,
        "maxAudioKbps": round(max(abrs)) if abrs else None,
    }


def build_command(url, mode, outdir):
    base = [
        YTDLP, "--no-playlist", "--no-warnings", "--newline", "--no-mtime",
        "--socket-timeout", "20", "--retries", "3", "--fragment-retries", "3",
        "-o", os.path.join(outdir, "%(title).150B [%(id)s].%(ext)s"),
    ]
    if mode == "audio":
        return base + [
            "-f", "ba/b", "-x", "--audio-format", "mp3",
            "--audio-quality", "320K", url,
        ]
    return base + [
        "-f", "bv*+ba/b", "--merge-output-format", "mp4", url,
    ]


def find_output(outdir):
    best = None
    for name in os.listdir(outdir):
        path = os.path.join(outdir, name)
        if not os.path.isfile(path) or name.endswith((".part", ".ytdl", ".temp")):
            continue
        size = os.path.getsize(path)
        if size and (best is None or size > best[1]):
            best = (path, size)
    return best[0] if best else None


def worker(job, url, mode):
    proc = None
    outdir = os.path.join(WORK, job["id"])
    os.makedirs(outdir, exist_ok=True)

    def set_state(**kw):
        with jobs_lock:
            job.update(kw)

    def watchdog():
        started = time.time()
        last = job.get("updated", started)
        while proc is not None and proc.poll() is None:
            time.sleep(10)
            now = time.time()
            if now - started > MAX_RUNTIME or now - job.get("updated", last) > STALL_LIMIT:
                try:
                    proc.kill()
                except Exception:
                    pass
                return

    with slots:
        set_state(state="running", progress=0, updated=time.time())
        try:
            cmd = build_command(url, mode, outdir)
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, errors="replace", bufsize=1,
            )
            threading.Thread(target=watchdog, daemon=True).start()

            for line in proc.stdout:
                line = clean(line)
                if not line:
                    continue
                m = pct_re.search(line)
                if m:
                    set_state(progress=min(99.0, float(m.group(1))), updated=time.time())
                elif line.startswith(("[Merger]", "[ExtractAudio]", "[VideoConvertor]")):
                    set_state(progress=99.0, stage="finishing", updated=time.time())

            err = clean(proc.stderr.read() if proc.stderr else "")
            code = proc.wait()
            if code != 0:
                raise RuntimeError(err.split("ERROR: ")[-1] if err else f"yt-dlp exited {code}")

            path = find_output(outdir)
            if not path:
                raise RuntimeError("yt-dlp finished but produced no file")
            set_state(
                state="done", progress=100.0, stage="done",
                filename=os.path.basename(path), path=path,
                size=os.path.getsize(path), updated=time.time(),
            )
        except Exception as exc:
            set_state(state="error", error=clean(exc) or "download failed", updated=time.time())
        finally:
            if proc is not None and proc.poll() is None:
                try:
                    proc.kill()
                except Exception:
                    pass


def start_job(url, mode):
    jid = uuid.uuid4().hex
    job = {
        "id": jid, "state": "queued", "progress": 0.0, "stage": "queued",
        "url": url, "mode": mode, "created": time.time(), "updated": time.time(),
    }
    with jobs_lock:
        jobs[jid] = job
    threading.Thread(target=worker, args=(job, url, mode), daemon=True).start()
    return jid


def sweeper():
    while True:
        time.sleep(300)
        cutoff = time.time() - JOB_TTL
        with jobs_lock:
            dead = [jid for jid, j in jobs.items() if j.get("created", 0) < cutoff]
            for jid in dead:
                jobs.pop(jid, None)
        for jid in dead:
            shutil.rmtree(os.path.join(WORK, jid), ignore_errors=True)
        now = time.time()
        with guard_lock:
            for ip in [k for k, v in reload_hits.items() if not v or now - v[-1] > 30]:
                reload_hits.pop(ip, None)
            for ip in [k for k, v in blocked_until.items() if v <= now]:
                blocked_until.pop(ip, None)


def valid_url(url):
    if not isinstance(url, str):
        return False
    url = url.strip()
    if not (8 <= len(url) <= 2048):
        return False
    parts = urlparse(url)
    return parts.scheme in ("http", "https") and bool(parts.netloc)


class Handler(SimpleHTTPRequestHandler):
    server_version = "YouTubeD/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        if not str(fmt).startswith(("GET /api/status", "GET /api/health")):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.cors()
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            raise ValueError("bad request size")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            raise ValueError("invalid JSON body")

    @staticmethod
    def is_document(path):
        return path.endswith("/") or path.endswith((".html", ".htm"))

    def reload_guard(self):
        """Three reloads (Cache-Control: max-age=0) inside 3s -> /dontspam/."""
        ip = self.client_address[0]
        now = time.time()
        is_reload = "max-age=0" in (self.headers.get("Cache-Control") or "").lower()
        blocked = False
        with guard_lock:
            if blocked_until.get(ip, 0) > now:
                blocked = True
            elif is_reload:
                hits = [t for t in reload_hits.get(ip, []) if now - t < RELOAD_WINDOW]
                hits.append(now)
                if len(hits) >= RELOAD_LIMIT:
                    blocked_until[ip] = now + BLOCK_SECONDS
                    reload_hits.pop(ip, None)
                    blocked = True
                else:
                    reload_hits[ip] = hits
            if ip in blocked_until and blocked_until[ip] <= now:
                blocked_until.pop(ip, None)
        if blocked:
            self.send_response(302)
            self.send_header("Location", "/dontspam/")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", "0")
            self.end_headers()
        return blocked

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/info":
                body = self.read_json()
                url = (body.get("url") or "").strip()
                if not valid_url(url):
                    return self.json(400, {"error": "that does not look like a link"})
                return self.json(200, extract_info(url))

            if path == "/api/start":
                body = self.read_json()
                url = (body.get("url") or "").strip()
                mode = body.get("mode")
                if not valid_url(url):
                    return self.json(400, {"error": "that does not look like a link"})
                if mode not in ("audio", "video"):
                    return self.json(400, {"error": "pick audio or video"})
                return self.json(200, {"id": start_job(url, mode)})
        except ValueError as exc:
            return self.json(400, {"error": str(exc)})
        except RuntimeError as exc:
            return self.json(502, {"error": str(exc)})
        except subprocess.TimeoutExpired:
            return self.json(504, {"error": "the site took too long to answer"})
        except Exception as exc:
            return self.json(500, {"error": clean(exc) or "internal error"})

        return self.json(404, {"error": "not found"})

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            version = ytdlp_version()
            return self.json(200, {"ok": bool(version), "version": version})

        if path == "/api/status":
            jid = (parse_qs(parsed.query).get("id") or [""])[0]
            with jobs_lock:
                job = jobs.get(jid)
                if not job:
                    return self.json(404, {"error": "unknown job"})
                payload = {k: job.get(k) for k in
                           ("id", "state", "progress", "stage", "title", "filename", "size", "error")}
            return self.json(200, payload)

        if path == "/api/file":
            jid = (parse_qs(parsed.query).get("id") or [""])[0]
            with jobs_lock:
                job = jobs.get(jid)
            if not job or job.get("state") != "done" or not job.get("path"):
                return self.json(404, {"error": "file not ready"})
            filepath = job["path"]
            if not os.path.isfile(filepath):
                return self.json(410, {"error": "file expired"})
            name = os.path.basename(filepath)
            size = os.path.getsize(filepath)
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(size))
            self.send_header("Content-Disposition",
                             "attachment; filename=\"%s\"; filename*=UTF-8''%s"
                             % (name.encode("ascii", "replace").decode(), quote(name)))
            self.send_header("Cache-Control", "no-store")
            self.cors()
            self.end_headers()
            with open(filepath, "rb") as fh:
                shutil.copyfileobj(fh, self.wfile, 1 << 16)
            return

        if path.startswith("/api/"):
            return self.json(404, {"error": "not found"})

        if self.is_document(path) and not path.startswith("/dontspam"):
            if self.reload_guard():
                return

        if "/." in path:
            self.send_error(404)
            return

        if path.endswith((".html", ".htm")) or path.endswith("/"):
            self.extensions_map = dict(self.extensions_map, **{".html": "text/html; charset=utf-8"})
        return super().do_GET()

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    ap = argparse.ArgumentParser(description="YouTubeD backend + static server")
    ap.add_argument("--port", type=int, default=8099)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()

    if not os.path.isfile(YTDLP) and not shutil.which(YTDLP):
        sys.exit("yt-dlp not found. install it: pipx install yt-dlp   (or: sudo apt install yt-dlp)")

    os.makedirs(WORK, exist_ok=True)
    threading.Thread(target=sweeper, daemon=True).start()

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"YouTubeD serving {ROOT}")
    print(f"  site:  http://{args.host}:{args.port}/")
    print(f"  app:   http://{args.host}:{args.port}/youtubed/")
    print(f"  yt-dlp {ytdlp_version() or 'missing'}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
