"""Sugar and fiber error for a run.py --json file, in grams.

run.py scores the four macros; sugar and fiber live on the items (parse-meal
v25+). Grams rather than percent because the truths sit near zero (a Quest bar
has 1 g sugar): 2 g against 1 g is +100% and doesn't matter; 10 g does.

    python score_extras.py branded_v25.json meals_branded.jsonl
"""
import json
import statistics
import sys

res = json.load(open(sys.argv[1], encoding="utf-8"))
truth = {}
for line in open(sys.argv[2], encoding="utf-8"):
    if line.strip():
        m = json.loads(line)
        truth[m["id"]] = m["expected"]
runs = res.get("runs") or [{"results": res["results"]}]
for k in ("sugar", "fiber"):
    errs, rows = [], {}
    for run in runs:
        for r in run["results"]:
            if k not in truth[r["id"]]:
                continue
            got = sum(float(i.get(k) or 0) for i in r["items"])
            errs.append(abs(got - truth[r["id"]][k]))
            rows.setdefault(r["id"], []).append(round(got, 1))
    if not errs:
        print(f"{k}: no truth in this set")
        continue
    print(f"{k}: mean abs error {statistics.mean(errs):.1f} g over {len(errs)} parses")
    for mid, got in sorted(rows.items()):
        t = truth[mid][k]
        flag = "  <-- off by 5 g+" if abs(statistics.mean(got) - t) >= 5 else ""
        print(f"   {mid} truth {t:5.1f}  got {got}{flag}")
