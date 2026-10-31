"""Olive Garden, from its own nutrition PDF (media.olivegarden.com, US
restaurants, excludes Hawaii; footer code US_083126).

pypdf's plain text puts every number row on a page first and every name after
it, in a different order, so names can't be paired by line order. Instead this
reads each text fragment's position: a name sits ~20 pt above its own number
row. "less than 1 g" is split into a "less" fragment in its column and a
"than 1 g" fragment below it; "less" stands for <1 and the rest is dropped.

usage: python olive_garden.py
"""

import re

from common import REPO, row, write

RAW = REPO / "data" / "restaurants" / "raw"
URL = "https://www.olivegarden.com/nutrition"
COLS = ("calories", "cal_fat", "fat", "sat_fat", "trans_fat", "chol", "sodium_mg",
        "carbs", "fiber", "sugar", "protein")
NUM = re.compile(r"^[\d.,\s]+$")
HEADING = re.compile(r"^[A-Z][A-Z &'/,-]{3,}$")
# Header and footer furniture, never an item name.
FURNITURE = re.compile(r"^(Calorie|Cal\. from|Fat|Total|Sat Fat|Trans Fat|Cholester|ol|Sodium|"
                       r"Dietary|Fiber|Sugars|Protein|\(g\)|\(mg\)|Carbs\. \(g\)|US_\d+)$")


def fragments(page):
    frags = []

    def visit(text, cm, tm, font, size):
        t = text.replace("\n", " ").strip()
        if t:
            x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
            y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
            frags.append((y, x, t))

    page.extract_text(visitor_text=visit)
    return frags


def page_rows(page, state):
    """Rows on one page, each with its name. `state` carries the section
    heading and any name left over from the page before: the name column runs
    one item ahead of the numbers, so the last name at the bottom of a page
    belongs to the first number row of the next."""
    frags = fragments(page)
    # A number row is anchored on the fragment holding the leading run of
    # numbers; anything numeric or "less" within a few points of it, to its
    # right, belongs to the same row.
    anchors = sorted({round(y, 1) for y, x, t in frags if NUM.match(t) and len(t.split()) >= 5},
                     reverse=True)
    rows = []
    for ay in anchors:
        cells = sorted((x, t) for y, x, t in frags
                       if abs(y - ay) <= 8 and (NUM.match(t) or t == "less"))
        toks = []
        for _, t in cells:
            toks += ["<1"] if t == "less" else t.replace(",", "").split()
        rows.append({"y": ay, "nums": toks, "name": []})
    if rows and state["leftover"]:
        rows[0]["name"], rows[0]["category"] = state["leftover"], state["leftover_cat"]
    state["leftover"] = []
    for y, x, t in sorted(frags, key=lambda f: -f[0]):
        if NUM.match(t) or t == "less" or t.startswith("than 1 g") or FURNITURE.match(t):
            continue
        if HEADING.match(t):
            state["category"] = t.title()
            continue
        # The number row this name belongs to is the nearest one below it.
        below = [r for r in rows if 0 < y - r["y"] <= 40]
        if below:
            r = max(below, key=lambda r: r["y"])
            r["name"].append(t)
            r.setdefault("category", state["category"])
        elif not rows or y < rows[-1]["y"]:
            state["leftover"].append(t)
            state["leftover_cat"] = state["category"]
    return rows


# Sections that repeat a dish at another portion. The size field keeps them
# apart (and tells the parser which one was eaten); a plain dinner entree has none.
PORTION = (("lunch", "lunch portion"), ("lighter", "lighter portion"), ("kids", "kids"),
           ("gluten", "gluten-sensitive"), ("catering", "catering"), ("to go", "to go"))


def fetch():
    from pypdf import PdfReader

    path = sorted(RAW.glob("olive-garden_nutrition_*.pdf"))[-1]
    out, skipped = [], []
    state = {"category": "", "leftover": [], "leftover_cat": ""}
    for page in PdfReader(path).pages[1:]:
        for r in page_rows(page, state):
            name = " ".join(r["name"]).strip()
            if not name or len(r["nums"]) != len(COLS):
                skipped.append((name, r["nums"]))
                continue
            cat = r.get("category", "")
            portion = next((p for k, p in PORTION if k in cat.lower()), "")
            if portion == "catering":
                cat = "Catering"  # the later catering pages carry no heading of their own
            if name.lower().startswith("add "):
                # An add-on under the item above it ("Calamari" / "add marinara").
                # The same add-on repeats under every item; write() keeps one.
                size, name = ", ".join(filter(None, [portion, "add-on"])), name[4:].strip().capitalize()
            else:
                size = portion
            v = dict(zip(COLS, r["nums"]))
            out.append(row("Olive Garden", cat, name, URL, size=size,
                           **{k: v.get(k) for k in ("calories", "protein", "carbs", "fat", "sugar",
                                                    "fiber", "sodium_mg")}))
    if skipped:
        print(f"  {len(skipped)} number rows not paired, e.g.:")
        for s in skipped[:10]:
            print("   ", s)
    return write("olive-garden", out)


if __name__ == "__main__":
    fetch()
