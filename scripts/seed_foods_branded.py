#!/usr/bin/env python3
"""Seed public.foods with a curated subset of USDA Branded Foods.

Why a subset: the full branded dataset is ~2.0M products. Measured against this
schema that is roughly 2.3GB once the trigram search index is counted, and the
Supabase free tier caps the whole database at 500MB. Danny's call on 2026-08-23
was to stay on the free tier, so this loads the most useful slice instead.

How the slice is chosen, in order:
  1. US market, not discontinued, all four macros present.
  2. Calories in a physically possible range (0-900 per 100g; pure fat is ~900).
  3. Drop rows whose macros contradict their calorie figure (Atwater check) and
     rows where all four values are zero. The zero rule costs us genuinely
     zero-calorie condiments, which is a real loss -- but USDA also records
     things like bottled Coca-Cola as 0, and in a calorie tracker a *wrong*
     zero is worse than a missing row: a gap makes you search again, a false
     zero silently under-counts the day.
  4. Deduplicate on (brand, description), keeping the most recently modified.
  5. Deduplicate on barcode, because public.foods.barcode is UNIQUE.
  6. Cap products per brand (--cap). This is the row-count lever, and it trims
     SKU depth without losing brands: every one of the ~50k brands survives at
     any cap, because supermarket house brands carry tens of thousands of
     near-identical SKUs while the brand you'd actually search for has a few.

Values are per 100g with serving_label "100 g", matching seed_foods_usda.py
exactly. The real per-serving figures ("1 bar (60g)") are staged in the SQLite
file and are worth adopting later, but only for BOTH sources at once -- mixing
per-serving and per-100g rows behind one column would show wrong numbers.

Prerequisites:
    python scripts/stage_branded.py     (builds .cache/branded.sqlite)
    SUPABASE_SERVICE_ROLE_KEY in ../.env.local

Usage:
    python scripts/seed_foods_branded.py --dry-run
    python scripts/seed_foods_branded.py --cap 30
    python scripts/seed_foods_branded.py --cap 30 --limit 20000   # sample load

Idempotent: clears source='usda_branded' before loading, so re-running with a
different --cap replaces the set cleanly and never touches the SR Legacy rows
(source='usda') that seed_foods_usda.py owns.
"""

import argparse
import json
import pathlib
import re
import sqlite3
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DB_PATH = pathlib.Path(__file__).resolve().parent / ".cache" / "branded.sqlite"
SOURCE = "usda_branded"
BATCH_SIZE = 500

# USDA brand strings carry stray quoting: '"LOUISIANA"', '""SLAP YA MAMA""'.
QUOTES = re.compile(r'^[\s"\']+|[\s"\']+$')
WS = re.compile(r"\s+")

SELECT = """
select brand, name, gtin, calories, protein, carbs, fat
from (
  select brand, name, gtin, calories, protein, carbs, fat,
         row_number() over (partition by gtin order by modified desc, fdc_id desc) as gtin_rank
  from candidates
  where brand_rank <= :cap
    and not (calories = 0 and protein = 0 and carbs = 0 and fat = 0)
    and not (calories > 0
             and abs((protein * 4 + carbs * 4 + fat * 9) - calories) > 0.5 * calories + 60)
)
where gtin is null or gtin_rank = 1
order by brand_rank_placeholder
"""


def clean(text):
    return WS.sub(" ", QUOTES.sub("", text or "")).strip()


def read_env_text(path):
    """Read .env.local whatever encoding it got saved in (Notepad writes UTF-16)."""
    raw = path.read_bytes()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16")
    return raw.decode("utf-8-sig")


def load_env_local():
    values = {}
    for line in read_env_text(ROOT / ".env.local").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def build_rows(cap, limit):
    if not DB_PATH.exists():
        sys.exit(f"Missing {DB_PATH}. Run: python scripts/stage_branded.py")
    db = sqlite3.connect(DB_PATH)
    sql = SELECT.replace("order by brand_rank_placeholder", "")
    if limit:
        sql += f" limit {int(limit)}"
    rows = []
    seen_barcode = set()
    for brand, name, gtin, cal, p, c, f in db.execute(sql, {"cap": cap}):
        name, brand = clean(name), clean(brand)
        if not name or not brand:
            continue
        barcode = gtin if gtin and gtin not in seen_barcode else None
        if barcode:
            seen_barcode.add(barcode)
        rows.append({
            "name": name,
            "brand": brand,
            "barcode": barcode,
            "serving_label": "100 g",
            "serving_grams": 100,
            "calories": round(cal, 1),
            "protein": round(p, 1),
            "carbs": round(c, 1),
            "fat": round(f, 1),
            "source": SOURCE,
        })
    db.close()
    return rows


def rest_request(method, url, api_key, body=None, extra_headers=None):
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return resp.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cap", type=int, default=30, help="max products per brand")
    ap.add_argument("--limit", type=int, default=0, help="stop after N rows (sampling)")
    ap.add_argument("--dry-run", action="store_true", help="parse and report, upload nothing")
    args = ap.parse_args()

    rows = build_rows(args.cap, args.limit)
    print(f"Selected {len(rows):,} branded foods (cap {args.cap} per brand).")
    print(f"  with barcode: {sum(1 for r in rows if r['barcode']):,}")
    if args.dry_run:
        for r in rows[:5]:
            print("   ", r)
        return

    env = load_env_local()
    supabase_url = env.get("SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        sys.exit(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.\n"
            "Project Settings > API > service_role secret."
        )

    print(f"Clearing existing source='{SOURCE}' rows (safe re-run)...")
    rest_request("DELETE", f"{supabase_url}/rest/v1/foods?source=eq.{SOURCE}", service_key)

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        rest_request(
            "POST",
            f"{supabase_url}/rest/v1/foods",
            service_key,
            body=batch,
            extra_headers={"Prefer": "return=minimal"},
        )
        done = min(i + BATCH_SIZE, len(rows))
        if done % 10_000 == 0 or done == len(rows):
            print(f"  inserted {done:,}/{len(rows):,}")

    print("Done.")


if __name__ == "__main__":
    main()
