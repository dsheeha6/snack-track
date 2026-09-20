"""Accuracy harness for SNACK TRACK's natural-language food logging.

Scores a parsing pipeline against a meal set and prints a report. There are two
sets and they answer different questions:

    meals.jsonl       50 everyday sentences, POINT ground truth. The regression
                      set - frozen, and the file the BUILD_LOG numbers (19.8%
                      baseline, 14.2% Haiku) are measured on. Don't add to it.
    meals_hard.jsonl  20 vague/casual/restaurant meals, RANGE ground truth.
                      The instrument for the accuracy bet in PRODUCT.md.
                      Generated from hard_source.json; see HARD_MEALS.md.

Usage:
    python run.py                             # prototype parser on the easy 50
    python run.py --meals meals_hard.jsonl    # ...on the hard 20
    python run.py --json out.json             # also write full per-meal results

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
import os
import statistics
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
PROTOTYPE_DIR = REPO_ROOT.parent / "calorie-tracker"

MACROS = ("calories", "protein", "carbs", "fat")

DEFAULT_MODEL = "claude-haiku-4-5"


def load_env_local():
    """Read ../.env.local into os.environ.

    Tolerates UTF-16 and a UTF-8 BOM on purpose: Danny pastes keys into this
    file with Notepad/PowerShell, which save UTF-16 by default, and a plain
    utf-8 read dies on the BOM with `UnicodeDecodeError: 0xff in position 0` —
    a crash that reads like a missing key and has now cost two sessions.
    """
    path = REPO_ROOT / ".env.local"
    if not path.exists():
        return
    raw = path.read_bytes()
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        text = raw.decode("utf-16")
    else:
        text = raw.decode("utf-8-sig")
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        if value:
            os.environ.setdefault(key.strip(), value)


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
            "expected_range": meal.get("expected_range"),
            "predicted": predicted,
            "unresolved_items": unresolved,
        })
    return results


def run_claude(meals, model=DEFAULT_MODEL, resolve="none", workers=8):
    """Score the real deployed parse-meal edge function.

    Deliberately calls the deployed function over HTTPS rather than
    reimplementing the prompt here: a Python copy of the pipeline would drift
    from what ships, and a score for code nobody runs is worse than no score.
    The Anthropic key stays server-side — this sends only a Supabase JWT.
    """
    load_env_local()
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    token = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not token:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in ../.env.local")
    endpoint = f"{url}/functions/v1/parse-meal"

    def one(meal):
        payload = json.dumps({
            "text": meal["text"],
            "meal": meal.get("meal", "snacks"),
            "resolve": resolve,
            "model": model,
        }).encode()
        req = urllib.request.Request(
            endpoint,
            data=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                parsed = json.load(r)
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:300]
            sys.exit(f"{meal['id']}: edge function returned {e.code} — {detail}")
        except Exception as e:  # noqa: BLE001 - surface the cause, don't score a hole
            sys.exit(f"{meal['id']}: {type(e).__name__}: {e}")

        predicted = {k: float(parsed["totals"].get(k, 0.0)) for k in MACROS}
        # "unresolved" has to mean the same thing it means for the baseline, or
        # the two columns aren't comparable: an item the pipeline could not put a
        # real number on. For Claude that's a low-confidence guess, not a missing
        # database row — it always returns *something*.
        unresolved = [i["name"] for i in parsed["items"] if i.get("confidence") == "low"]
        return {
            "id": meal["id"],
            "text": meal["text"],
            "tags": meal.get("tags", []),
            "expected": meal["expected"],
            "expected_range": meal.get("expected_range"),
            "predicted": predicted,
            "unresolved_items": unresolved,
            "items": parsed["items"],
            "usage": parsed.get("usage", {}),
        }

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(one, meals))


PIPELINES = {
    "baseline": run_baseline,
    "claude": run_claude,
}


def pct_error(expected, predicted, band=None):
    """Percent error against a point, or against a band if the meal has one.

    `meals.jsonl` has point ground truth and scores exactly as it always did.
    `meals_hard.jsonl` has a [lo, hi] band per macro, because for a dish nobody
    publishes nutrition for a point would be a fabricated precision. Inside the
    band is zero error - there is no basis for preferring 4,700 to 4,900 when
    the truth is "somewhere in 4,560-5,365". Outside it, the error is measured
    from the nearest edge, so the penalty is continuous and a near miss stays a
    near miss.

    Measuring from the edge (not the midpoint) is the whole point: it makes the
    band an admission of what we do not know, rather than a free pass that
    shrinks every error by the same factor.
    """
    if band is not None:
        lo, hi = band
        if lo <= predicted <= hi:
            return 0.0
        edge = lo if predicted < lo else hi
        if edge == 0:
            return 0.0 if abs(predicted) < 1e-9 else 100.0
        return abs(predicted - edge) / abs(edge) * 100.0
    if expected == 0:
        return 0.0 if abs(predicted) < 1e-9 else 100.0
    return abs(predicted - expected) / abs(expected) * 100.0


def score(results, tolerance_pct=15.0):
    for r in results:
        ranges = r.get("expected_range") or {}
        r["error"] = {
            k: pct_error(r["expected"][k], r["predicted"][k], ranges.get(k))
            for k in MACROS
        }
        r["within_tolerance"] = r["error"]["calories"] <= tolerance_pct
        r["inside_band"] = bool(ranges) and r["error"]["calories"] == 0.0

    summary = {"n_meals": len(results), "tolerance_pct": tolerance_pct}
    for k in MACROS:
        errs = [r["error"][k] for r in results]
        summary[f"{k}_mape"] = round(statistics.fmean(errs), 1)
        summary[f"{k}_median_ape"] = round(statistics.median(errs), 1)

    within = [r for r in results if r["within_tolerance"]]
    summary["within_tolerance_count"] = len(within)
    summary["within_tolerance_pct"] = round(100.0 * len(within) / len(results), 1)

    banded = [r for r in results if r.get("expected_range")]
    if banded:
        # The stricter headline for a banded set: not "close enough" but
        # "landed inside the range a careful human would defend".
        inside = [r for r in banded if r["inside_band"]]
        summary["banded_meals"] = len(banded)
        summary["inside_band_count"] = len(inside)
        summary["inside_band_pct"] = round(100.0 * len(inside) / len(banded), 1)

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

    if "inside_band_count" in summary:
        print(f"Landed inside the calorie band: "
              f"{summary['inside_band_count']}/{summary['banded_meals']} "
              f"({summary['inside_band_pct']}%)")

    print(f"Meals with at least one unresolved item: {summary['meals_with_unresolved_items']}")

    print("\nCalorie mean % error by tag:")
    for tag, mape in summary["calorie_mape_by_tag"].items():
        print(f"  {tag:<20} {mape:>6}%")

    worst = sorted(results, key=lambda r: r["error"]["calories"], reverse=True)[:show_worst]
    print(f"\nWorst {len(worst)} meals by calorie error:")
    for r in worst:
        exp, pred = r["expected"]["calories"], r["predicted"]["calories"]
        band = (r.get("expected_range") or {}).get("calories")
        target = f"expected {band[0]:g}-{band[1]:g}" if band else f"expected {exp}"
        flag = " [unresolved: " + ", ".join(r["unresolved_items"]) + "]" if r["unresolved_items"] else ""
        print(f"  {r['error']['calories']:>6.1f}%  {r['id']}  \"{r['text'][:50]}\"  "
              f"({target}, got {pred}){flag}")
    print()


def print_repeat_report(summaries, meals_n):
    """Report N runs of the same pipeline, so the noise floor is visible.

    This exists because of 2026-09-20: the v13 prompt scored 14.2% mean calorie
    error on the easy 50 on 2026-09-13 and 16.8% on 2026-09-20 with nothing
    changed but the day. A single run cannot resolve a two-point difference,
    and two prompt versions were compared on exactly that basis before anyone
    noticed. Any A/B smaller than the spread below is not a result.
    """
    print(f"\n{'='*60}")
    print(f"REPEATED RUNS - {len(summaries)} runs x {meals_n} meals")
    print(f"{'='*60}\n")
    print(f"{'run':<6}{'kcal mean':>11}{'median':>9}{'within tol':>12}{'in band':>10}")
    for i, s in enumerate(summaries, 1):
        band = f"{s['inside_band_count']}/{s['banded_meals']}" if "inside_band_count" in s else "-"
        print(f"{i:<6}{s['calories_mape']:>10}%{s['calories_median_ape']:>8}%"
              f"{s['within_tolerance_count']:>8}/{meals_n:<3}{band:>10}")

    means = [s["calories_mape"] for s in summaries]
    within = [s["within_tolerance_count"] for s in summaries]
    spread = max(means) - min(means)
    print(f"\nmean calorie error: {statistics.fmean(means):.1f}% "
          f"(range {min(means):.1f}-{max(means):.1f}, spread {spread:.1f} points"
          + (f", sd {statistics.stdev(means):.1f}" if len(means) > 1 else "") + ")")
    print(f"within tolerance:   {statistics.fmean(within):.1f}/{meals_n} "
          f"(range {min(within)}-{max(within)})")
    print(f"\nA difference smaller than {spread:.1f} points between two pipelines is "
          f"not a result at this\nrun count. Raise --repeat, or accept the comparison "
          f"is inconclusive.\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pipeline", choices=list(PIPELINES.keys()), default="baseline")
    ap.add_argument("--meals", default=str(HERE / "meals.jsonl"))
    ap.add_argument("--tolerance", type=float, default=15.0,
                     help="calorie %% error considered 'close enough' (default 15)")
    ap.add_argument("--json", default=None, help="write full per-meal results to this path")
    ap.add_argument("--model", default=DEFAULT_MODEL,
                    help=f"claude pipeline only (default {DEFAULT_MODEL})")
    ap.add_argument("--resolve", choices=["none", "estimate", "db"], default="none",
                    help="claude pipeline only: whether a `foods` match overrides "
                         "Claude's numbers (default none - score the parse alone)")
    ap.add_argument("--repeat", type=int, default=1,
                    help="run the whole set N times and report the spread. Use this "
                         "before believing any A/B: the same prompt has scored 14.2%% "
                         "and 16.8%% on the easy 50 on different days.")
    args = ap.parse_args()

    meals = load_meals(args.meals)

    def one_pass():
        if args.pipeline == "claude":
            return run_claude(meals, model=args.model, resolve=args.resolve)
        return PIPELINES[args.pipeline](meals)

    if args.repeat > 1:
        summaries, results = [], None
        for i in range(args.repeat):
            results = one_pass()
            summaries.append(score(results, tolerance_pct=args.tolerance))
            print(f"run {i+1}/{args.repeat}: {summaries[-1]['calories_mape']}% mean calorie error")
        print_repeat_report(summaries, len(meals))
        summary = summaries[-1]  # the detail report below shows the last run
    else:
        results = one_pass()
        summary = score(results, tolerance_pct=args.tolerance)
    print_report(summary, results)

    tokens_in = sum(r.get("usage", {}).get("input_tokens", 0) for r in results)
    tokens_out = sum(r.get("usage", {}).get("output_tokens", 0) for r in results)
    if tokens_in or tokens_out:
        # Rates as of 2026-06; update if the model changes tier.
        rates = {
            "claude-haiku-4-5": (1.0, 5.0),
            "claude-sonnet-5": (2.0, 10.0),
            "claude-opus-5": (5.0, 25.0),
        }
        r_in, r_out = rates.get(args.model, (0.0, 0.0))
        cost = (tokens_in / 1e6) * r_in + (tokens_out / 1e6) * r_out
        print(f"Model: {args.model}   resolve={args.resolve}")
        print(f"Tokens: {tokens_in:,} in / {tokens_out:,} out"
              + (f"   ~${cost:.3f} this run   (~${cost/len(results):.5f}/meal)"
                 if r_in else ""))
        print()

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump({"pipeline": args.pipeline, "summary": summary, "results": results}, f, indent=2)
        print(f"Full results written to {args.json}")


if __name__ == "__main__":
    main()
