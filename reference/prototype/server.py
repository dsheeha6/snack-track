"""Tiny stdlib server for the SNACK TRACK calorie app.

Serves index.html and a JSON API backed by data/log.json.
"""
import json
import os
import re
import uuid
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import parse as parse_mod
import suggest as suggest_mod

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
DATA_FILE = os.path.join(DATA_DIR, "log.json")
PORT = int(os.environ.get("SNACK_PORT", "4701"))

DEFAULT_DATA = {
    "goals": {"calories": 2200, "protein": 165, "carbs": 220, "fat": 70},
    "entries": [],
}


def load():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(DATA_FILE):
        save(DEFAULT_DATA)
        return json.loads(json.dumps(DEFAULT_DATA))
    with open(DATA_FILE, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    data.setdefault("goals", dict(DEFAULT_DATA["goals"]))
    data.setdefault("entries", [])
    return data


def save(data):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
    os.replace(tmp, DATA_FILE)


def num(v, default=0):
    try:
        return round(float(v), 1)
    except (TypeError, ValueError):
        return default


def normalize_entry(raw):
    date = str(raw.get("date") or datetime.now().strftime("%Y-%m-%d"))
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        date = datetime.now().strftime("%Y-%m-%d")
    meal = str(raw.get("meal") or "snacks").lower()
    if meal not in ("breakfast", "lunch", "dinner", "snacks"):
        meal = "snacks"
    return {
        "id": raw.get("id") or uuid.uuid4().hex[:10],
        "date": date,
        "meal": meal,
        "name": str(raw.get("name") or "mystery snack").strip()[:120],
        "qty": str(raw.get("qty") or "").strip()[:80],
        "calories": int(num(raw.get("calories"))),
        "protein": num(raw.get("protein")),
        "carbs": num(raw.get("carbs")),
        "fat": num(raw.get("fat")),
        "note": str(raw.get("note") or "").strip()[:200],
        "ts": raw.get("ts") or datetime.now().isoformat(timespec="seconds"),
    }


def add_entries(raw_list):
    data = load()
    added = [normalize_entry(r) for r in raw_list]
    data["entries"].extend(added)
    data["entries"].sort(key=lambda e: (e["date"], e["ts"]))
    save(data)
    return added


class Handler(BaseHTTPRequestHandler):
    server_version = "SnackTrack/1.0"

    def log_message(self, fmt, *args):  # quieter console
        if "api" in (self.path or ""):
            super().log_message(fmt, *args)

    # --- helpers -------------------------------------------------
    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, name, ctype):
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            self.send_json({"error": "not found"}, 404)
            return
        with open(path, "rb") as fh:
            body = fh.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}

    # --- routes --------------------------------------------------
    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            self.send_file("index.html", "text/html; charset=utf-8")
        elif path == "/api/data":
            data = load()
            data["today"] = datetime.now().strftime("%Y-%m-%d")
            self.send_json(data)
        elif path == "/api/suggest":
            q = parse_qs(urlparse(self.path).query)
            data = load()
            date = (q.get("date") or [datetime.now().strftime("%Y-%m-%d")])[0]
            meal = (q.get("meal") or [""])[0] or None
            batch = int((q.get("batch") or ["0"])[0] or 0)
            no_cook = (q.get("nocook") or ["0"])[0] in ("1", "true", "yes")
            cutoff = (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=6)).strftime("%Y-%m-%d")
            recent = [e["name"] for e in data["entries"] if cutoff <= e["date"] <= date]
            self.send_json(suggest_mod.suggest(
                data, date, meal=meal, batch=batch, no_cook=no_cook, recent_names=recent
            ))
        elif path == "/api/health":
            self.send_json({"ok": True, "port": PORT})
        else:
            self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        path = self.path.split("?")[0]
        payload = self.read_json()
        if path == "/api/parse":
            meal = str(payload.get("meal") or "snacks")
            self.send_json(parse_mod.parse_text(load(), payload.get("text") or "", meal))
        elif path == "/api/entries":
            items = payload.get("entries") if isinstance(payload, dict) else None
            if items is None:
                items = [payload]
            added = add_entries(items)
            self.send_json({"ok": True, "added": added})
        elif path == "/api/entries/delete":
            data = load()
            ids = set(payload.get("ids") or ([payload["id"]] if payload.get("id") else []))
            before = len(data["entries"])
            data["entries"] = [e for e in data["entries"] if e["id"] not in ids]
            save(data)
            self.send_json({"ok": True, "removed": before - len(data["entries"])})
        elif path == "/api/entries/update":
            data = load()
            target = payload.get("id")
            for i, e in enumerate(data["entries"]):
                if e["id"] == target:
                    merged = dict(e)
                    merged.update({k: v for k, v in payload.items() if k != "id"})
                    data["entries"][i] = normalize_entry({**merged, "id": target})
                    break
            save(data)
            self.send_json({"ok": True})
        elif path == "/api/goals":
            data = load()
            g = data["goals"]
            for key in ("calories", "protein", "carbs", "fat"):
                if key in payload:
                    g[key] = int(num(payload[key]))
            save(data)
            self.send_json({"ok": True, "goals": g})
        else:
            self.send_json({"error": "not found"}, 404)


def main():
    load()
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"SNACK TRACK running -> http://localhost:{PORT}")
    print(f"log file: {DATA_FILE}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("bye")


if __name__ == "__main__":
    main()
