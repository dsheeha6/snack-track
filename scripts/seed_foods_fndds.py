#!/usr/bin/env python3
"""Seed public.foods with USDA FNDDS: everyday foods and meals as eaten.

SR Legacy (source='usda') is ingredients and Branded is packages; neither has
"peanut butter and jelly sandwich" or "grilled cheese" (checked 2026-09-25).
FNDDS -- the Food and Nutrient Database for Dietary Studies, what NHANES codes
its food recalls against -- is ~5,400 foods as people report eating them, each
with standard portions ("1 sandwich", "1 cup"). Public domain.

    python scripts/seed_foods_fndds.py --dry-run
    python scripts/seed_foods_fndds.py

Source: FoodData_Central_survey_food_csv_2024-10-31.zip (FNDDS 2021-2023),
cached at scripts/.cache/fndds.zip.

Rows go in as source='usda_fndds', per 100 g like the other sources, with the
first real portion as package_size/package_label ("1 sandwich", 128 g).

INSERT-ONLY: names already present for this source are skipped, and nothing is
ever deleted, because entries.food_id is ON DELETE SET NULL and a
clear-and-reload unlinks logged food (see seed_foods_branded.py's warning).
"""

import argparse
import csv
import io
import json
import pathlib
import sys
import urllib.parse
import urllib.request
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
ZIP = HERE / ".cache" / "fndds.zip"
BASE = "FoodData_Central_survey_food_csv_2024-10-31/"
SOURCE = "usda_fndds"
# Same dict as seed_foods_usda.py / stage_branded.py / add_sugar_fiber.py.
WANT_NUTRIENTS = {"1008": "calories", "1003": "protein", "1004": "fat", "1005": "carbs",
                  "2000": "sugar", "1079": "fiber"}
NOT_A_PORTION = {"quantity not specified"}

sys.path.insert(0, str(HERE))
from seed_foods_branded import load_env_local  # noqa: E402


def rows(zf, name):
    with zf.open(BASE + name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", newline=""))


def build():
    zf = zipfile.ZipFile(ZIP)
    foods = {r["fdc_id"]: r["description"].strip() for r in rows(zf, "food.csv")}
    # FNDDS's food_nutrient.csv carries the legacy nutrient NUMBER (208 = kcal)
    # in its nutrient_id column, where SR/Branded carry the id (1008). Map
    # number -> id through its own nutrient.csv; ids pass through unchanged.
    nbr_to_id = {r["nutrient_nbr"]: r["id"] for r in rows(zf, "nutrient.csv") if r["nutrient_nbr"]}
    nut = {}
    for r in rows(zf, "food_nutrient.csv"):
        k = WANT_NUTRIENTS.get(nbr_to_id.get(r["nutrient_id"], r["nutrient_id"]))
        if k and r["amount"]:
            nut.setdefault(r["fdc_id"], {})[k] = float(r["amount"])
    # Lowest seq_num with a real weight is FNDDS's own primary portion.
    portion = {}
    for r in rows(zf, "food_portion.csv"):
        g = float(r["gram_weight"] or 0)
        desc = (r["portion_description"] or "").strip()
        if g <= 0 or not desc or desc.lower() in NOT_A_PORTION:
            continue
        seq = int(r["seq_num"] or 999)
        if r["fdc_id"] not in portion or seq < portion[r["fdc_id"]][0]:
            portion[r["fdc_id"]] = (seq, g, desc)

    out, skipped = [], 0
    for fid, name in foods.items():
        n = nut.get(fid, {})
        if not name or not all(k in n for k in ("calories", "protein", "carbs", "fat")):
            skipped += 1
            continue
        p = portion.get(fid)
        out.append({
            "name": name,
            "brand": None,
            "barcode": None,
            "serving_label": "100 g",
            "serving_grams": 100,
            "calories": round(n["calories"], 1),
            "protein": round(n["protein"], 1),
            "carbs": round(n["carbs"], 1),
            "fat": round(n["fat"], 1),
            "sugar": round(n["sugar"], 1) if "sugar" in n else None,
            "fiber": round(n["fiber"], 1) if "fiber" in n else None,
            "package_size": round(p[1], 1) if p and p[1] <= 5000 else None,
            "package_unit": "g" if p and p[1] <= 5000 else None,
            "package_label": p[2][:80] if p and p[1] <= 5000 else None,
            "source": SOURCE,
        })
    return out, skipped


def api(env, method, path, body=None, prefer=None):
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(env["SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not ZIP.exists():
        sys.exit(f"Missing {ZIP}. Download FoodData_Central_survey_food_csv_2024-10-31.zip there.")
    out, skipped = build()
    print(f"FNDDS foods: {len(out):,} usable, {skipped} without all four macros")
    print(f"  with sugar {sum(r['sugar'] is not None for r in out):,}, "
          f"fiber {sum(r['fiber'] is not None for r in out):,}, "
          f"portion {sum(r['package_size'] is not None for r in out):,}")
    if args.dry_run:
        for r in out[:3] + [r for r in out if "jelly sandwich" in r["name"].lower()][:2]:
            print("   ", r)
        return

    env = load_env_local()
    have = set()
    for off in range(0, 100_000, 1000):
        got = json.loads(api(env, "GET", f"foods?source=eq.{SOURCE}&select=name&offset={off}&limit=1000"))
        have.update(g["name"] for g in got)
        if len(got) < 1000:
            break
    todo = [r for r in out if r["name"] not in have]
    print(f"already loaded {len(have):,}; inserting {len(todo):,}")
    for i in range(0, len(todo), 500):
        api(env, "POST", "foods", todo[i:i + 500], prefer="return=minimal")
    print("done")


if __name__ == "__main__":
    main()
