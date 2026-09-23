"""Shared plumbing for the restaurant nutrition fetchers.

Every fetcher turns one chain's *own published* nutrition into rows of the same
shape and writes them to data/restaurants/<chain>.jsonl. Official sources only:
an aggregator's number is someone's transcription of the chain's number, and
this dataset exists because accuracy is the priority (Danny, 2026-09-21).

One row is one orderable thing at one size, exactly as the chain lists it.
Build-your-own chains (Chipotle, CAVA, Sweetgreen) are listed per ingredient
portion, because that is how they publish it and how people order.
"""

import json
import re
import urllib.request
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "data" / "restaurants"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36",
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
}
FIELDS = ("calories", "protein", "carbs", "fat", "sugar", "fiber", "sodium_mg")


def fetch(url, timeout=60, headers=None):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def num(v):
    """'12g', '<1', '1,040', 7 -> float. '<1' reads as 0.5, the midpoint."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "")
    if s.startswith("<"):
        return 0.5
    m = re.search(r"-?\d+(\.\d+)?", s)
    return float(m.group()) if m else None


def row(chain, category, item, source_url, *, size="", serving_g=None, **macros):
    r = {
        "chain": chain,
        "category": category,
        "item": re.sub(r"\s+", " ", item.replace("®", "").replace("™", "")).strip(),
        "size": size,
        "serving_g": num(serving_g),
    }
    for f in FIELDS:
        v = num(macros.get(f))
        # Some feeds carry unrounded lab values (534.7357 kcal); keep the
        # precision that matters and no more.
        r[f] = None if v is None else (round(v) if f in ("calories", "sodium_mg") else round(v, 1))
    if r["serving_g"] is not None:
        # Nutritionix writes an unknown weight as 0; unknown is not zero.
        r["serving_g"] = round(r["serving_g"], 1) or None
    r["source_url"] = source_url
    r["fetched_on"] = date.today().isoformat()
    return r


def write(slug, rows):
    """Validate and write. Refuses rows that would poison the table."""
    bad = [r for r in rows if r["calories"] is None or r["protein"] is None
           or r["carbs"] is None or r["fat"] is None]
    if bad:
        raise SystemExit(f"{slug}: {len(bad)} rows missing core macros, e.g. {bad[0]}")
    # Atwater sanity check: 4/4/9 should land near the stated calories. Alcohol,
    # fiber and rounding explain small gaps; a big one means a parse misread a
    # column, which is exactly the silent failure this dataset can't afford.
    suspicious = []
    booze = re.compile(r"beer|wine|spirit|cocktail|margarita|sangria|cantina|bar\b|ipa\b|lager|"
                       r"ale\b|cider|proof|vodka|tequila|rum\b|whiskey|bourbon|mimosa|seltzer|"
                       r"martini|mai tai|mule|lemon drop|punch|mojito|daiquiri|cosmopolitan|"
                       r"old fashioned|spritz|paloma|bellini|negroni|sour\b", re.I)
    # Calories with every macro at zero is a half-entered row ("Coca-Cola,
    # Large: 220 kcal, 0 g carbs"). Summing it would log wrong macros, so it is
    # dropped and the model estimates that item instead.
    rows = [r for r in rows if not (r["calories"] >= 20 and r["protein"] == r["carbs"] == r["fat"] == 0
                                    and not booze.search(r["category"] + " " + r["item"]))]
    for r in rows:
        if booze.search(r["category"]) or booze.search(r["item"]):
            continue
        est = 4 * r["protein"] + 4 * r["carbs"] + 9 * r["fat"]
        if r["calories"] >= 50 and abs(est - r["calories"]) > max(40, 0.2 * r["calories"]):
            suspicious.append((r["item"], r["size"], r["calories"], round(est)))
    OUT.mkdir(parents=True, exist_ok=True)
    seen, uniq = set(), []
    for r in rows:
        k = (r["item"].lower(), r["size"].lower())
        if k not in seen:
            seen.add(k)
            uniq.append(r)
    path = OUT / f"{slug}.jsonl"
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for r in uniq:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"{slug}: {len(uniq)} rows -> {path.relative_to(REPO)}")
    if suspicious:
        print(f"  {len(suspicious)} rows fail the 4/4/9 check (item, size, stated, computed):")
        for s in suspicious[:15]:
            print("   ", s)
    return uniq
