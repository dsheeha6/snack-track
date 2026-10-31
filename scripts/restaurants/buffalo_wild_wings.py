"""Buffalo Wild Wings, from its own Nutrition Guide PDF (buffalowildwings.com,
valid 08-18 to 11-17-2026).

Two things make this guide its own parser:

- Wings are listed as "6 COUNT BONELESS WINGS, add Signature Sauce or Dry Rub"
  (the plain wings), followed by every sauce and rub *at the amount used on
  that count*. So a sauce row only means something with the count above it:
  "Honey BBQ" on 6 boneless is 100 kcal, on 20 boneless 270. Each is written
  as the dish, those wings in that sauce ("Boneless Wings with Honey BBQ",
  10 count), never as a sauce row on its own.
- Some rows carry two sizes at once, "370 / 740 18 / 37 ...", and write a
  value the two share only once ("0" for both). Which two sizes comes from the
  name ("Regular / Large") or the section ("... to your 3 / 5 count Chicken
  Dippers", "(REGULAR / LARGE)").

Columns: Cals, Fat, Sat Fat, Trans Fat, Cholest, Sodium, Carb, Fiber, Sugar,
Protein. Rows given as a range ("570-840", the Saucy Chicken Sandwich, which
depends on the sauce) are skipped; the model estimates those.

usage: python buffalo_wild_wings.py
"""

import re

from common import REPO, clean_name, num, row, write

RAW = REPO / "data" / "restaurants" / "raw"
URL = "https://www.buffalowildwings.com/nutrition"
COLS = ("calories", "fat", "sat_fat", "trans_fat", "chol", "sodium_mg", "carbs", "fiber",
        "sugar", "protein")
GROUP = re.compile(r"^(?:--|<?\d[\d,]*(?:\.\d+)?(?:/<?\d[\d,]*(?:\.\d+)?)?)$")
WINGS = re.compile(r"(?:(\d+) COUNT |(LARGE|SMALL|REGULAR) )?(BONELESS|BONE-IN|CAULIFLOWER) WINGS"
                   r"(?: \((FLATS|DRUMS) ONLY\))?")
# A section heading is a run of all-caps words, sometimes followed on the same
# line by a sentence of notes ("CHICKEN DIPPERS All dippers are listed ...").
HEADING = re.compile(r"^([A-Z][A-Z&'‘’/,()-]*(?:\s+[A-Z&'‘’/,()-][A-Z&'‘’/,()-]*)*)(?:\s+[A-Z]?[a-z(].*)?$")
SAUCE_SECTIONS = ("SIGNATURE SAUCES", "DRY RUBS", "ADD A DRY RUB")
PAIR = re.compile(r"\b(\w+)\s*/\s*(\w+)(?:\s+COUNT)?\b", re.I)
# Page furniture repeated on every page.
FURNITURE = re.compile(r"^(©|NUTRITION GUIDE|2,000 CALORIES|\* NUTRITION ABBREVIATION|BUFFALO WILD WINGS|"
                       r"Sat Fat|Trans Fat|Cholest|Sodium|Carb|Fiber|Sugar|Protein|\(g\)|\(mg\))")


def split_numbers(text):
    """'Honey BBQ 140 / 200 0 0 ...' -> ('Honey BBQ', ['140/200', '0', ...]) or None
    when the line doesn't end in exactly the ten columns."""
    text = re.sub(r"\s*/\s*", "/", text)
    toks = text.split()
    groups = []
    while toks and GROUP.match(toks[-1]) and len(groups) < len(COLS):
        groups.insert(0, toks.pop())
    if len(groups) != len(COLS):
        return None
    name = " ".join(toks)
    # Put back the spaced slash in names ("Regular/Large" -> "Regular / Large").
    return re.sub(r"/", " / ", name), groups


def tidy(name):
    name = re.sub(r"^NEW\s+", "", name)
    name = re.sub(r"^Choice of \d+ of the following \w+:\s*", "", name)
    name = re.sub(r"\s*-\s*(limited time|at select locations)\b.*$", "", name, flags=re.I)
    name = re.sub(r",?\s*add Signature Sauce or Dry Rub$", "", name, flags=re.I)
    return name.strip(" ,")


