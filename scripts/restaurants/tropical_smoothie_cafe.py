"""Tropical Smoothie Cafe, from its own Health & Nutrition Guide PDF
(tropicalsmoothiecafe.com, dated 05/14/26).

Two layouts share the first pages, and every row starts with its allergen
codes (single numbers 1-10, "Acai Bowl 6 7 560 ...") before the nutrition:

- Food: 11 columns. Calories, Cal from Fat, Fat, Sat Fat, Trans Fat,
  Cholesterol, Sodium, Carbs, Fiber, Sugars, Protein.
- Smoothies and drinks: 15 columns, with "N/A" where a value doesn't apply.
  Calories, Calories with Splenda, Cal from Fat, Fat, Sat Fat, Trans Fat,
  Cholesterol, Sodium, Carbs, Carbs with Splenda, Fiber, Sugars, Sugars with
  Splenda, Protein, Caffeine. Smoothies come sweetened with turbinado by
  default; the Splenda figures are written as a second row.

A line takes the drink layout when it has an N/A (no food row does) or sits in
a smoothie section (Mocha Madness has real caffeine, so no N/A). The third page (a limited-time Javablender sheet) runs
sodium and caffeine together ("210180") and is not read.

usage: python tropical_smoothie_cafe.py
"""

import re

from common import NUMTOK, REPO, clean_name, row, write

RAW = REPO / "data" / "restaurants" / "raw"
URL = "https://www.tropicalsmoothiecafe.com/nutrition"
FOOD = ("calories", "cal_fat", "fat", "sat_fat", "trans_fat", "chol", "sodium_mg", "carbs",
        "fiber", "sugar", "protein")
DRINK = ("calories", "calories_splenda", "cal_fat", "fat", "sat_fat", "trans_fat", "chol",
         "sodium_mg", "carbs", "carbs_splenda", "fiber", "sugar", "sugar_splenda", "protein",
         "caffeine")
HEADING = re.compile(r"^(['‘’]?[A-Z][A-Z &'’/-]{3,}?)\s*(\(.*\))?$")


def layout(cols):
    return re.compile(r"^(.*?)\s*" + r"\s+".join([NUMTOK] * len(cols)) + r"$")


FOOD_RE, DRINK_RE = layout(FOOD), layout(DRINK)


def fetch():
    from pypdf import PdfReader

    path = sorted(RAW.glob("tropical-smoothie-cafe_nutrition_*.pdf"))[-1]
    out, category, size, held = [], "", "", []
    for page in PdfReader(path).pages[:2]:
        for raw in (page.extract_text() or "").splitlines():
            line = re.sub(r"\s+", " ", clean_name(raw)).strip()
            line = re.sub(r"(?<![\d.])\.(\d)", r"0.\1", line)
            if not line:
                continue
            # A coffee smoothie has a real caffeine number and no N/A at all.
            drink = "N/A" in line or "Smoothie" in category
            cols = DRINK if drink else FOOD
            m = (DRINK_RE if drink else FOOD_RE).match(" ".join(held + [line.replace("N/A", "-")]))
            if not m:
                h = HEADING.match(line)
                if h:
                    category = h.group(1).strip().title()
                    oz = re.search(r"(\d+)\s*OZ", h.group(2) or "")
                    size, held = (f"{oz.group(1)} oz" if oz else ""), []
                else:
                    held = (held + [line])[-2:] if len(line) < 60 else []
                continue
            held = []
            # Allergen codes sit between the name and the numbers.
            name = re.sub(r"(\s+(?:10|[1-9]))+$", "", m.group(1)).strip(" *")
            if not name:
                continue
            if "Smoothie" in category and "smoothie" not in name.lower():
                name += " Smoothie"  # how people say it: "a Mango Magic smoothie"
            v = dict(zip(cols, [None if t == "-" else t for t in m.groups()[1:]]))
            out.append(row("Tropical Smoothie Cafe", category, name, URL, size=size,
                           **{k: v.get(k) for k in ("calories", "protein", "carbs", "fat", "sugar",
                                                    "fiber", "sodium_mg")}))
            if drink and v["calories_splenda"] and v["calories_splenda"] != v["calories"]:
                out.append(row("Tropical Smoothie Cafe", category, name, URL,
                               size=", ".join(filter(None, [size, "made with Splenda"])),
                               calories=v["calories_splenda"], carbs=v["carbs_splenda"],
                               sugar=v["sugar_splenda"],
                               **{k: v.get(k) for k in ("protein", "fat", "fiber", "sodium_mg")}))
    return write("tropical-smoothie-cafe", out)


if __name__ == "__main__":
    fetch()
