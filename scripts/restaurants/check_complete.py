"""Compare each Nutritionix chain's saved rows against its live menu listing.

A shortfall means item pages failed during the fetch and were dropped. Rows
can legitimately be a little under the listing (duplicate names collapse,
calorie-only rows are refused), so only a gap over 10% is flagged.

usage: python check_complete.py [slug ...]
"""

import json
import sys

from common import OUT
from nix import menu
from nutritionix_chains import CHAINS


def main():
    short = []
    for slug in sys.argv[1:] or CHAINS:
        f = OUT / f"{slug}.jsonl"
        have = sum(1 for _ in open(f, encoding="utf-8")) if f.exists() else 0
        try:
            listed = len(menu(slug))
        except Exception as e:
            print(f"{slug:24} menu fetch failed: {e}")
            continue
        flag = "  SHORT" if have < 0.9 * listed else ""
        print(f"{slug:24} listed {listed:5}  saved {have:5}{flag}")
        if flag:
            short.append(slug)
    print("short:", " ".join(short))


if __name__ == "__main__":
    main()
