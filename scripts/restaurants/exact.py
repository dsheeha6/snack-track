"""Exact-name disagreements only (compare.py's fuzzy matches can pair the
wrong sizes). usage: python exact.py slug [n]"""
import json, subprocess, sys
from compare import key, OUT, REPO

slug = sys.argv[1]
n = int(sys.argv[2]) if len(sys.argv) > 2 else 12
old = [json.loads(l) for l in subprocess.run(["git", "show", f"HEAD:data/restaurants/{slug}.jsonl"], cwd=REPO,
       capture_output=True, text=True, encoding="utf-8").stdout.splitlines() if l.strip()]
new = {key(r): r for r in (json.loads(l) for l in open(OUT / f"{slug}.jsonl", encoding="utf-8"))}
exact = [(o, new[key(o)]) for o in old if key(o) in new]
bad = [(o, x) for o, x in exact if abs(o["calories"] - x["calories"]) > 10]
print(f"{slug}: exact-name matches {len(exact)}, disagree {len(bad)}")
for o, x in bad[:n]:
    print(f"   {o['item']} [{o.get('size')}] nix {o['calories']} -> official {x['calories']}")
