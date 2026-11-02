"""Natural-language food parsing for SNACK TRACK -- local stand-in edition.

This is the shape of the real feature with a dumb engine behind it. The real
version sends the sentence to Claude and gets structured JSON back; this one
splits the sentence up and matches each piece against a local ingredient table
plus whatever you've logged before.

It gets simple sentences right ("3 eggs on sourdough with sriracha"), and when
it can't match something it says so instead of guessing -- which is exactly what
the real pipeline does too. Swap `parse_text()` for a Claude call and the API
response shape, and therefore the whole UI, stays identical.
"""

import re

# alias(es) -> unit, (cal, protein, carbs, fat) per unit, default qty, high-variance?
INGREDIENTS = [
    (["egg white"], "each", (17, 3.6, 0.2, 0.1), 3, False),
    (["egg"], "each", (72, 6.3, 0.4, 4.8), 2, False),
    (["sourdough", "bread", "toast", "slice of bread"], "slice", (120, 4.8, 23, 0.8), 2, False),
    (["bagel"], "each", (280, 11, 55, 1.5), 1, False),
    (["english muffin"], "each", (134, 5, 26, 1), 1, False),
    (["tortilla", "wrap"], "each", (140, 4, 24, 3.5), 1, False),
    (["oatmeal", "oats", "porridge"], "cup", (160, 6, 27, 3.5), 1, False),
    (["white rice", "jasmine rice", "rice"], "cup", (205, 4.3, 45, 0.4), 1, False),
    (["brown rice"], "cup", (216, 5, 45, 1.8), 1, False),
    (["pasta", "spaghetti", "noodles"], "cup", (200, 7, 43, 1.2), 1.5, False),
    (["quinoa"], "cup", (222, 8, 39, 3.6), 1, False),
    (["couscous"], "cup", (176, 6, 36, 0.3), 1, False),
    (["chicken breast", "chicken"], "oz", (47, 8.7, 0, 1.0), 6, False),
    (["salmon"], "oz", (58, 6.5, 0, 3.5), 6, False),
    (["cod", "tilapia", "white fish"], "oz", (30, 6.5, 0, 0.3), 6, False),
    (["shrimp"], "oz", (28, 6.5, 0, 0.3), 6, False),
    (["steak", "sirloin", "ribeye"], "oz", (68, 7.5, 0, 4.0), 6, False),
    (["ground beef", "ground turkey", "beef"], "oz", (55, 7.0, 0, 3.0), 5, False),
    (["pork chop", "pork"], "oz", (60, 7.0, 0, 3.5), 5, False),
    (["deli turkey", "turkey slice", "turkey"], "slice", (30, 5, 1, 0.5), 4, False),
    (["ham"], "slice", (30, 5, 1, 1), 3, False),
    (["turkey bacon"], "slice", (30, 2, 0, 2), 2, False),
    (["bacon"], "slice", (43, 3, 0.1, 3.3), 2, False),
    (["hot dog"], "each", (150, 5, 2, 13), 1, False),
    (["tofu"], "oz", (40, 4.5, 1, 2.2), 6, False),
    (["black beans", "beans"], "cup", (227, 15, 41, 0.9), 0.5, False),
    (["string cheese"], "each", (80, 7, 1, 6), 1, False),
    (["cheese"], "oz", (110, 7, 1, 9), 1, True),
    (["tuna"], "packet", (70, 16, 0, 0.5), 1, False),
    (["peanut butter"], "tbsp", (95, 4, 3.5, 8), 2, True),
    (["almond butter"], "tbsp", (98, 3.4, 3, 9), 2, True),
    (["butter"], "tbsp", (102, 0.1, 0, 11.5), 1, True),
    (["olive oil", "oil"], "tbsp", (119, 0, 0, 13.5), 1, True),
    (["avocado"], "each", (240, 3, 12, 22), 0.5, False),
    (["banana"], "each", (105, 1.3, 27, 0.4), 1, False),
    (["apple"], "each", (95, 0.5, 25, 0.3), 1, False),
    (["orange"], "each", (62, 1.2, 15, 0.2), 1, False),
    (["blueberries", "berries", "strawberries"], "cup", (80, 1, 19, 0.5), 1, False),
    (["greek yogurt"], "cup", (130, 22, 9, 0.7), 1, False),
    (["yogurt"], "cup", (150, 12, 17, 4), 1, False),
    (["cottage cheese"], "cup", (160, 25, 8, 3), 1, False),
    (["oat milk"], "cup", (120, 3, 16, 5), 1, False),
    (["almond milk"], "cup", (39, 1, 3.5, 2.5), 1, False),
    (["milk"], "cup", (122, 8, 12, 4.8), 1, False),
    (["protein powder", "whey"], "scoop", (120, 24, 3, 1.5), 1, False),
    (["protein shake"], "each", (160, 25, 8, 3), 1, False),
    (["protein bar"], "each", (210, 20, 22, 7), 1, True),
    (["protein cookie"], "each", (380, 15, 45, 16), 1, True),
    (["cookie"], "each", (200, 2, 28, 9), 1, True),
    (["sweet potato"], "each", (130, 2.4, 30, 0.2), 1, False),
    (["potato"], "each", (160, 4, 37, 0.2), 1, False),
    (["broccoli"], "cup", (55, 3.7, 11, 0.6), 1, False),
    (["green beans", "asparagus"], "cup", (40, 2.5, 8, 0.3), 1, False),
    (["spinach"], "cup", (7, 0.9, 1.1, 0.1), 1, False),
    (["arugula"], "cup", (5, 0.5, 0.7, 0.1), 1, False),
    (["sprouts"], "cup", (30, 3, 6, 0.2), 0.5, False),
    (["mixed greens", "salad greens", "lettuce"], "cup", (10, 1, 2, 0.1), 2, False),
    (["tomato"], "each", (22, 1, 5, 0.2), 1, False),
    (["sriracha", "hot sauce"], "tbsp", (15, 0.3, 3, 0), 1, False),
    (["ketchup"], "tbsp", (19, 0.2, 5, 0), 1, False),
    (["mayo", "mayonnaise"], "tbsp", (94, 0.1, 0.1, 10), 1, True),
    (["ranch", "dressing", "vinaigrette"], "tbsp", (73, 0.1, 1, 8), 2, True),
    (["teriyaki", "teriyaki sauce", "bbq sauce"], "tbsp", (30, 0.7, 6.5, 0), 2, False),
    (["soy sauce"], "tbsp", (9, 1, 1, 0), 1, False),
    (["honey"], "tbsp", (64, 0, 17, 0), 1, False),
    (["maple syrup", "syrup"], "tbsp", (52, 0, 13, 0), 2, False),
    (["almonds", "cashews", "nuts"], "oz", (164, 6, 6, 14), 1, True),
    (["peanuts"], "oz", (161, 7, 5, 14), 1, True),
    (["chips"], "oz", (150, 2, 15, 10), 1, True),
    (["popcorn"], "cup", (31, 1, 6, 0.4), 4, False),
    (["granola"], "cup", (470, 10, 64, 20), 0.5, True),
    (["cereal"], "cup", (150, 3, 33, 2), 1, False),
    (["pancake"], "each", (90, 2, 15, 3), 3, False),
    (["waffle"], "each", (220, 6, 25, 10), 1, False),
    (["burrito bowl"], "each", (620, 48, 72, 14), 1, True),
    (["burrito"], "each", (600, 25, 70, 22), 1, True),
    (["pizza"], "slice", (285, 12, 36, 10), 2, True),
    (["burger", "cheeseburger"], "each", (550, 30, 40, 28), 1, True),
    (["sandwich"], "each", (450, 25, 45, 18), 1, True),
    (["taco"], "each", (200, 10, 15, 10), 2, False),
    (["sushi roll", "sushi"], "each", (250, 9, 38, 6), 1, True),
    (["ice cream"], "cup", (270, 4.6, 31, 14), 1, True),
    (["latte", "cappuccino"], "each", (150, 8, 12, 8), 1, True),
    (["coffee", "espresso"], "cup", (2, 0.3, 0, 0), 1, False),
    (["orange juice", "juice"], "cup", (112, 1.7, 26, 0.3), 1, False),
    (["soda", "coke"], "can", (140, 0, 39, 0), 1, False),
    (["beer"], "each", (153, 1.6, 13, 0), 1, False),
    (["wine"], "glass", (125, 0.1, 4, 0), 1, False),
    (["whiskey", "vodka", "tequila", "shot"], "shot", (97, 0, 0, 0), 1, False),
    (["water"], "cup", (0, 0, 0, 0), 2, False),
]

