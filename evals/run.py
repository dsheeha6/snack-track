"""Accuracy harness for SNACK TRACK's natural-language food logging.

Scores a parsing pipeline against evals/meals.jsonl (50 real meal sentences
with hand-checked calorie/protein/carb/fat ground truth) and prints a report.

Usage:
    python run.py                  # score the local prototype parser (baseline)
    python run.py --json out.json  # also write the full per-meal results

The baseline pipeline is ../../calorie-tracker/parse.py, run with no logging
history (an empty entries list), so its "history" shortcut never fires and
every meal is scored on the ingredient-table/quantity-parsing logic alone.
This is deliberate: history match would make the baseline look better than
it actually is at reading a sentence, and a future Claude pipeline has no
equivalent memory of "same as last time" to lean on either.

Adding a second pipeline (the real Claude call) later: give it the same
per-meal `text` input, produce the same `{calories, protein, carbs, fat}`
totals shape, and add it as another `--pipeline` choice below. The "done
when" in ROADMAP.md is this harness reporting Claude beating this baseline.
"""

import argparse
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
PROTOTYPE_DIR = REPO_ROOT.parent / "calorie-tracker"

MACROS = ("calories", "protein", "carbs", "fat")


def load_meals(path):
    meals = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                meals.append(json.loads(line))
    return meals


def run_baseline(meals):
    sys.path.insert(0, str(PROTOTYPE_DIR))
    import parse as prototype_parse  # ../../calorie-tracker/parse.py

    results = []
    for meal in meals:
        empty_history = {"entries": []}
        parsed = prototype_parse.parse_text(empty_history, meal["text"], meal.get("meal", "snacks"))
        predicted = {k: parsed["totals"].get(k, 0.0) for k in MACROS}
        unresolved = [i["name"] for i in parsed["items"] if i.get("source") == "unknown"]
        results.append({
            "id": meal["id"],
            "text": meal["text"],
            "tags": meal.get("tags", []),
            "expected": meal["expected"],
            "predicted": predicted,
            "unresolved_items": unresolved,
        })
    return results


PIPELINES = {
    "baseline": run_baseline,
}


def pct_error(expected, predicted):
    if expected == 0:
        return 0.0 if abs(predicted) < 1e-9 else 100.0
    return abs(predicted - expected) / abs(expected) * 100.0


def score(results, tolerance_pct=15.0):
    for r in results:
        r["error"] = {k: pct_error(r["expected"][k], r["predicted"][k]) for k in MACROS}
        r["within_tolerance"] = r["error"]["calories"] <= tolerance_pct

    summary = {"n_meals": len(results), "tolerance_pct": tolerance_pct}
    for k in MACROS:
        errs = [r["error"][k] for r in results]
        summary[f"{k}_mape"] = round(statistics.fmean(errs), 1)
        summary[f"{k}_median_ape"] = round(statistics.median(errs), 1)

    within = [r for r in results if r["within_tolerance"]]
    summary["within_tolerance_count"] = len(within)
    summary["within_tolerance_pct"] = round(100.0 * len(within) / len(results), 1)

    by_tag = {}
    for r in results:
        for tag in r["tags"]:
            by_tag.setdefault(tag, []).append(r["error"]["calories"])
    summary["calorie_mape_by_tag"] = {
        tag: round(statistics.fmean(errs), 1) for tag, errs in sorted(by_tag.items())
    }

    unresolved_meals = [r for r in results if r["unresolved_items"]]
    summary["meals_with_unresolved_items"] = len(unresolved_meals)

    return summary


def print_report(summary, results, show_worst=10):
    print(f"\n{'='*60}")
    print(f"SNACK TRACK parsing accuracy - {summary['n_meals']} meals")
    print(f"{'='*60}\n")

    print(f"{'macro':<10} {'mean % err':>12} {'median % err':>14}")
    for k in MACROS:
        print(f"{k:<10} {summary[f'{k}_mape']:>11}% {summary[f'{k}_median_ape']:>13}%")

    print(f"\nWithin {summary['tolerance_pct']}% on calories: "
          f"{summary['within_tolerance_count']}/{summary['n_meals']} "
          f"({summary['within_tolerance_pct']}%)")

    print(f"Meals with at least one unresolved item: {summary['meals_with_unresolved_items']}")

    print("\nCalorie mean % error by tag:")
    for tag, mape in summary["calorie_mape_by_tag"].items():
        print(f"  {tag:<20} {mape:>6}%")

    worst = sorted(results, key=lambda r: r["error"]["calories"], reverse=True)[:show_worst]
    print(f"\nWorst {len(worst)} meals by calorie error:")
    for r in worst:
        exp, pred = r["expected"]["calories"], r["predicted"]["calories"]
        flag = " [unresolved: " + ", ".join(r["unresolved_items"]) + "]" if r["unresolved_items"] else ""
        print(f"  {r['error']['calories']:>6.1f}%  {r['id']}  \"{r['text'][:50]}\"  "
              f"(expected {exp}, got {pred}){flag}")
    print()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pipeline", choices=list(PIPELINES.keys()), default="baseline")
    ap.add_argument("--meals", default=str(HERE / "meals.jsonl"))
    ap.add_argument("--tolerance", type=float, default=15.0,
                     help="calorie %% error considered 'close enough' (default 15)")
    ap.add_argument("--json", default=None, help="write full per-meal results to this path")
    args = ap.parse_args()

    meals = load_meals(args.meals)
    results = PIPELINES[args.pipeline](meals)
    summary = score(results, tolerance_pct=args.tolerance)
    print_report(summary, results)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump({"pipeline": args.pipeline, "summary": summary, "results": results}, f, indent=2)
        print(f"Full results written to {args.json}")


if __name__ == "__main__":
    main()
