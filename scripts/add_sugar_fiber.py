#!/usr/bin/env python3
"""Add sugar, fiber and package size to the foods already in public.foods.

Tier 2 of the backend-first plan (ROADMAP). Updates rows IN PLACE rather than
re-seeding, because entries.food_id points at foods.id with ON DELETE SET NULL:
the seeders' clear-and-reload would silently unlink every logged entry that
has a food match (27 of them on 2026-09-25).

Steps, each resumable:
    python scripts/add_sugar_fiber.py stage     # ~10 min: sugar/fiber into the cache
    python scripts/add_sugar_fiber.py build     # write .cache/sugar_fiber_rows.jsonl
    python scripts/add_sugar_fiber.py upload    # POST rows to public.foods_nutrient_load
then, in SQL (see BUILD_LOG 2026-09-25), UPDATE foods FROM foods_nutrient_load
and drop the load table.

Values are per 100 g (per 100 ml for drinks), same basis as calories. Missing
means unknown and stays NULL; it is never written as 0.

Package size comes from USDA's own serving_size/household text for branded
rows, as `package_size` + `package_unit` ('g' or 'ml') + `package_label`
("1 bar (52g)"). SR Legacy whole foods have no package and stay NULL.

The branded match key is (brand, name, barcode) exactly as
seed_foods_branded.py built it (clean() on both strings); it is unique in
foods (checked 2026-09-25). SR Legacy rows match on name, also unique.
"""

import csv
import io
import json
import pathlib
import sqlite3
import sys
import urllib.request
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / ".cache"
DB_PATH = CACHE / "branded.sqlite"
BRANDED_ZIP = CACHE / "branded.zip"
BRANDED_BASE = "FoodData_Central_branded_food_csv_2024-10-31/"
SR_ZIP = CACHE / "sr_legacy.zip"
ROWS_OUT = CACHE / "sugar_fiber_rows.jsonl"

EXTRA_NUTRIENTS = {"2000": "sugar", "1079": "fiber"}
csv.field_size_limit(min(sys.maxsize, 2**31 - 1))

sys.path.insert(0, str(HERE))
from seed_foods_branded import SELECT, clean, load_env_local  # noqa: E402

UNITS = {"g": "g", "grm": "g", "gm": "g", "gram": "g", "grams": "g",
         "ml": "ml", "mlt": "ml", "mls": "ml"}


def rows(zf, member):
    with zf.open(member) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", newline=""))


def stage():
    db = sqlite3.connect(DB_PATH)
    db.execute("create table if not exists nutrient_extra (fdc_id integer, name text, amount real)")
    db.execute("delete from nutrient_extra")
    wanted = {r[0] for r in db.execute("select fdc_id from candidates")}
    print(f"{len(wanted):,} candidate products")
    zf = zipfile.ZipFile(BRANDED_ZIP)
    batch, n = [], 0
    for r in rows(zf, BRANDED_BASE + "food_nutrient.csv"):
        name = EXTRA_NUTRIENTS.get(r["nutrient_id"])
        if not name or not r["amount"]:
            continue
        fid = int(r["fdc_id"])
        if fid not in wanted:
            continue
        try:
            batch.append((fid, name, float(r["amount"])))
        except ValueError:
            continue
        if len(batch) >= 100_000:
            db.executemany("insert into nutrient_extra values (?,?,?)", batch)
            n += len(batch)
            batch.clear()
            print(f"  {n:,}", flush=True)
    db.executemany("insert into nutrient_extra values (?,?,?)", batch)
    n += len(batch)
    db.execute("create index if not exists nutrient_extra_idx on nutrient_extra (fdc_id, name)")
    db.commit()
    print(f"staged {n:,} sugar/fiber values")


