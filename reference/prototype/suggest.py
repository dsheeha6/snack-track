"""Meal suggestions for SNACK TRACK.

Given what's left in the day, score a food library against the *shape* of the
gap -- not just the calorie number -- and hand back sets of three cards.

This is the free-tier version of the recommender: a scored local database, no
API key required. The scoring inputs (remaining macros, time of day, recent
foods, effort) are the same ones a Claude-backed version would take, so the
model can slot in behind `suggest()` later without the UI changing.
"""

# name, qty, cal, protein, carbs, fat, slots, effort, family
LIBRARY = [
    # --- breakfast -------------------------------------------------
    ("Greek yogurt bowl with berries + honey", "1.5 cups nonfat", 300, 30, 40, 1, ["breakfast", "snacks"], "no cook", "dairy"),
    ("Egg white scramble with 2 whole eggs + spinach", "big pan", 260, 30, 3, 14, ["breakfast", "lunch"], "10 min", "eggs"),
    ("Oatmeal with protein powder + banana", "1 cup dry", 430, 32, 62, 7, ["breakfast"], "5 min", "grains"),
    ("Cottage cheese with pineapple", "1 cup", 220, 26, 20, 3, ["breakfast", "snacks"], "no cook", "dairy"),
    ("Protein shake with banana", "1 scoop + fruit", 280, 30, 32, 3, ["breakfast", "snacks"], "no cook", "shake"),
    ("Avocado toast with 2 eggs", "2 slices", 480, 22, 34, 28, ["breakfast", "lunch"], "10 min", "eggs"),
    ("Overnight oats with peanut butter", "1 jar", 520, 20, 60, 22, ["breakfast"], "no cook", "grains"),
    ("Turkey bacon + egg wrap", "1 wrap", 380, 28, 30, 16, ["breakfast", "lunch"], "10 min", "eggs"),

    # --- lunch -----------------------------------------------------
    ("Chicken burrito bowl, no cheese", "rice, beans, salsa", 620, 48, 72, 14, ["lunch", "dinner"], "order", "mexican"),
    ("Turkey + provolone sandwich", "on sourdough", 520, 34, 52, 18, ["lunch"], "5 min", "sandwich"),
    ("Tuna and rice bowl", "2 packets + 1 cup rice", 480, 42, 55, 8, ["lunch", "dinner"], "10 min", "fish"),
    ("Big chicken salad, vinaigrette", "8 oz chicken", 430, 40, 18, 22, ["lunch", "dinner"], "10 min", "salad"),
    ("Leftover chicken + sweet potato", "reheat", 520, 45, 55, 10, ["lunch", "dinner"], "reheat", "meat+starch"),
    ("Poke bowl", "regular size", 560, 38, 68, 14, ["lunch", "dinner"], "order", "fish"),
    ("Chicken shawarma plate", "with rice + salad", 700, 50, 60, 26, ["lunch", "dinner"], "order", "mediterranean"),
    ("Egg salad on sourdough", "2 slices", 470, 24, 44, 22, ["lunch"], "10 min", "eggs"),
    ("Chicken caesar wrap", "1 large", 550, 38, 45, 24, ["lunch"], "order", "sandwich"),

    # --- dinner ----------------------------------------------------
    ("Salmon, rice + broccoli", "6 oz fillet", 620, 45, 55, 22, ["dinner"], "25 min", "fish"),
    ("Chicken breast, jasmine rice + green beans", "8 oz chicken", 560, 55, 60, 8, ["dinner"], "25 min", "meat+starch"),
    ("Lean ground turkey chili", "2 cups", 480, 42, 40, 16, ["dinner"], "30 min", "stew"),
    ("Steak, baked potato + side salad", "8 oz sirloin", 700, 50, 50, 30, ["dinner"], "25 min", "meat+starch"),
    ("Shrimp stir fry with rice", "8 oz shrimp", 540, 40, 62, 12, ["dinner"], "20 min", "asian"),
    ("Chicken thighs + roasted vegetables", "3 thighs", 620, 45, 25, 38, ["dinner"], "35 min", "meat+starch"),
    ("Turkey meatballs, marinara + pasta", "6 meatballs", 650, 45, 70, 18, ["dinner"], "25 min", "pasta"),
    ("Cod, couscous + asparagus", "7 oz cod", 480, 42, 45, 12, ["dinner"], "25 min", "fish"),
    ("Burger bowl, no bun", "8 oz lean beef", 520, 45, 20, 28, ["dinner"], "20 min", "meat+starch"),
    ("Tofu and vegetable rice bowl", "1 block tofu", 480, 24, 62, 15, ["dinner", "lunch"], "25 min", "asian"),
    ("Chicken quesadilla", "1 large", 680, 42, 52, 32, ["dinner"], "20 min", "mexican"),
    ("Sheet pan chicken sausage + peppers + potatoes", "2 sausages", 590, 34, 52, 26, ["dinner"], "35 min", "meat+starch"),

    # --- snacks and small plates -----------------------------------
    ("Nonfat Greek yogurt", "1 cup", 130, 22, 9, 0, ["snacks", "breakfast"], "no cook", "dairy"),
    ("Cottage cheese", "1 cup", 160, 25, 8, 3, ["snacks"], "no cook", "dairy"),
    ("Whey shake with water", "1 scoop", 130, 25, 4, 2, ["snacks"], "no cook", "shake"),
    ("Beef jerky", "2 oz", 160, 26, 10, 2, ["snacks"], "no cook", "jerky"),
    ("Turkey roll-ups", "6 slices", 150, 24, 2, 5, ["snacks"], "no cook", "deli"),
    ("Protein bar", "1 bar", 210, 20, 22, 7, ["snacks"], "no cook", "bar"),
    ("Apple with peanut butter", "1 tbsp PB", 190, 4, 28, 8, ["snacks"], "no cook", "fruit"),
    ("Banana", "1 medium", 105, 1, 27, 0, ["snacks"], "no cook", "fruit"),
    ("Rice cakes with deli turkey", "3 cakes", 200, 20, 24, 3, ["snacks"], "no cook", "deli"),
    ("Edamame", "1 cup shelled", 190, 17, 14, 8, ["snacks"], "5 min", "veg"),
    ("Skyr with honey", "1 cup", 200, 24, 24, 0, ["snacks", "breakfast"], "no cook", "dairy"),
    ("Almonds", "1 oz", 170, 6, 6, 15, ["snacks"], "no cook", "nuts"),
    ("String cheese", "2 sticks", 160, 14, 2, 12, ["snacks"], "no cook", "dairy"),
    ("Chocolate milk", "2 cups", 300, 16, 50, 5, ["snacks"], "no cook", "drink"),
    ("Popcorn", "4 cups air-popped", 120, 4, 24, 2, ["snacks"], "5 min", "grains"),
    ("Hard boiled eggs", "3 eggs", 210, 18, 2, 15, ["snacks"], "no cook", "eggs"),
    ("Protein ice cream", "1 pint", 320, 32, 44, 6, ["snacks"], "no cook", "dessert"),
    ("Tuna packet + crackers", "1 packet", 250, 28, 20, 6, ["snacks", "lunch"], "no cook", "fish"),
]