NUM_WORDS = {
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
    "twelve": 12, "half": 0.5, "couple": 2, "few": 3, "dozen": 12,
}
UNITS = {
    "oz": "oz", "ounce": "oz", "ounces": "oz",
    "cup": "cup", "cups": "cup",
    "tbsp": "tbsp", "tablespoon": "tbsp", "tablespoons": "tbsp",
    "tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp",
    "slice": "slice", "slices": "slice", "piece": "slice", "pieces": "slice",
    "scoop": "scoop", "scoops": "scoop",
    "packet": "packet", "packets": "packet", "can": "can", "cans": "can",
    "glass": "glass", "glasses": "glass", "shot": "shot", "shots": "shot",
    "g": "g", "gram": "g", "grams": "g",
}
CONVERT = {("cup", "tbsp"): 16, ("tbsp", "cup"): 1 / 16, ("tbsp", "tsp"): 3,
           ("tsp", "tbsp"): 1 / 3, ("g", "oz"): 1 / 28.35, ("oz", "g"): 28.35}

SPLIT = re.compile(r",|\band\b|\bwith\b|\bon\b|\bplus\b|\+|&|\n|;")
LEAD = re.compile(
    r"^(i\s+(just\s+)?(had|ate|have|grabbed)|for\s+\w+\s+i\s+(had|ate)|"
    r"today\s+i\s+(had|ate)|breakfast\s+was|lunch\s+was|dinner\s+was)\b", re.I)
