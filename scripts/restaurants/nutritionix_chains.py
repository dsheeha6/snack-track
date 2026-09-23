"""Chains without a readable official feed, via Nutritionix's menu pages.

Nutritionix is the calculator vendor behind several chains' own sites (Taco
Bell's "Nutrition Calculator" is m.nutritionix.com/taco-bell) and mirrors the
published numbers for the rest. Checked on 2026-09-21 against the four chains
pulled from official feeds: Chipotle proteins/rice/beans/guac/chips, Big Mac,
McChicken, QPCs, McNuggets 4-40, Chick-fil-A sandwich and nuggets all matched
exactly (one 5-calorie drift on Chipotle chips & salsa). Rows are tagged with
the Nutritionix URL so the provenance is never hidden.

Chains already pulled from an official feed are not repeated here.

usage: python nutritionix_chains.py [slug ...]   (no args = all)
"""

import sys
import time

from common import row, write
from nix import BASE, brand_rows

CHAINS = {
    "taco-bell": "Taco Bell", "wendys": "Wendy's", "burger-king": "Burger King",
    "subway": "Subway", "starbucks": "Starbucks", "dunkin": "Dunkin'",
    "panda-express": "Panda Express", "five-guys": "Five Guys",
    "shake-shack": "Shake Shack", "in-n-out-burger": "In-N-Out Burger",
    "popeyes": "Popeyes", "kfc": "KFC", "raising-canes": "Raising Cane's",
    "wingstop": "Wingstop", "zaxbys": "Zaxby's", "bojangles": "Bojangles",
    "sonic": "Sonic", "arbys": "Arby's", "jack-in-the-box": "Jack in the Box",
    "culvers": "Culver's", "whataburger": "Whataburger", "carls-jr": "Carl's Jr.",
    "hardees": "Hardee's", "del-taco": "Del Taco", "el-pollo-loco": "El Pollo Loco",
    "qdoba": "Qdoba", "panera-bread": "Panera Bread", "jimmy-johns": "Jimmy John's",
    "firehouse-subs": "Firehouse Subs", "potbelly": "Potbelly",
    "mcalisters-deli": "McAlister's Deli", "jasons-deli": "Jason's Deli",
    "noodles-company": "Noodles & Company", "pizza-hut": "Pizza Hut",
    "dominos": "Domino's", "papa-johns": "Papa John's", "mod-pizza": "MOD Pizza",
    "blaze-pizza": "Blaze Pizza", "dairy-queen": "Dairy Queen",
    "krispy-kreme": "Krispy Kreme", "tim-hortons": "Tim Hortons",
    "tropical-smoothie-cafe": "Tropical Smoothie Cafe", "smoothie-king": "Smoothie King",
    "olive-garden": "Olive Garden", "applebees": "Applebee's", "chilis": "Chili's",
    "cheesecake-factory": "The Cheesecake Factory", "texas-roadhouse": "Texas Roadhouse",
    "outback-steakhouse": "Outback Steakhouse", "red-robin": "Red Robin",
    "buffalo-wild-wings": "Buffalo Wild Wings", "ihop": "IHOP", "dennys": "Denny's",
    "cracker-barrel": "Cracker Barrel", "pf-changs": "P.F. Chang's",
    "wawa": "Wawa", "sheetz": "Sheetz",
}


def main():
    slugs = sys.argv[1:] or list(CHAINS)
    for slug in slugs:
        chain = CHAINS[slug]
        try:
            rows = brand_rows(slug)
        except Exception as e:  # one chain's outage must not lose the others
            print(f"{slug}: FAILED {e}")
            continue
        out = []
        for cat, name, path, d in rows:
            unit = f"{d.get('unit_qty', '')} {d.get('unit', '')}".strip()
            if unit.lower() in ("1 serving", "1 order", "1 item"):
                unit = ""
            out.append(row(chain, cat, name, BASE + path, size=unit,
                           **{k: d.get(k) for k in ("calories", "protein", "carbs", "fat",
                                                    "sugar", "fiber", "sodium_mg", "serving_g")}))
        try:
            write(slug, out)
        except SystemExit as e:
            print(e)
        time.sleep(1)


if __name__ == "__main__":
    main()
