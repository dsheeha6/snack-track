"""Sweetgreen: the nutrition guide is plain HTML tables, one per section
(salads, bowls, plates, and the individual ingredients for build-your-own).
Columns are read from each table's own header row, not assumed."""

import html
import re

from common import fetch, row, write

URL = "https://www.sweetgreen.com/nutrition"
COLS = {"Menu item": "item", "Serving size": "serving_g", "Calories": "calories",
        "Fat (g)": "fat", "Sodium (mg)": "sodium_mg", "Carbs (g)": "carbs",
        "Fiber (g)": "fiber", "Sugar (g)": "sugar", "Protein (g)": "protein"}


def cells(tr):
    return [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
            for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", tr, re.S)]


def main():
    page = fetch(URL)
    out = []
    for m in re.finditer(r"<table.*?</table>", page, re.S):
        table = m.group(0)
        cap = re.search(r"<caption[^>]*>(.*?)</caption>", table, re.S)
        before = re.findall(r"<h[23][^>]*>(.*?)</h[23]>", page[:m.start()], re.S)
        category = re.sub(r"<[^>]+>|\s+nutrition information", "", (cap.group(1) if cap else before[-1] if before else "")).strip()
        trs = re.findall(r"<tr.*?</tr>", table, re.S)
        header = cells(trs[0])
        idx = {COLS[h]: i for i, h in enumerate(header) if h in COLS}
        if "calories" not in idx:
            continue
        for tr in trs[1:]:
            c = cells(tr)
            if len(c) < len(header):
                continue
            vals = {k: c[i] for k, i in idx.items()}
            name = vals.pop("item")
            size = vals.get("serving_g", "")
            out.append(row("Sweetgreen", html.unescape(category), name, URL, size=size, **vals))
    write("sweetgreen", out)


if __name__ == "__main__":
    main()
