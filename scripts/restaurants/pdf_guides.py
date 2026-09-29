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
}

# A heading is an all-caps line (letters, spaces, &, ', -), e.g. "ALL DA Y BRUNCH COCKTAILS".
HEADING = re.compile(r"^[A-Z][A-Z &'/,-]{3,}$")


def fetch(slug):
    g = GUIDES[slug]
    files = sorted(RAW.glob(g["file"]))
    if not files:
        raise SystemExit(f"{slug}: no {g['file']} in {RAW}")
    out = []
    for path in files:
        category = ""
        for name, nums, held in pdf_rows(path, len(g["cols"]), optional_tail=g.get("optional_tail", 0)):
            for h in held:
                if HEADING.match(h) and len(h) < 60:
                    category = re.sub(r"\s+", " ", h).title()
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
                m = SERVING.search(name)
                if m:
                    size, name = m.group(1), name[:m.start()]
            name = name.strip(" *'")
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
