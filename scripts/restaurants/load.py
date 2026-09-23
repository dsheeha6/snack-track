"""Load data/restaurants/*.jsonl into public.restaurant_chains / restaurant_items.

Replaces each chain's rows wholesale (delete then insert), so a menu item a
chain dropped does not linger. Uses the service_role key over PostgREST; the
tables are read-only to clients by RLS.

usage: python load.py [slug ...]   (no args = every file)
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "evals"))
import run  # noqa: E402  (for load_env_local, which handles UTF-16 .env.local)

from common import OUT  # noqa: E402

# Spellings people type that the automatic variants below don't produce.
EXTRA_ALIASES = {
    "mcdonalds": ["mcds", "mickey ds", "mickey d's", "micky d's", "maccas"],
    "chick-fil-a": ["chickfila", "chik fil a", "chic fil a", "cfa"],
    "burger-king": ["bk"],
    "kfc": ["kentucky fried chicken"],
    "dunkin": ["dunkin donuts", "dunkins"],
    "taco-bell": ["tbell"],
    "in-n-out-burger": ["in n out", "innout", "in and out"],
    "raising-canes": ["canes", "cane's"],
    "panera-bread": ["panera"],
    "pf-changs": ["pf changs", "pei wei"],
    "cheesecake-factory": ["cheesecake factory"],
    "buffalo-wild-wings": ["bdubs", "bww", "b dubs"],
    "dairy-queen": ["dq"],
    "jack-in-the-box": ["jack in the box", "jack n the box"],
    "tropical-smoothie-cafe": ["tropical smoothie"],
    "firehouse-subs": ["firehouse"],
    "jimmy-johns": ["jj", "jimmy johns"],
    "starbucks": ["sbux", "starbies"],
    "five-guys": ["5 guys"],
    "wendys": ["wendys", "wendy's"],
    "papa-johns": ["papa johns"],
    "dominos": ["dominos", "domino's"],
    "carls-jr": ["carls jr", "carl's jr"],
    "panda-express": ["panda"],
    "chilis": ["chili's", "chilis"],
}


def aliases(slug, name):
    base = name.lower()
    out = {base, re.sub(r"[^a-z0-9 ]", "", base), re.sub(r"[^a-z0-9]", "", base),
           slug.replace("-", " "), slug.replace("-", "")}
    out.update(EXTRA_ALIASES.get(slug, []))
    return sorted(a.strip() for a in out if len(a.strip()) >= 2)


def api(method, path, body=None, prefer=None):
    url = run.os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    key = run.os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def main():
    run.load_env_local()
    files = sorted(OUT.glob("*.jsonl"))
    if sys.argv[1:]:
        files = [OUT / f"{s}.jsonl" for s in sys.argv[1:]]
    total = 0
    for f in files:
        slug = f.stem
        rows = [json.loads(line) for line in open(f, encoding="utf-8")]
        if not rows:
            continue
        name = rows[0]["chain"]
        api("POST", "restaurant_chains?on_conflict=slug",
            {"slug": slug, "name": name, "aliases": aliases(slug, name)},
            prefer="resolution=merge-duplicates")
        api("DELETE", f"restaurant_items?chain_slug=eq.{slug}")
        payload = [{"chain_slug": slug, **{k: r[k] for k in (
            "category", "item", "size", "serving_g", "calories", "protein", "carbs", "fat",
            "sugar", "fiber", "sodium_mg", "source_url", "fetched_on")}} for r in rows]
        for i in range(0, len(payload), 500):
            api("POST", "restaurant_items", payload[i:i + 500])
        total += len(payload)
        print(f"{slug}: {len(payload)}")
    print(f"loaded {total} rows")


if __name__ == "__main__":
    main()