def build():
    db = sqlite3.connect(DB_PATH)
    # The seeder's own selection, plus fdc_id and the package columns, so the
    # keys come out byte-identical to what it inserted.
    sql = (SELECT.replace("order by brand_rank_placeholder", "")
           .replace("select brand, name, gtin, calories, protein, carbs, fat\nfrom (",
                    "select fdc_id, brand, name, gtin, serving_size, serving_unit, household\nfrom (")
           .replace("  select brand, name, gtin, calories,",
                    "  select fdc_id, brand, name, gtin, serving_size, serving_unit, household, calories,"))
    extra = {}
    for fid, name, amt in db.execute("select fdc_id, name, amount from nutrient_extra"):
        extra.setdefault(fid, {})[name] = amt
    out = open(ROWS_OUT, "w", encoding="utf-8")
    n = with_sugar = with_pkg = 0
    seen_barcode = set()
    # No cap: the 2026-08-23 load took the whole deduplicated catalog (BUILD_LOG).
    for fid, brand, name, gtin, size, unit, household in db.execute(sql, {"cap": 10**9}):
        name, brand = clean(name), clean(brand)
        if not name or not brand:
            continue
        barcode = gtin if gtin and gtin not in seen_barcode else None
        if barcode:
            seen_barcode.add(barcode)
        e = extra.get(fid, {})
        u = UNITS.get((unit or "").lower())
        row = {"source": "usda_branded", "brand": brand, "name": name, "barcode": barcode,
               "sugar": round(e["sugar"], 1) if "sugar" in e else None,
               "fiber": round(e["fiber"], 1) if "fiber" in e else None,
               "package_size": round(size, 1) if size and u and 0 < size <= 5000 else None,
               "package_unit": u if size and u and 0 < size <= 5000 else None,
               "package_label": (household or "").strip()[:80] or None}
        n += 1
        with_sugar += row["sugar"] is not None
        with_pkg += row["package_size"] is not None
        out.write(json.dumps(row) + "\n")
    db.close()

    # SR Legacy whole foods: per 100 g, no package.
    zf = zipfile.ZipFile(SR_ZIP)
    base = next(m for m in zf.namelist() if m.endswith("food.csv")).rsplit("/", 1)[0]
    base = (base + "/") if "/" in next(m for m in zf.namelist() if m.endswith("food.csv")) else ""
    foods = {r["fdc_id"]: r["description"] for r in rows(zf, base + "food.csv")}
    vals = {}
    for r in rows(zf, base + "food_nutrient.csv"):
        name = EXTRA_NUTRIENTS.get(r["nutrient_id"])
        if name and r["amount"]:
            vals.setdefault(r["fdc_id"], {})[name] = float(r["amount"])
    sr = 0
    for fid, desc in foods.items():
        e = vals.get(fid, {})
        out.write(json.dumps({"source": "usda", "brand": None, "name": desc, "barcode": None,
                              "sugar": round(e["sugar"], 1) if "sugar" in e else None,
                              "fiber": round(e["fiber"], 1) if "fiber" in e else None,
                              "package_size": None, "package_unit": None,
                              "package_label": None}) + "\n")
        sr += 1
    out.close()
    print(f"branded rows {n:,} (sugar {with_sugar:,}, package {with_pkg:,}); SR rows {sr:,}")
    print(f"wrote {ROWS_OUT}")


def upload():
    env = load_env_local()
    url = env["SUPABASE_URL"].rstrip("/") + "/rest/v1/foods_nutrient_load"
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}",
               "Content-Type": "application/json", "Prefer": "return=minimal"}
    batch, n = [], 0
    lines = open(ROWS_OUT, encoding="utf-8")

    def send(b):
        req = urllib.request.Request(url, data=json.dumps(b).encode(), headers=headers, method="POST")
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=120):
                    return
            except Exception:
                if attempt == 4:
                    raise
                import time
                time.sleep(2 ** attempt)

    for line in lines:
        batch.append(json.loads(line))
        if len(batch) >= 1000:
            send(batch)
            n += len(batch)
            batch.clear()
            if n % 20_000 == 0:
                print(f"  {n:,}", flush=True)
    if batch:
        send(batch)
        n += len(batch)
    print(f"uploaded {n:,}")


if __name__ == "__main__":
    {"stage": stage, "build": build, "upload": upload}[sys.argv[1]]()
