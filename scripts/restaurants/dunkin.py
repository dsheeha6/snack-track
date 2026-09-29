"""Dunkin': the Nutrition Guide PDF linked from dunkindonuts.com/en/menu/nutrition
(downloaded 2026-09-28, blanket OK for chains' own PDFs). Each section is a
product-family heading, then a column-header block, then rows of: name,
serving size ("Large", "1 Croissant"), and 15 numbers (calories, fat, sat,
trans, cholesterol, sodium, carbs, fiber, sugars, added sugars, protein,
vitamin D, potassium, calcium, iron)."""

import re

from common import REPO, pdf_rows, row, write

RAW = sorted((REPO / "data" / "restaurants" / "raw").glob("dunkin_nutrition_*.pdf"))[-1]
URL = "https://www.dunkindonuts.com/en/menu/nutrition"
COLS = ("calories", "fat", "sat_fat", "trans_fat", "chol", "sodium_mg", "carbs", "fiber",
        "sugar", "added_sugar", "protein", "vit_d", "potassium", "calcium", "iron")
HEADERS = {"Serving Size", "Calories", "Total Fat (g)", "Saturated Fat (g)", "Trans Fat (g)",
           "Cholesterol (mg)", "Sodium (mg)", "Total Carb (g)", "Dietary Fiber (g)",
           "Total Sugars (g)", "Added Sugars (g)", "Protein (g)", "Vitamin D (mcg)",
           "Potassium (mg)", "Calcium (mg)", "Iron (mg)"}
SIZES = r"(Small|Medium|Large|Extra Large|XLarge|Kids|Mini|Regular)"


def main():
    out = []
    section = {"name": ""}

    def is_header(line):
        return line in HEADERS

    def on_header(held):
        # The line right before the column headers is the product family.
        if held[-1] not in HEADERS and not held[-1].startswith(("The information", "Before placing", "occurring")):
            section["name"] = held[-1]

    for name, nums, held in pdf_rows(RAW, len(COLS), is_header=is_header, on_header=on_header,
                                     trailing_junk=None):
        category = section["name"]
        if "+H" in name:  # spreadsheet formula residue in one row of the guide
            continue
        name = re.sub(r"^(Nutrition Guide|The information below.*|Before placing.*|occurring trans.*)$", "", name)
        v = dict(zip(COLS, nums))
        # "Pumpkin Pie Coffee Chiller - Large Large" / "... - Medium Medium": the
        # trailing serving-size column repeats the size already in the name.
        size = ""
        m = re.search(r"\s?-\s" + SIZES + r"\s+" + SIZES + r"$", name)
        if m:
            size, name = m.group(2).replace("XLarge", "Extra Large"), name[:m.start()]
        else:
            m = re.search(r"\s(\d+(?:\.\d+)?\s?(?:oz|fl oz|g|Donut|Croissant|Sandwich|Bagel|Muffin|"
                          r"Wrap|Order|Piece|Pieces|Each|Serving|Cookie|Munchkin|Munchkins|Tub|Bowl|Pack|"
                          r"Flatbread|Stuffer|Stuffers)s?)$", name, re.I)
            if m:
                size, name = m.group(1), name[:m.start()]
            else:
                m = re.search(r"\s" + SIZES + r"$", name)
                if m:
                    size, name = m.group(1), name[:m.start()]
        out.append(row("Dunkin'", category, name.strip(" -"), URL, size=size,
                       **{k: v[k] for k in ("calories", "protein", "carbs", "fat", "sugar",
                                            "fiber", "sodium_mg")}))
    write("dunkin", out)


if __name__ == "__main__":
    main()