FILLER = {"of", "the", "some", "my", "side", "little", "bit", "large", "small",
          "medium", "big", "fresh", "cooked", "grilled", "baked", "raw", "plain"}


def clean(text):
    text = LEAD.sub("", text or "", count=1)
    return re.sub(r"\s+", " ", text.replace("/", "/")).strip(" .!?")


def read_qty(frag):
    """Pull a number and unit out of a fragment. Returns (number, unit, matched?)."""
    m = re.search(r"(\d+)\s*/\s*(\d+)", frag)
    if m:
        n = float(m.group(1)) / float(m.group(2))
    else:
        m = re.search(r"(\d+(?:\.\d+)?)", frag)
        n = float(m.group(1)) if m else None
    if n is None:
        for word, val in NUM_WORDS.items():
            if re.search(r"\b" + word + r"\b", frag):
                n = val
                break
    unit = None
    for word, canon in UNITS.items():
        if re.search(r"\b" + word + r"\b", frag):
            unit = canon
            break
    return n, unit, n is not None


def to_units(n, given_unit, native_unit):
    if not given_unit or given_unit == native_unit:
        return n
    factor = CONVERT.get((given_unit, native_unit))
    return round(n * factor, 2) if factor else n


def pretty_qty(n, unit):
    n = round(n, 2)
    txt = str(int(n)) if float(n).is_integer() else str(n)
    if unit == "each":
        return txt
    plural = unit + ("s" if n != 1 and unit in ("cup", "slice", "scoop", "packet",
                                                "can", "glass", "shot") else "")
    return f"{txt} {plural}"


def history_index(data, limit=400):
    """Foods this person has logged before -- their personal library."""
    seen = {}
    for e in reversed(data.get("entries", [])[-limit:]):
        key = e["name"].strip().lower()
        if key and key not in seen:
            seen[key] = e
    return seen


def match_ingredient(frag):
    best = None
    for aliases, unit, per, default, variance in INGREDIENTS:
        for alias in aliases:
            if re.search(r"\b" + re.escape(alias) + r"(?:s|es)?\b", frag):
                if best is None or len(alias) > len(best[0]):
                    best = (alias, unit, per, default, variance)
    return best


def parse_text(data, text, meal="snacks"):
    text = clean(text)
    history = history_index(data)
    items, questions = [], []

    for raw in SPLIT.split(text):
        frag = raw.strip().lower()
        frag = " ".join(w for w in frag.split() if w not in FILLER).strip()
        if len(frag) < 2:
            continue

        n, given_unit, explicit = read_qty(frag)

        # 1. No amount stated? Something they've logged before wins -- their
        #    own numbers beat a table average. State an amount and the table
        #    takes over, so the quantity actually scales.
        hit = None
        if not explicit:
            for name, entry in history.items():
                if len(name) > 3 and (name in frag or frag in name):
                    hit = entry
                    break
        if hit:
            items.append({
                "name": hit["name"], "qty": hit.get("qty") or "",
                "calories": hit["calories"], "protein": hit["protein"],
                "carbs": hit["carbs"], "fat": hit["fat"],
                "source": "history", "note": "same as last time",
            })
            continue

        # 2. Otherwise the ingredient table.
        found = match_ingredient(frag)
        if not found:
            items.append({
                "name": raw.strip()[:60] or frag, "qty": "",
                "calories": 0, "protein": 0, "carbs": 0, "fat": 0,
                "source": "unknown", "note": "not in the database",
            })
            continue

        alias, unit, per, default, variance = found
        qty = to_units(n, given_unit, unit) if explicit else default
        # "a protein cookie" tells you the count, not the size. For foods whose
        # portion swings wildly, only a real unit counts as knowing the amount.
        sized = given_unit is not None
        cal, p, c, f = per
        items.append({
            "name": alias.title(), "qty": pretty_qty(qty, unit),
            "calories": round(cal * qty), "protein": round(p * qty, 1),
            "carbs": round(c * qty, 1), "fat": round(f * qty, 1),
            "source": "estimate" if (variance and not sized) else "database",
            "note": "portion varies a lot" if variance else "",
        })
        # Only ask about things where guessing wrong costs real calories.
        if variance and not sized and len(questions) < 2:
            questions.append(f"How much {alias}? Portions vary enough to matter.")

    return {"items": items, "questions": questions, "meal": meal,
            "totals": {
                k: round(sum(i[k] for i in items), 1)
                for k in ("calories", "protein", "carbs", "fat")
            }}