def fetch():
    from pypdf import PdfReader

    path = sorted(RAW.glob("buffalo-wild-wings_nutrition_*.pdf"))[-1]
    out, skipped = [], []
    category, wings, pair, held, party, bases = "", "", None, [], False, []
    for page in PdfReader(path).pages:
        for raw in (page.extract_text() or "").splitlines():
            line = clean_name(raw.replace("`", "")).strip()
            line = re.sub(r"(?<![\d.])\.(\d)", r"0.\1", line)  # ".5" -> "0.5"
            if not line or FURNITURE.match(line):
                continue
            parsed = split_numbers(" ".join(held + [line]))
            if not parsed:
                if re.search(r"\d+-\d+\s*$", line):  # a range row: skipped, see docstring
                    skipped.append(line)
                    held = []
                    continue
                h = HEADING.match(line)
                if h and len(h.group(1)) >= 4 and not WINGS.match(line):
                    category = re.sub(r"\s*\(.*\)$|\s+A$", "", h.group(1).strip(" ,")).title()
                    # The party menu runs from its heading to the drinks; its
                    # rows are pans and whole cakes, never a single serving.
                    if category == "Party Menu":
                        party = True
                    elif category in ("Beverages", "Handcrafted & Zero Proof"):
                        party = False
                    held = []
                    if h.group(1).strip(" ,") not in SAUCE_SECTIONS:
                        wings, bases = "", []
                    m = PAIR.search(line)
                    if m:
                        pair = (m.group(1).lower(), m.group(2).lower())
                        if "count" in line.lower():
                            pair = tuple(f"{p} count" for p in pair)
                    elif h.group(1).strip(" ,") not in SAUCE_SECTIONS:
                        pair = None  # "ADD A DRY RUB" carries on the dipper sizes above it
                    if "MAKE ‘EM SAUCY" in raw or "MAKE 'EM SAUCY" in line:
                        wings = "chicken dippers"
                    continue
                # Hold a possible first half of a wrapped name; notes and
                # sentences are never part of one.
                if len(line) < 70 and not line.endswith("."):
                    held = (held + [line])[-2:]
                else:
                    held = []
                continue
            held = []
            name, groups = parsed
            w = list(WINGS.finditer(name))
            if w and "fl oz" not in name:
                count, big, kind, part = w[-1].groups()
                kind = kind.capitalize() if kind != "BONE-IN" else "Bone-In"
                label = f"{kind} Wings" + (f" ({part.lower()} only)" if part else "")
                size = f"{count} count" if count else (big or "").lower()
                # Flats-only and drums-only take the same sauce as the plain count.
                new = f"{size} {kind.lower()} wings".strip()
                if new != wings:
                    bases = []
                wings, pair = new, None
                bases.append((label, size, groups))
                out.append(mk("Wings", label, size, groups, 0))
                continue
            name = tidy(name)
            sizes = None
            m = re.match(r"^(\d+) count (.+)$", name, re.I)
            if m:  # "5 count Spicy Chicken Dippers"
                sizes, name = (f"{m.group(1)} count",), m.group(2)
            m = re.search(r",?\s*(Regular|Small|Individual)\s*/\s*(Large|Shareable|Party)\s*$", name, re.I)
            if m:
                sizes, name = (m.group(1).lower(), m.group(2).lower()), name[:m.start()].strip(" ,")
            elif any("/" in g for g in groups) and not sizes:
                # "Breakfast Wrap, with Bacon or Sausage" -> the pair is the choice.
                m = re.search(r",?\s*with ([^,]+?) or ([^,]+?)(?=,|$)", name)
                if m:
                    sizes = (f"with {m.group(1).lower()}", f"with {m.group(2).lower()}")
                    name = (name[:m.start()] + name[m.end():]).strip(" ,")
                else:
                    sizes = pair or ("smaller", "larger")
            if bases and category.upper() in SAUCE_SECTIONS and "fl oz" not in name:
                # A sauce under a wing count is that count's sauce. Written on
                # its own it reads as the whole order (the parser logged "10
                # boneless honey bbq" as the 140 kcal of sauce), so each one
                # becomes the dish people order: those wings, in that sauce.
                for label, size, base in bases:
                    out.append(mk("Wings", f"{label} with {name}", size, add(base, groups), 0))
                continue
            for i, size in enumerate(sizes or ("",)):
                if wings == "chicken dippers":
                    size = f"on {size} chicken dippers".replace("  ", " ")
                    if not re.search(r"sauce|rub", name, re.I):
                        name += " sauce"  # logged on top of the dippers, not instead of them
                elif category == "Ultimate Sampler":
                    size = "sampler portion"
                elif party and not WINGS.search(name.upper()):
                    size = ", ".join(filter(None, [size, "party size"]))
                out.append(mk(category, name, size, groups, i))
    if skipped:
        print(f"  skipped {len(skipped)} range rows, e.g. {skipped[0][:70]}")
    return write("buffalo-wild-wings", out)


def add(a, b):
    """Column-wise sum of two single-size rows (wings + their sauce)."""
    return [None if "--" in (x, y) else f"{num(x) + num(y):g}" for x, y in zip(a, b)]


def mk(category, name, size, groups, i):
    vals = [None if g == "--" else g.split("/")[i] if "/" in g else g for g in groups]
    v = dict(zip(COLS, vals))
    return row("Buffalo Wild Wings", category, name, URL, size=size,
               **{k: v.get(k) for k in ("calories", "protein", "carbs", "fat", "sugar", "fiber",
                                        "sodium_mg")})


if __name__ == "__main__":
    fetch()
