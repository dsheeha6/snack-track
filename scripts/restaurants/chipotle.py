"""Chipotle: built from the nutrition feed the official calculator loads,
services.chipotle.com/menu-metadata/v1/menu-metadata/nutrition.

That feed only answers inside a browser session (bot protection), so it is
captured from the calculator page in a browser and saved to
data/restaurants/raw/chipotle_feed_<date>.json; this script turns the capture
into rows. To refresh: open chipotle.com/nutrition-calculator, run the capture
snippet in the build log entry for 2026-09-21, save over the raw file, rerun.

The feed carries ids and numbers but no display names, repeats every protein
once per entree type, and has some broken rows (calories with zero macros, a
cauliflower rice listed at both 60 and 140 for the same 4 oz). So this is a
reviewed map, not a blind dump: only the bowl/burrito portions, only rows whose
macros agree with their calories, names checked by hand against the image slug
and menu section. An id that is not in CURATED is not imported.
"""

import json
from pathlib import Path

from common import REPO, row, write

RAW = sorted((REPO / "data" / "restaurants" / "raw").glob("chipotle_feed_*.json"))[-1]
URL = "https://www.chipotle.com/nutrition-calculator"

# id: (category, display name, portion override or None)
CURATED = {
    "CMG-101": ("Protein", "Chicken", None),
    "CMG-102": ("Protein", "Steak", None),
    "CMG-103": ("Protein", "Carnitas", None),
    "CMG-104": ("Protein", "Barbacoa", None),
    "CMG-105": ("Protein", "Sofritas", None),
    "CMG-108": ("Protein", "Carne Asada", None),
    "CMG-112": ("Protein", "Smoked Brisket", None),
    "CMG-113": ("Protein", "Pollo Asado", None),
    "CMG-114": ("Protein", "Plant-Based Chorizo", None),
    "CMG-115": ("Protein", "Garlic Steak", None),
    "CMG-117": ("Protein", "Chipotle Honey Chicken", None),
    "CMG-118": ("Protein", "Chicken Tinga", None),
    "CMG-5001": ("Rice", "White Rice (cilantro-lime)", None),
    "CMG-5002": ("Rice", "Brown Rice (cilantro-lime)", None),
    "CMG-1039": ("Rice", "Mexican Cauliflower Rice", None),
    "CMG-5051": ("Beans", "Black Beans", None),
    "CMG-5052": ("Beans", "Pinto Beans", None),
    "CMG-5101": ("Toppings", "Fajita Veggies", None),
    "CMG-5201": ("Toppings", "Fresh Tomato Salsa", None),
    "CMG-5202": ("Toppings", "Roasted Chili-Corn Salsa", None),
    "CMG-5203": ("Toppings", "Tomatillo-Green Chili Salsa", None),
    "CMG-5204": ("Toppings", "Tomatillo-Red Chili Salsa", None),
    "CMG-5251": ("Toppings", "Sour Cream", None),
    "CMG-5252": ("Toppings", "Cheese (Monterey Jack)", None),
    "CMG-1001": ("Toppings", "Guacamole (on the entree)", None),
    "CMG-1029": ("Toppings", "Queso Blanco (on the entree)", None),
    "CMG-5351": ("Toppings", "Romaine Lettuce", None),
    "CMG-5353": ("Toppings", "Chipotle-Honey Vinaigrette", None),
    "CMG-5355": ("Toppings", "Adobo Ranch", None),
    "CMG-5410": ("Toppings", "Red Chimichurri", None),
    "CMG-5412": ("Toppings", "Cilantro-Lime Sauce", None),
    # The feed says "1 oz" for a 320-calorie tortilla; its twin CMG-4025 says 4 oz.
    "CMG-4026": ("Tortilla", "Flour Tortilla (burrito)", "4 oz"),
    "CMG-5401": ("Tortilla", "Flour Tortilla (taco, one)", None),
    "CMG-1009": ("Sides", "Side of Guacamole", None),
    "CMG-1025": ("Sides", "Large Side of Guacamole", None),
    "CMG-1030": ("Sides", "Side of Queso Blanco", None),
    "CMG-1031": ("Sides", "Large Side of Queso Blanco", None),
    "CMG-1002": ("Chips", "Chips", None),
    "CMG-1005": ("Chips", "Chips & Fresh Tomato Salsa", None),
    "CMG-1003": ("Chips", "Chips & Guacamole", None),
    "CMG-1032": ("Chips", "Chips & Queso Blanco", None),
    "CMG-1015": ("Chips", "Large Chips & Large Guacamole", None),
    "CMG-1033": ("Chips", "Large Chips & Large Queso Blanco", None),
    "CMG-5362": ("Chips", "Chili-Lime Chips", None),
    "CMG-5363": ("Chips", "Large Chili-Lime Chips", None),
    "CMG-1125": ("High Protein Cups", "Side of Chicken", None),
    "CMG-1131": ("High Protein Cups", "Side of Chipotle Honey Chicken", None),
    "CMG-2010": ("Drinks", "Organic Lemonade", None),
    "CMG-2011": ("Drinks", "Organic Lemonade", None),
    "CMG-2019": ("Drinks", "Organic Watermelon Limeade", None),
    "CMG-2020": ("Drinks", "Organic Watermelon Limeade", None),
    "CMG-2810": ("Drinks", "Mexican Coca-Cola", None),
    "CMG-2839": ("Drinks", "Mexican Sprite", None),
}


def main():
    feed = {r["id"]: r for r in json.load(open(RAW, encoding="utf-8"))}
    out = []
    for cid, (cat, name, portion) in CURATED.items():
        r = feed.get(cid)
        if not r or r.get("cal") is None:
            raise SystemExit(f"{cid} ({name}) missing from {RAW.name}: menu changed, re-review")
        size = portion or r["portion"]
        out.append(row("Chipotle", cat, name, URL, size=size,
                       calories=r["cal"], protein=r["p"], carbs=r["c"], fat=r["f"],
                       sugar=r["sugar"], fiber=r["fiber"], sodium_mg=r["na"]))
    write("chipotle", out)


if __name__ == "__main__":
    main()
