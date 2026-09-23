"""CAVA: the only published source is the Nutrition and Allergen Guide PDF
linked from cava.com/nutrition (downloaded with Danny's OK, 2026-09-21, to
data/restaurants/raw/cava_nutrition_*.pdf). cava.com itself 403s scripts.

Each nutrition row is a name followed by exactly 11 numbers in the guide's
column order; section headers are all-caps lines. Allergen pages don't have
11 numbers per row, so they never match."""

import re

from pypdf import PdfReader

from common import REPO, row, write

RAW = sorted((REPO / "data" / "restaurants" / "raw").glob("cava_nutrition_*.pdf"))[-1]
URL = "https://cava.com/nutrition"
COLS = ("calories", "cal_fat", "fat", "sat_fat", "trans_fat", "chol", "sodium_mg",
        "carbs", "fiber", "sugar", "protein")
NUM = r"(<?\d+(?:\.\d+)?)"
ROW = re.compile(r"^(.+?)\s+" + r"\s+".join([NUM] * 11) + r"\s*$")


def main():
    out, category = [], ""
    for page in PdfReader(RAW).pages:
        for line in (page.extract_text() or "").splitlines():
            line = re.sub(r"\s+", " ", line).strip()
            m = ROW.match(line)
            if m:
                vals = dict(zip(COLS, m.groups()[1:]))
                out.append(row("CAVA", category, m.group(1), URL,
                               **{k: vals[k] for k in ("calories", "protein", "carbs", "fat",
                                                       "sugar", "fiber", "sodium_mg")}))
            elif re.fullmatch(r"[A-Z][A-Z +&'/-]{2,}", line.replace(" ", "") and line):
                # The PDF's text layer splits "CURATED" as "CU RATE D".
                category = re.sub(r"\s+", " ", line).replace("CU RATE D", "CURATED").title()
    write("cava", out)


if __name__ == "__main__":
    main()
