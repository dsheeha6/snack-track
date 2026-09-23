"""McDonald's: built from the official nutrition calculator's item endpoint,
mcdonalds.com/dnaapp/itemDetails?country=US&language=en&item=<id>.

The site times out for scripts, so the capture runs in a browser on the
calculator page: item ids come from /us/en-us/full-menu.html (data-product-id),
each id's details are fetched, and size variants are followed through
relation_types. Saved to data/restaurants/raw/mcdonalds_feed_<date>.json.

Combo meals carry no nutrition of their own (they are an entree + fries + drink
the person picks) and are skipped; their parts are all here individually.
"""

import json
import re

from common import REPO, row, write

RAW = sorted((REPO / "data" / "restaurants" / "raw").glob("mcdonalds_feed_*.json"))[-1]
URL = "https://www.mcdonalds.com/us/en-us/about-our-food/nutrition-calculator.html"
SIZE = re.compile(r"\s*\(?\b(extra small|small|medium|large|kids|\d+ ?piece|\d+ ?oz\.?)\b\)?\s*", re.I)


def main():
    out = []
    for r in json.load(open(RAW, encoding="utf-8")):
        if r.get("cal") in (None, ""):
            continue
        name = re.sub(r"\s+", " ", r["name"].replace("*", "")).strip()
        m = SIZE.search(name)
        size = m.group(1).lower() if m else ""
        out.append(row("McDonald's", r.get("cat") or "", name, URL, size=size,
                       calories=r["cal"], protein=r["p"], carbs=r["c"], fat=r["f"],
                       sugar=r.get("sugar"), fiber=r.get("fiber"), sodium_mg=r.get("na")))
    write("mcdonalds", out)


if __name__ == "__main__":
    main()
