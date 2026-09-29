"""Check an official fetch against the Nutritionix rows it replaces.

The old rows come from git (the last committed data/restaurants/<slug>.jsonl),
the new ones from the working file. Items are matched on a normalised
name + size. Reports how many matched, how many agree on calories within 10
kcal, the biggest disagreements, and what the official source doesn't carry
(coverage the swap would lose).

usage: python compare.py slug [git-ref]      (ref defaults to HEAD)
"""

import difflib
import json
import re
import subprocess
import sys

from common import OUT, REPO, clean_name


def norm(s):
    s = clean_name(s).lower().replace("&", "and").replace("®", "").replace("™", "")
    s = re.sub(r"\b(the|a|an|with|w/)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


GENERIC_SIZE = re.compile(r"^\d*(\.\d+)?\s*(serving|order|item|each|piece)s?$", re.I)


def key(r):
    size = (r.get("size") or "").strip()
    if GENERIC_SIZE.match(size):
        size = ""
    return norm(f"{r['item']} {size}")


def main():
    slug = sys.argv[1]
    ref = sys.argv[2] if len(sys.argv) > 2 else "HEAD"
    old_txt = subprocess.run(["git", "show", f"{ref}:data/restaurants/{slug}.jsonl"], cwd=REPO,
                             capture_output=True, text=True, encoding="utf-8").stdout
    old = [json.loads(line) for line in old_txt.splitlines() if line.strip()]
    new = [json.loads(line) for line in open(OUT / f"{slug}.jsonl", encoding="utf-8")]
    new_by = {key(r): r for r in new}
    new_keys = list(new_by)
    pairs, missing = [], []
    for o in old:
        k = key(o)
        hit = new_by.get(k)
        if not hit:
            close = difflib.get_close_matches(k, new_keys, n=1, cutoff=0.85)
            hit = new_by[close[0]] if close else None
        (pairs.append((o, hit)) if hit else missing.append(o))
    agree = [p for p in pairs if abs(p[0]["calories"] - p[1]["calories"]) <= 10]
    print(f"{slug}: old {len(old)}, new {len(new)}, matched {len(pairs)}, "
          f"calories within 10: {len(agree)}/{len(pairs)}")
    worst = sorted(pairs, key=lambda p: -abs(p[0]["calories"] - p[1]["calories"]))[:10]
    for o, n in worst:
        if abs(o["calories"] - n["calories"]) > 10:
            print(f"  DIFF {o['item']} [{o.get('size')}] nix {o['calories']} vs official {n['calories']}"
                  f"  ({n['item']} [{n.get('size')}])")
    print(f"  in Nutritionix only ({len(missing)}):")
    for o in missing[:40]:
        print(f"    {o['category'][:22]:22} | {o['item']} [{o.get('size')}] {o['calories']}")


if __name__ == "__main__":
    main()
