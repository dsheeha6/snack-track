"""Chick-fil-A: the nutrition page embeds its whole table, sizes included, as
WordPress interactivity state. Parent rows are the default size; sub_items are
the other sizes (small/large fries, 8/12 ct nuggets)."""

import html
import json
import re

from common import fetch, row, write

URL = "https://www.chick-fil-a.com/nutrition-allergens"
LABELS = {
    "Calories": "calories", "Protein (g)": "protein", "Carbohydrates (g)": "carbs",
    "Fat (g)": "fat", "Sugar (g)": "sugar", "Fiber (g)": "fiber",
    "Sodium (mg)": "sodium_mg", "Serving Size": "serving_g",
}
SKIP_MENUS = ("Trays", "Catering")  # party trays, not a portion anyone logs


def rows_from(item, category, out, parent_title=None):
    macros = {LABELS[f["label"]]: f["value"] for f in item.get("fields", []) if f["label"] in LABELS}
    title = html.unescape(item["title"])
    if macros.get("calories") is not None:
        size = ""
        if parent_title:
            size = title.replace(parent_title, "").strip() or title
        out.append(row("Chick-fil-A", category, parent_title or title, URL, size=size, **macros))
    for sub in item.get("sub_items", []):
        rows_from(sub, category, out, parent_title=title)


def main():
    page = fetch(URL)
    m = re.search(r'<script id="wp-script-module-data-@wordpress/interactivity" '
                  r'type="application/json">(.*?)</script>', page, re.S)
    state = json.loads(m.group(1))["state"]["nutrition-allergens-table-store"]["tableData"]["nutrition"]
    out = []
    for section in state:
        menu = html.unescape(section["menu"])
        if any(s in menu for s in SKIP_MENUS):
            continue
        for item in section["items"]:
            rows_from(item, menu, out)
    write("chick-fil-a", out)


if __name__ == "__main__":
    main()
