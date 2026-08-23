#!/usr/bin/env python3
"""Stage USDA Branded Foods into a local SQLite file for curation.

The branded dataset is ~2M products / ~3GB of CSV, which does not fit the
Supabase free tier (500MB) and does not fit comfortably in memory either. So:
parse it once into SQLite here, then pick the curated subset with SQL in
seed_foods_branded.py. Re-running the selection is then seconds, not an hour.

Reads straight out of the zip -- never extracts the 3GB.

Usage:
    python scripts/stage_branded.py

Idempotent: drops and rebuilds its tables. Pure stdlib.
"""

import csv
import io
import pathlib
import sqlite3
import sys
import zipfile

CACHE_DIR = pathlib.Path(__file__).resolve().parent / ".cache"
ZIP_PATH = CACHE_DIR / "branded.zip"
BASE = "FoodData_Central_branded_food_csv_2024-10-31/"
DB_PATH = CACHE_DIR / "branded.sqlite"

# Same four USDA nutrient IDs the SR Legacy seeder uses, so both sources land
# in public.foods with identical semantics (all values per 100g).
WANT_NUTRIENTS = {"1008": "calories", "1003": "protein", "1004": "fat", "1005": "carbs"}

csv.field_size_limit(min(sys.maxsize, 2**31 - 1))


def rows(zf, name):
    """Stream a CSV member of the zip as dicts without extracting it."""
    with zf.open(BASE + name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", newline=""))


def main():
    if not ZIP_PATH.exists():
        sys.exit(f"Missing {ZIP_PATH}. Download the branded CSV dataset first.")

    if DB_PATH.exists():
        DB_PATH.unlink()
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        pragma journal_mode = off;
        pragma synchronous = off;
        create table food (fdc_id integer primary key, description text);
        create table branded (
            fdc_id integer primary key,
            brand text,
            category text,
            serving_size real,
            serving_unit text,
            household text,
            gtin text,
            discontinued text,
            modified text
        );
        create table nutrient (fdc_id integer, name text, amount real);
        """
    )
    zf = zipfile.ZipFile(ZIP_PATH)

    print("food.csv ...")
    batch, n = [], 0
    for r in rows(zf, "food.csv"):
        batch.append((int(r["fdc_id"]), (r["description"] or "").strip()))
        if len(batch) >= 50_000:
            db.executemany("insert or replace into food values (?,?)", batch)
            n += len(batch); batch.clear()
            print(f"  {n:,}", end="\r")
    db.executemany("insert or replace into food values (?,?)", batch)
    n += len(batch)
    print(f"  {n:,} foods")

    print("branded_food.csv ...")
    batch, n = [], 0
    for r in rows(zf, "branded_food.csv"):
        if r["market_country"] != "United States":
            continue
        brand = (r["brand_name"] or r["brand_owner"] or "").strip()
        try:
            serving = float(r["serving_size"]) if r["serving_size"] else None
        except ValueError:
            serving = None
        batch.append((
            int(r["fdc_id"]), brand, (r["branded_food_category"] or "").strip(),
            serving, (r["serving_size_unit"] or "").strip().lower(),
            (r["household_serving_fulltext"] or "").strip(),
            (r["gtin_upc"] or "").strip(), r["discontinued_date"] or "",
            r["modified_date"] or r["available_date"] or "",
        ))
        if len(batch) >= 50_000:
            db.executemany("insert or replace into branded values (?,?,?,?,?,?,?,?,?)", batch)
            n += len(batch); batch.clear()
            print(f"  {n:,}", end="\r")
    db.executemany("insert or replace into branded values (?,?,?,?,?,?,?,?,?)", batch)
    n += len(batch)
    print(f"  {n:,} branded (US only)")

    print("food_nutrient.csv (the big one, ~1.5GB) ...")
    batch, n = [], 0
    for r in rows(zf, "food_nutrient.csv"):
        want = WANT_NUTRIENTS.get(r["nutrient_id"])
        if not want:
            continue
        amount = r["amount"]
        if not amount:
            continue
        try:
            batch.append((int(r["fdc_id"]), want, float(amount)))
        except ValueError:
            continue
        if len(batch) >= 100_000:
            db.executemany("insert into nutrient values (?,?,?)", batch)
            n += len(batch); batch.clear()
            print(f"  {n:,}", end="\r")
    db.executemany("insert into nutrient values (?,?,?)", batch)
    n += len(batch)
    print(f"  {n:,} nutrient values")

    print("indexing ...")
    db.executescript("create index nutrient_fdc_idx on nutrient (fdc_id, name);")
    db.commit()

    for label, q in [
        ("food", "select count(*) from food"),
        ("branded", "select count(*) from branded"),
        ("nutrient", "select count(*) from nutrient"),
    ]:
        print(f"  {label:10} {db.execute(q).fetchone()[0]:,}")
    db.close()
    print(f"\nStaged at {DB_PATH} ({DB_PATH.stat().st_size / 1e9:.2f} GB)")


if __name__ == "__main__":
    main()
