"""El Pollo Loco: the one-page Nutrition Guide PDF linked from
elpolloloco.com/nutrition (downloaded 2026-09-28, blanket OK for chains' own
PDFs). Columns: serving oz, calories, calories from fat, fat, sat fat, trans
fat, cholesterol, sodium, carbs, fiber, sugars, protein, then allergen X marks
(stripped)."""

import re

from common import REPO, pdf_rows, row, write

RAW = sorted((REPO / "data" / "restaurants" / "raw").glob("el-pollo-loco_nutrition_*.pdf"))[-1]
URL = "https://www.elpolloloco.com/nutrition"
COLS = ("serving_oz", "calories", "cal_fat", "fat", "sat_fat", "trans_fat", "chol",
        "sodium_mg", "carbs", "fiber", "sugar", "protein")


def main():
    out, category, base = [], "", ""
    sizes = r"(Original|Regular|Small|Large|Kids|Mini)"
    for name, nums, held in pdf_rows(RAW, len(COLS)):
        for h in held:
            if re.fullmatch(r"[A-Z][A-Z &'/()a-z-]{3,}", h) and h[:4].isupper() and h not in ("NUTRITION GUIDE",):
                category = h.title()
        name = name.strip(" *'")
        # Page furniture from the top of the sheet lands on the first row.
        name = re.sub(r"^.*NUTRITION GUIDE\s+FEATURED\s+", "", name)
        # "SIDES (Small) & SAUCES Pinto Beans": heading with a lowercase aside.
        m = re.match(r"^([A-Z][A-Z-]+(?: [A-Z&-]+)*(?: \([^)]*\))?(?: [A-Z&-]+)*)\s+(?=[A-Z][a-z])", name)
        if m and (" (" in m.group(1) or len(m.group(1).split()) >= 2):
            category, name = m.group(1).title(), name[m.end():]
        # A heading can share the line with the first row of its section.
        m = re.match(r"^([A-Z][A-Z &'/-]{3,})\s+(?=[A-Z][a-z0-9])", name)
        if m and m.group(1).strip() not in ("FUZE", "HI-C"):  # brand names, not headings
            category, name = m.group(1).strip().title(), name[m.end():]
        # Drinks list the name once, then one row per size: "Coca-Cola Regular",
        # " Large". Split the size off and carry the name down to bare-size rows.
        size = ""
        m = re.fullmatch(sizes, name.strip())
        if m and base:
            name, size = base, m.group(1)
            if "without ice" in category.lower():
                size += " (no ice)"
        else:
            m = re.search(r"\s" + sizes + r"$", name)
            if m and category.lower().startswith(("beverage", "drink")) or (m and "**" in name):
                name, size = name[:m.start()], m.group(1)
                if "without ice" in category.lower():
                    size += " (no ice)"
            name = name.strip(" *")
            base = name
        v = dict(zip(COLS, nums))
        grams = None if v["serving_oz"] is None else float(v["serving_oz"]) * 28.35
        out.append(row("El Pollo Loco", category, name, URL, size=size, serving_g=grams,
                       **{k: v[k] for k in ("calories", "protein", "carbs", "fat", "sugar",
                                            "fiber", "sodium_mg")}))
    write("el-pollo-loco", out)


if __name__ == "__main__":
    main()
