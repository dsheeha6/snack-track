"""Del Taco, from its own nutrition list PDF (deltaco.com, September 2026).

Each row is a name, a serving ("264g" or "24 fl oz"), then 10 numbers. pypdf
returns the section labels at the end of each page instead of beside their
rows, so sections are set by the first item in each. The meal tables only give
calorie ranges, have no serving column, and are not read: a meal is its parts.

Two snack rows print a weight that can't be right (Cheetos "2 oz Bag" as 28 g,
Queso & Chips "4 oz" as 61 g, both over 9 kcal/g), so serving_g is left empty
when the weight is impossible for the calories.

usage: python del_taco.py
"""

import re

from common import NUMTOK, REPO, clean_name, num, row, write

RAW = REPO / "data" / "restaurants" / "raw"
URL = "https://www.deltaco.com/nutrition.html"
COLS = ("calories", "fat", "sat_fat", "trans_fat", "chol", "sodium_mg", "carbs", "fiber", "sugar",
        "protein")
ROW = re.compile(r"^(.*?)\s*(\d+(?:\.\d+)?g|\d+(?:\.\d+)? fl oz)\s+"
                 + r"\s+".join([NUMTOK] * len(COLS)) + r"$")
SECTIONS = {
    "All-American Burgertaco": "Tacos",
    "8 Layer Veggie Burrito": "Burritos",
    "Epic Carne Asada Steak Cali Bacon Burrito": "Epic Burritos",
    "3 Layer Queso Nachos": "Quesadillas & Nachos",
    "Bean & Cheese Cup": "Sides",
    "Taco Salad with Fresh Guac (Carne Asada Steak)": "Salads",
    "3 Pc. Crispy Chicken & Fries Box (Chipotle Dipping Sauce)": "Burgers & Fries",
    "Breakfast Big Fat Taco (Bacon Egg & Cheese)": "Breakfast",
    "Caramel Cheesecake Bites (2 Pc.)": "Desserts & Shakes",
    "Del Inferno Hot Sauce Packet": "Sauce Packets",
    "Barq's Root Beer (Large)": "Drinks",
}
SHAKE = re.compile(r"^(Mini|Regular|Large) Shake \((\w+)\)$")
SIZE = re.compile(r"\s*\((Large|Regular|Small|Regular-sized)\)$")


def fetch():
    from pypdf import PdfReader

    path = sorted(RAW.glob("del-taco_nutrition_*.pdf"))[-1]
    out, category, held = [], "", ""
    for page in PdfReader(path).pages:
        for raw in (page.extract_text() or "").splitlines():
            line = re.sub(r"\s+", " ", clean_name(raw)).strip()
            m = ROW.match(line)
            if not m:
                held = line  # "Simply Orange" wraps above its numbers
                continue
            name = m.group(1).strip() or held
            held = ""
            category = SECTIONS.get(name, category)
            serving, size = m.group(2), ""
            shake = SHAKE.match(name)
            if shake:
                name, size = f"{shake.group(2)} Shake", shake.group(1).lower()
            s = SIZE.search(name)
            if s:
                size, name = s.group(1).replace("-sized", "").lower(), name[:s.start()]
            v = dict(zip(COLS, m.groups()[2:]))
            grams = None
            if serving.endswith("g"):
                grams = serving[:-1]
                if num(v["calories"]) / num(grams) > 9:
                    grams = None
            else:
                size = f"{size} ({serving})" if size else serving
            out.append(row("Del Taco", category, name, URL, size=size, serving_g=grams,
                           **{k: v[k] for k in ("calories", "protein", "carbs", "fat", "sugar",
                                                "fiber", "sodium_mg")}))
    return write("del-taco", out)


if __name__ == "__main__":
    fetch()
