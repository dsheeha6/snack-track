"""Shake Shack, from its own Nutrition & Allergen PDF (shakeshack.com/document/2451,
created 2026-08-10 per its metadata; the guide itself prints no date).

Each row is a name, usually "Contains: <allergens>", then 10 numbers. A few wrap
so the numbers sit on the line below, sometimes after a caffeine note. The Combo
Meals page is calorie ranges and is not read: a combo is its parts. Spirits are
ranges too ("85-150"), so they don't match and the model estimates them.
Limited-time items are kept under their own category.

usage: python shake_shack.py
"""

import re

from common import NUMTOK, REPO, clean_name, row, write

RAW = REPO / "data" / "restaurants" / "raw"
URL = "https://shakeshack.com/document/2451"
COLS = ("calories", "fat", "sat_fat", "trans_fat", "chol", "sodium_mg", "carbs", "fiber", "sugar",
        "protein")
ROW = re.compile(r"^(.*?)\s*" + r"\s+".join([NUMTOK] * len(COLS)) + r"$")
HEADINGS = {
    "Burgers": "Burgers", "Chicken": "Chicken", "Breakfast*": "Breakfast", "Extras": "Breakfast Extras",
    "Flat -Top Dogs": "Flat-Top Dogs", "Fries & Sides": "Fries & Sides", "Sauces": "Sauces",
    "Shakes": "Shakes", "Floats": "Floats", "Cups & Sundaes": "Cups & Sundaes", "Drinks": "Drinks",
    "Combo Meals": "Combo Meals", "Limited Time Offerings": "Limited Time Offerings",
    "Lifestyle Offerings": "Lifestyle Offerings",
    "Beer, Wines, Cocktails & Non-Alcoholic Drinks": "Beer, Wines & Cocktails",
}
SPELLING = {"Crossiant": "Croissant", "Caeser": "Caesar", "Ceaser": "Caesar",
            "Unsweetened Iced (": "Unsweetened Iced Tea (", "Sweetened Iced (": "Sweetened Iced Tea ("}
SIZE_WORD = re.compile(r",?\s+(Small|Large)$")
SIZE_PAREN = re.compile(r",?\s*\((\d[^)]*(?:oz|piece|Slices)[^)]*|Gallon|Small|Catering Box[^)]*)\)\.?")
# Whipped Cream is on both pages at different amounts.
CATEGORY_SIZE = {("Shakes", "Whipped Cream"): "on a shake", ("Cups & Sundaes", "Whipped Cream"): "on a cup"}
# Add Grilled Chicken's row prints no trans fat and shifts the rest one column
# left: 120 2.5 0 [65 430 1 0 0 0] 22. Chicken has sodium, so read it that way.
FIXES = {"Add Grilled Chicken": {"sodium_mg": "430", "carbs": "1", "fiber": "0", "sugar": "0"}}
# Prints 147 g of carbs on a 910 kcal dish (4/4/9 gives 1,193). The right figure
# can't be told from the guide, so the row is left out and the model estimates.
SKIP = {"NYC Late Night- Chopped Cheese Loaded Fries"}


def fetch():
    from pypdf import PdfReader

    path = sorted(RAW.glob("shake-shack_nutrition_*.pdf"))[-1]
    out, category, pending = [], "", ""
    for page in PdfReader(path).pages:
        for raw in (page.extract_text() or "").splitlines():
            line = re.sub(r"\s+", " ", clean_name(raw)).strip()
            if line in HEADINGS:
                category, pending = HEADINGS[line], ""
                continue
            m = ROW.match(line)
            if not m:
                if not line.startswith("Caffeine per serving"):
                    pending = line
                continue
            name = m.group(1).strip()
            if not name or name.startswith(("Caffeine per serving", "Calories per serving")):
                name = pending
            pending = ""
            if category == "Combo Meals" or not name:
                continue
            # A range's first half stays glued to the name: "... Double Shot 100-"
            # then 150 as calories, and "Contains: Wheat 100-" leaves no name at all.
            if re.search(r"\d\s*[-/]$", name):
                continue
            name = re.split(r"\s*Contains:", name)[0].replace("*", "").strip()
            if not name or name in SKIP:
                continue
            for wrong, right in SPELLING.items():
                name = name.replace(wrong, right)
            size = CATEGORY_SIZE.get((category, name), "")
            s = SIZE_PAREN.search(name)
            if s:
                size, name = s.group(1).lower(), (name[:s.start()] + name[s.end():]).strip()
            s = SIZE_WORD.search(name)
            if s:
                size, name = s.group(1).lower(), name[:s.start()]
            v = dict(zip(COLS, m.groups()[1:]))
            v.update(FIXES.get(name, {}))
            out.append(row("Shake Shack", category, name, URL, size=size,
                           **{k: v[k] for k in ("calories", "protein", "carbs", "fat", "sugar",
                                                "fiber", "sodium_mg")}))
    return write("shake-shack", out)


if __name__ == "__main__":
    fetch()
