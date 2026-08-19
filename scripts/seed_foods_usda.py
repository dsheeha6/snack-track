#!/usr/bin/env python3
"""Seed public.foods from USDA FoodData Central's SR Legacy dataset.

Requires SUPABASE_SERVICE_ROLE_KEY in ../.env.local (the REST insert is
blocked by RLS for every other role by design -- foods is read-only to
clients). Get the key from the Supabase dashboard: Project Settings > API >
service_role secret. Never put this key in the mobile app or commit it.

Usage:
    python scripts/seed_foods_usda.py

Idempotent: deletes existing source='usda' rows before reloading, so it's
safe to re-run (e.g. on a new SR Legacy release) without creating duplicates.
Pure stdlib -- no pip install needed.
"""

import csv
import io
import json
import os
import pathlib
import sys
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE_DIR = pathlib.Path(__file__).resolve().parent / ".cache"
DATASET_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip"
DATASET_ZIP = CACHE_DIR / "sr_legacy.zip"
DATASET_DIR_NAME = "FoodData_Central_sr_legacy_food_csv_2018-04"

WANT_NUTRIENTS = {"1008": "calories", "1003": "protein", "1004": "fat", "1005": "carbs"}
BATCH_SIZE = 500

csv.field_size_limit(sys.maxsize)


def load_env_local():
    env_path = ROOT / ".env.local"
    values = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def download_dataset():
    CACHE_DIR.mkdir(exist_ok=True)
    if DATASET_ZIP.exists():
        print(f"Using cached dataset at {DATASET_ZIP}")
        return
    print(f"Downloading {DATASET_URL} ...")
    urllib.request.urlretrieve(DATASET_URL, DATASET_ZIP)
    print(f"Saved to {DATASET_ZIP}")


def extract_dataset():
    extract_dir = CACHE_DIR / DATASET_DIR_NAME
    if extract_dir.exists():
        return extract_dir
    print("Extracting...")
    with zipfile.ZipFile(DATASET_ZIP) as zf:
        zf.extractall(CACHE_DIR)
    return extract_dir


def build_rows(data_dir):
    foods = {}
    with open(data_dir / "food.csv", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            foods[row["fdc_id"]] = row["description"]

    nutrients = {}
    with open(data_dir / "food_nutrient.csv", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            nid = row["nutrient_id"]
            if nid not in WANT_NUTRIENTS:
                continue
            amount = row["amount"]
            if not amount:
                continue
            nutrients.setdefault(row["fdc_id"], {})[WANT_NUTRIENTS[nid]] = float(amount)

    rows = []
    for fdc_id, name in foods.items():
        n = nutrients.get(fdc_id)
        if not n or "calories" not in n:
            continue
        rows.append(
            {
                "name": name,
                "serving_label": "100 g",
                "serving_grams": 100,
                "calories": round(n.get("calories", 0), 1),
                "protein": round(n.get("protein", 0), 1),
                "carbs": round(n.get("carbs", 0), 1),
                "fat": round(n.get("fat", 0), 1),
                "source": "usda",
            }
        )
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
    env = load_env_local()
    supabase_url = env.get("SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.\n"
            "Get the service_role key from the Supabase dashboard: "
            "Project Settings > API > service_role secret.",
            file=sys.stderr,
        )
        sys.exit(1)

    download_dataset()
    data_dir = extract_dataset()
    rows = build_rows(data_dir)
    print(f"Parsed {len(rows)} foods with calorie data.")

    print("Clearing existing source='usda' rows (safe re-run)...")
    rest_request(
        "DELETE",
        f"{supabase_url}/rest/v1/foods?source=eq.usda",
        service_key,
    )

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        rest_request(
            "POST",
            f"{supabase_url}/rest/v1/foods",
            service_key,
            body=batch,
            extra_headers={"Prefer": "return=minimal"},
        )
        print(f"Inserted {min(i + BATCH_SIZE, len(rows))}/{len(rows)}")

    print("Done.")


if __name__ == "__main__":
    main()