NO_COOK = {"no cook", "reheat", "order", "5 min"}

# Protein is the axis people actually miss, so it carries the most weight.
WEIGHTS = {"protein": 1.7, "calories": 1.0, "fat": 0.9, "carbs": 0.5}
OVER_PENALTY = 2.2


def as_dict(row):
    name, qty, cal, p, c, f, slots, effort, family = row
    return {
        "name": name, "qty": qty, "calories": cal, "protein": p,
        "carbs": c, "fat": f, "slots": slots, "effort": effort, "family": family,
    }


def axis_gain(remaining, value, goal):
    """How much closer to zero this food gets one axis. Overshoot hurts."""
    after = remaining - value
    gain = value if after >= 0 else (remaining - OVER_PENALTY * (-after))
    return gain / max(goal, 1)


def why(item, rem):
    """One honest line about how this fills the specific gap."""
    bits = []
    if rem["protein"] >= 15 and item["protein"] >= 18:
        bits.append(f"{item['protein']}g protein")
    left = rem["calories"] - item["calories"]
    if left >= 0:
        bits.append(f"leaves {int(left)} cal")
    else:
        bits.append(f"puts you {int(-left)} over")
    if rem["fat"] < 15 and item["fat"] <= 8:
        bits.append("barely touches your fat")
    elif item["fat"] > max(rem["fat"], 0):
        bits.append(f"{item['fat']}g fat is over budget")
    if rem["carbs"] >= 60 and item["carbs"] >= 45:
        bits.append(f"{item['carbs']}g carbs")
    return " · ".join(bits[:3])


def take_sets(ranked, n_sets=4, size=3):
    """Build sets of `size`, avoiding two of the same family in one set."""
    pool = list(ranked)
    sets = []
    for _ in range(n_sets):
        chosen, fams, skipped = [], set(), []
        for item in pool:
            if len(chosen) == size:
                break
            if item["family"] in fams:
                skipped.append(item)
                continue
            chosen.append(item)
            fams.add(item["family"])
        for item in skipped:
            if len(chosen) == size:
                break
            chosen.append(item)
        if not chosen:
            break
        for item in chosen:
            pool.remove(item)
        sets.append(chosen)
    return sets


def suggest(data, date, meal=None, batch=0, no_cook=False, recent_names=()):
    goals = data["goals"]
    day = [e for e in data["entries"] if e["date"] == date]
    eaten = {k: sum(float(e.get(k) or 0) for e in day)
             for k in ("calories", "protein", "carbs", "fat")}
    rem = {k: round(goals.get(k, 0) - eaten[k], 1) for k in eaten}

    result = {"remaining": rem, "eaten": eaten, "cards": [], "sets": 0, "batch": 0}

    if rem["calories"] <= 0:
        result["message"] = (
            f"You're {int(-rem['calories'])} calories past your target. "
            "Nothing to recommend — the day's done."
        )
        return result
    if rem["calories"] < 200:
        result["message"] = (
            f"Only {int(rem['calories'])} calories left. The day's basically done — "
            "have something small if you're hungry, not a meal."
        )
        return result

    recent = {n.lower() for n in recent_names}
    candidates = []
    for row in LIBRARY:
        item = as_dict(row)
        if meal and meal not in item["slots"]:
            continue
        if no_cook and item["effort"] not in NO_COOK:
            continue
        if item["calories"] > rem["calories"] * 1.3:
            continue  # too big to make sense
        score = sum(
            WEIGHTS[k] * axis_gain(rem[k], item[k], goals.get(k, 1))
            for k in ("calories", "protein", "carbs", "fat")
        )
        if item["name"].lower() in recent:
            score -= 0.45  # you just had this
        item["score"] = round(score, 4)
        item["fit"] = why(item, rem)
        candidates.append(item)

    candidates.sort(key=lambda i: -i["score"])
    sets = take_sets(candidates[:16])
    if not sets:
        result["message"] = "Nothing in the library fits that gap. Try widening the meal filter."
        return result

    idx = batch % len(sets)
    result["cards"] = sets[idx]
    result["sets"] = len(sets)
    result["batch"] = idx
    return result
