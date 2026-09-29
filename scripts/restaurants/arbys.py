"""Arby's: the Nutritional & Allergen PDF linked from arbys.com/nutrition
(downloaded 2026-09-28 with Danny's blanket OK for chains' own PDFs).

Columns: serving g, calories, calories from fat, fat, sat fat, trans fat,
cholesterol, sodium, carbs, fiber, sugars, protein. Rows carry an inline
"Contains: Wheat, Milk" allergen note between the name and the numbers."""

import re

from common import REPO, pdf_rows, row, write

RAW = sorted((REPO / "data" / "restaurants" / "raw").glob("arbys_nutrition_*.pdf"))[-1]
URL = "https://www.arbys.com/nutrition"
COLS = ("serving_g", "calories", "cal_fat", "fat", "sat_fat", "trans_fat", "chol",
        "sodium_mg", "carbs", "fiber", "sugar", "protein")


def main():
    out, category = [], ""
    for name, nums, held in pdf_rows(RAW, len(COLS)):
        for h in held:
            if re.fullmatch(r"[A-Z][A-Z &'/-]{3,}", h) and "PAGE" not in h:
                category = h.title()
        # The first row on each page carries the page header in front of it.
        name = re.split(r"Page \d+ of \d+", name)[-1].strip()
        name = re.sub(r"\s*Contains:.*$", "", name)
        name = re.sub(r"\s+(Egg|Milk|Soy|Wheat|Fish|Sesame)[^()]*\(where available\).*$", "", name)
        name = re.sub(r"\s+u(\s.*)?$", "", name)  # "u" = portion footnote marker
        name = re.sub(r"\s*[\u2020'] ?[A-Z][a-z]+,.*$", "", name)  # "† Egg, Milk, ..." may-contain note
        name = re.sub(r"^(OPTIONAL/REGIONAL\s*)?[\u2020'\s]+", "", name)  # footnote symbols before names
        name = re.sub(r"^[A-Z][A-Z &'/-]{3,}\s+(?=[A-Z][a-z])", "", name)  # heading glued on
        name = re.sub(r"\s+'\s+", " - ", name).replace("'n ", "'n ").strip(" *'")
        if not name or re.search(r"Page \d+ of", name):
            continue
        v = dict(zip(COLS, nums))
        out.append(row("Arby's", category, name, URL, serving_g=v["serving_g"],
                       **{k: v[k] for k in ("calories", "protein", "carbs", "fat", "sugar",
                                            "fiber", "sodium_mg")}))
    write("arbys", out)


if __name__ == "__main__":
    main()
