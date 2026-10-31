"""Chains whose own nutrition guide is a PDF with one item per row: a name,
sometimes a serving ("1 Serving", "4 oz"), then a fixed run of numbers.

Each guide was downloaded from the chain's own site into data/restaurants/raw/
(Danny's blanket OK for chains' own PDFs, 2026-09-28). Column orders were read
off each guide's header and confirmed with the 4/4/9 check in common.write().

usage: python pdf_guides.py [slug ...]   (no args = all)
"""

import re
import sys

from common import REPO, pdf_rows, row, write

RAW = REPO / "data" / "restaurants" / "raw"

# Serving text that sits between the name and the numbers.
SERVING = re.compile(
    r"\s+(\d+(?:\.\d+)?\s*(?:serv(?:ing)?s?|oz|fl oz|g|each|piece|pieces|pc|slice|slices|cup|bowl|order)"
    r"|1)$", re.I)

GUIDES = {
    "pf-changs": {
        "chain": "P.F. Chang's",
        "file": "pf-changs_nutrition_*.pdf",
        "url": "https://www.pfchangs.com/nutrition",
        "cols": ("servings", "calories", "cal_fat", "fat", "sat_fat", "trans_fat", "chol",
                 "sodium_mg", "carbs", "fiber", "sugar", "protein"),
    },
    "dennys": {
        "chain": "Denny's",
        "file": "dennys_nutrition_*.pdf",
        "url": "https://www.dennys.com/nutrition",
        "cols": ("calories", "fat", "cal_fat", "sat_fat", "trans_fat", "chol", "sodium_mg",
                 "carbs", "fiber", "protein", "sugar"),
        "serving": True,
    },
    "outback-steakhouse": {
        "chain": "Outback Steakhouse",
        "file": "outback-steakhouse_nutrition_*.pdf",
        "url": "https://www.outback.com/nutrition",
        "cols": ("calories", "cal_fat", "fat", "sat_fat", "trans_fat", "chol", "sodium_mg",
                 "carbs", "fiber", "sugar", "protein"),
        "serving": True,
        "single_line": True,
    },
    "cheesecake-factory": {
        "chain": "The Cheesecake Factory",
        "file": "cheesecake-factory_nutrition_*.pdf",
        "url": "https://www.thecheesecakefactory.com/nutrition",
        "cols": ("calories", "cal_fat", "fat", "sat_fat", "trans_fat", "chol", "sodium_mg",
                 "carbs", "fiber", "sugar", "protein"),
        # "(UT)", "(PR)", "(HI)", "(NC)", "(SUB)": state-specific pours. The
        # plain row is the one almost everyone is served.
        "skip": re.compile(r"\((?:[A-Z]{2}|SUB)\)\s*$"),
        "optional_tail": 1,
    },
    "bojangles": {
        # A one-page wall sign, "BOJ-NutritionWallSign-11x17-Pepsi-2025", the
        # newest bojangles.com links to (checked 2026-10-30).
        "chain": "Bojangles",
        "file": "bojangles_nutrition_*.pdf",
        "url": "https://www.bojangles.com/nutrition",
        "cols": ("calories", "cal_fat", "fat", "sat_fat", "trans_fat", "chol", "carbs",
                 "sodium_mg", "sugar", "protein", "fiber"),
        "serving": re.compile(r"\s+((?:\d+(?:\.\d+|/\d+)?\s*(?:pc|oz|Gal|Bowl)|\d+|Ind\.|Picnic|Sm|Small|"
                              r"Medium|Regular|Large))$", re.I),
        "size_words": {"ind.": "individual", "sm": "small", "1": ""},
        "oz_in_name": True,
        # Allergen columns: an "x" (sometimes "X") per allergen after the numbers.
        "trailing_junk": r"(\s+[xX])+\s*$",
        # "SALADS Not included: ...", "KIDS' MEAL w/water, green beans, biscuit"
        "heading": re.compile(r"^([A-Z][A-Z'’ ]{3,}?)(?:\s+[A-Z]?[a-z/].*)?$"),
        "category_size": {"Kids' Meal": "kids' meal"},
    },
}

# A heading is an all-caps line (letters, spaces, &, ', -), e.g. "ALL DA Y BRUNCH COCKTAILS".
HEADING = re.compile(r"^[A-Z][A-Z &'/,-]{3,}$")


def fetch(slug):
    g = GUIDES[slug]
    files = sorted(RAW.glob(g["file"]))
    if not files:
        raise SystemExit(f"{slug}: no {g['file']} in {RAW}")
    out = []
    heading = g.get("heading", HEADING)
    extra = {"trailing_junk": g["trailing_junk"]} if "trailing_junk" in g else {}
    for path in files:
        category = ""
        for name, nums, held in pdf_rows(path, len(g["cols"]), optional_tail=g.get("optional_tail", 0),
                                         **extra):
            last = -1
            for i, h in enumerate(held):
                m = heading.match(h)
                if m and len(h) < (80 if "heading" in g else 60):
                    category = re.sub(r"\s+", " ", m.group(m.lastindex or 0)).strip().title()
                    category = category.replace("’", "'").replace("'S", "'s")
                    last = i
            if "heading" in g and last >= 0:
                # The heading (and the column header above it) was held and
                # glued onto the front of this row's name; only lines after it
                # can be the start of a wrapped name.
                prefix = " ".join(held[:last + 1])
                if name.startswith(prefix):
                    name = name[len(prefix):].strip()
            if g.get("single_line") and held:
                # Every row fits on one line, so anything held above it is a
                # section heading ("Aussie-Tizers"), not the start of a name.
                prefix = " ".join(held)
                if name.startswith(prefix):
                    name = name[len(prefix):].strip()
                    category = held[-1].strip()
            # A heading line can end up glued in front of the first row.
            m = re.match(r"^((?:[A-Z][A-Z&'/,-]+\s+){1,6})(?=[A-Z][a-z0-9])", name)
            if m and len(m.group(1).split()) >= 2:
                category, name = m.group(1).strip().title(), name[m.end():]
            if g.get("skip") and g["skip"].search(name):
                continue
            size = ""
            if g.get("serving"):
                pattern = g["serving"] if isinstance(g["serving"], re.Pattern) else SERVING
                m = pattern.search(name)
                if m:
                    size, name = m.group(1), name[:m.start()]
                    size = g.get("size_words", {}).get(size.lower(), size)
            name = name.strip(" *'")
            if g.get("oz_in_name"):
                # "Pepsi (22oz) * Regular" -> name "Pepsi", size "Regular (22 oz)"
                m = re.search(r"\s*\((\d+(?:\.\d+)?)\s*oz\)", name)
                if m:
                    size = f"{size} ({m.group(1)} oz)".strip()
                    name = (name[:m.start()] + name[m.end():]).strip(" *")
            if category in g.get("category_size", {}):
                size = ", ".join(filter(None, [g["category_size"][category], size]))
            if not name or len(name) > 90:
                continue
            v = dict(zip(g["cols"], nums))
            out.append(row(g["chain"], category, name, g["url"], size=size,
                           **{k: v.get(k) for k in ("calories", "protein", "carbs", "fat", "sugar",
                                                    "fiber", "sodium_mg")}))
    return write(slug, out)


def main():
    for slug in sys.argv[1:] or GUIDES:
        fetch(slug)


if __name__ == "__main__":
    main()
