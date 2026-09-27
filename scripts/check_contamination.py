"""Fail if parse-meal's prompt text quotes the eval sets.

A prompt that names an eval dish ("pommes aligot", "a big bowl of pasta") scores
well on that meal for the wrong reason, and the eval stops measuring anything.
It nearly happened twice (v14's first draft, v23's first draft; BUILD_LOG).

Checks every 3-word run of every eval sentence, and every hard-set item name,
against the prompt strings in index.ts (SYSTEM, MENU_RULES, FOOD_RULES and the
tool descriptions). Only runs containing at least one food-ish word count, so
"i had a" doesn't trip it.

    python scripts/check_contamination.py      # exit 1 on any hit
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "supabase" / "functions" / "parse-meal" / "index.ts"
SETS = ["meals.jsonl", "meals_hard.jsonl", "meals_branded.jsonl", "meals_items.jsonl"]

# Words too generic to make a 3-gram distinctive on their own.
GENERIC = set("""
a an the and or of with on in at to for from my i had ate was is it its some
then after before like about just really big little small large one two three
half cup cups bowl plate slice slices piece pieces side glass bottle bar serving
servings oz g ml lunch dinner breakfast snack game gym work home today night
""".split())

# Phrases the prompt uses on purpose, as teaching examples, that happen to
# also be in an eval sentence. Add here only after deciding it's not a leak.
#
# Allowed 2026-09-25: these teach reading ("peanutbutter" is peanut butter,
# "half a dozen" is 6, "protien bar" is a protein bar, a stir fry is a mixed
# dish), not what any eval meal weighs or costs.
ALLOW = {"peanut butter", "half a dozen", "protein bar", "a stir fry"}


def words(s):
    return re.findall(r"[a-z0-9']+", s.lower())


def prompt_text():
    src = INDEX.read_text(encoding="utf-8")
    # The prompt constants only (SYSTEM, MENU_RULES, FOOD_RULES) -- not every
    # backtick in the file, which would sweep in code comments.
    parts = re.findall(r"const [A-Z_]+ = `(.*?)`;", src, re.S)
    parts += re.findall(r'description:\s*\n?\s*"([^"]*)"', src)
    return " ".join(" ".join(words(p)) for p in parts if len(p) > 40)


def main():
    prompt = f" {prompt_text()} "
    hits = []
    for name in SETS:
        path = ROOT / "evals" / name
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            m = json.loads(line)
            w = words(m["text"])
            grams = {" ".join(w[i:i + 3]) for i in range(len(w) - 2)}
            for it in m.get("expected_items", []):
                iw = words(re.sub(r"\(.*?\)", "", it["name"]))
                if len(iw) >= 2:
                    grams.add(" ".join(iw))
            for g in sorted(grams):
                if g in ALLOW or all(x in GENERIC for x in g.split()):
                    continue
                if f" {g} " in prompt:
                    hits.append((name, m["id"], g))
    for name, mid, g in hits:
        print(f"{name} {mid}: prompt contains \"{g}\"")
    if hits:
        print(f"\n{len(hits)} eval phrase(s) in the prompt. Reword the prompt, or add to ALLOW with a reason.")
        return 1
    print("clean: no eval phrase appears in the parse-meal prompt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
