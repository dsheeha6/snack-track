"""Generate evals/meals_hard.jsonl from evals/hard_source.json.

The hard set's ground truth is per-ITEM bands (see hard_source.json), because
that is the level a human can actually defend: you can argue about how big a
restaurant pommes aligot is, and you can argue about it separately from how big
the burger is. This script rolls those item bands up into one band per meal and
writes the flat file run.py scores.

How the item bands combine, and why it matters:

    midpoint  = sum of item midpoints
    halfwidth = sqrt(sum of item halfwidths squared)      <- quadrature

Adding the halfwidths straight up would be wrong in a way that quietly breaks
the instrument. On an eight-item meal it produces a band so wide that almost
any answer scores zero error, and an eval nothing can fail measures nothing.
Quadrature says what is actually true: the errors on "how big was the aligot"
and "how big was the burger" are independent, so they partly cancel, and the
combined uncertainty grows like the square root of the item count rather than
linearly.

The linear band is still written to each row as `expected_range_linear` so the
looser reading is one flag away and nobody has to re-derive it. Scoring uses
the quadrature band.

Usage:
    python build_hard.py            # writes meals_hard.jsonl
    python build_hard.py --check    # verify the committed file matches the source
"""

import argparse
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "hard_source.json"
OUT = HERE / "meals_hard.jsonl"

MACROS = ("calories", "protein", "carbs", "fat")
# hard_source.json uses short keys per item; the generated file uses the same
# macro names as meals.jsonl so one harness reads both.
SHORT = {"calories": "cal", "protein": "p", "carbs": "c", "fat": "f"}


def combine(bands):
    """Roll a list of [lo, hi] item bands into one meal band.

    Returns (midpoint, quadrature_band, linear_band), each rounded to one
    decimal - the ground truth is not precise enough to justify more, and a
    file full of 4962.499999 invites false confidence.
    """
    mids = [(lo + hi) / 2.0 for lo, hi in bands]
    halves = [(hi - lo) / 2.0 for lo, hi in bands]
    mid = sum(mids)
    quad = math.sqrt(sum(h * h for h in halves))
    lin = sum(halves)
    r = lambda x: round(x, 1)  # noqa: E731
    return r(mid), [r(mid - quad), r(mid + quad)], [r(mid - lin), r(mid + lin)]


def build():
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    rows = []
    for meal in source["meals"]:
        items = meal["items"]
        expected, expected_range, linear_range = {}, {}, {}
        for macro in MACROS:
            key = SHORT[macro]
            bands = [item[key] for item in items]
            mid, quad, lin = combine(bands)
            expected[macro] = mid
            expected_range[macro] = quad
            linear_range[macro] = lin

        rows.append({
            "id": meal["id"],
            "text": meal["text"],
            "meal": meal.get("meal", "snacks"),
            # Item-level truth travels with the row so a bad meal can be read
            # without opening the source file. Midpoints only - the bands stay
            # in hard_source.json where the reasoning lives next to them.
            "expected_items": [
                {
                    "name": item["name"],
                    **{macro: round((item[SHORT[macro]][0] + item[SHORT[macro]][1]) / 2.0, 1)
                       for macro in MACROS},
                }
                for item in items
            ],
            "expected": expected,
            "expected_range": expected_range,
            "expected_range_linear": linear_range,
            "tags": meal.get("tags", []),
            "note": meal.get("note", ""),
        })
    return rows


def serialise(rows):
    return "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true",
                    help="exit non-zero if meals_hard.jsonl is stale rather than rewriting it")
    args = ap.parse_args()

    text = serialise(build())
    if args.check:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            raise SystemExit(f"{OUT.name} is stale - run `python build_hard.py`")
        print(f"{OUT.name} is up to date")
        return

    OUT.write_text(text, encoding="utf-8", newline="\n")
    rows = build()
    print(f"Wrote {len(rows)} meals to {OUT}")
    print(f"\n{'id':<5} {'kcal midpoint':>14}  {'band (quadrature)':>22}  {'+/-':>6}")
    for r in rows:
        lo, hi = r["expected_range"]["calories"]
        mid = r["expected"]["calories"]
        pct = (hi - mid) / mid * 100 if mid else 0
        print(f"{r['id']:<5} {mid:>14}  {f'{lo} - {hi}':>22}  {pct:>5.1f}%")


if __name__ == "__main__":
    main()
