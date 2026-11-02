"""Five Guys, from its own US Nutrition & Allergen PDF (fiveguys.com, chart dated
01-2024, still the file the site links as of 2026-11-02).

The guide lists components, not burgers: a cheeseburger is two patties, a bun
and cheese, which is how Five Guys builds and publishes it.

Items with two suppliers are listed twice. The first listed is kept, which also
drops Hot Dog (Supplier K)'s misprinted 460 g of carbs (260 kcal; its sodium is
750 and the 460 is likely a stray value).

usage: python five_guys.py
"""

import re

from common import NUMTOK, REPO, clean_name, row, write

RAW = REPO / "data" / "restaurants" / "raw"
URL = "https://www.fiveguys.com/nutritional-allergy-information"
COLS = ("serving_g", "calories", "cal_fat", "fat", "sat_fat", "trans_fat", "chol", "sodium_mg",
        "carbs", "fiber", "sugar", "protein")
ROW = re.compile(r"^(.*?)\s+" + r"\s+".join([NUMTOK] * len(COLS)) + r"$")
HEADINGS = {"MEAT": "Meat", "BUN": "Bun", "FRIES": "Fries", "TOPPINGS": "Toppings",
            "MILKSHAKES": "Milkshakes", "MIX-INS": "Mix-Ins", "OTHER ITEMS": "Other Items"}
FRIES = re.compile(r"^(Little|Regular|Large) (Five Guys|Cajun) Style$")
AMOUNT = re.compile(r"\s*\((\d+(?:\.\d+)?)\s*(pieces|slice|oz\.?|tbs)\)$")
# Little Cajun fries print 28 g of fat beside 204 kcal from fat, which is 23 g,
# the same as Little Five Guys Style.
FIXES = {("Fries", "Cajun Fries", "little"): {"fat": "23"}}


def fetch():
    from pypdf import PdfReader

    path = sorted(RAW.glob("five-guys_nutrition_*.pdf"))[-1]
    out, category = [], ""
    for page in PdfReader(path).pages:
        for raw in (page.extract_text() or "").splitlines():
            line = re.sub(r"\s+", " ", clean_name(raw)).strip()
            for head, label in HEADINGS.items():
                if line == head or line.startswith(head + " "):
                    category = label
            # Allergen marks are symbol-font glyphs after the last number.
            m = ROW.match(re.sub(r"[^0-9]+$", "", line))
            if not m:
                continue
            name, size = re.sub(r"\s*\(Supplier \w\)", "", m.group(1)).strip(), ""
            fries = FRIES.match(name)
            if fries:
                # "regular fries" means the plain ones, so that row is just "Fries".
                name, size = "Cajun Fries" if fries.group(2) == "Cajun" else "Fries", fries.group(1).lower()
            a = AMOUNT.search(name)
            if a:
                size, name = f"{a.group(1)} {a.group(2).rstrip('.')}", name[:a.start()]
            v = dict(zip(COLS, m.groups()[1:]))
            v.update(FIXES.get((category, name, size), {}))
            out.append(row("Five Guys", category, name, URL, size=size, serving_g=v["serving_g"],
                           **{k: v[k] for k in ("calories", "protein", "carbs", "fat", "sugar",
                                                "fiber", "sodium_mg")}))
    return write("five-guys", out)


if __name__ == "__main__":
    fetch()
