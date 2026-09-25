"""Local A/B: score a prompt file on a meal set N times with run.py's own score().

usage: python ab.py <prompt.ts> <meals.jsonl> <n> <out.json>

env: PROBE_MODEL (default claude-haiku-4-5), PROBE_TEMP (unset = API default 1.0)
"""
import json, os, re, sys, statistics, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

EVALS = r"C:\Users\dshee\Claude Code\snack-track\evals"
sys.path.insert(0, EVALS)
import run  # noqa
run.load_env_local()

src_path, meals_path, n, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
src = open(src_path, encoding="utf-8").read()
system = re.search(r"const SYSTEM = `(.*?)`;", src, re.S).group(1)
t = re.search(r"const LOG_MEAL_TOOL = (\{.*?\n\}) as const;", src, re.S).group(1)
t = re.sub(r"//.*", "", t)
t = re.sub(r"([{,]\s*)([A-Za-z_]+):", r'\1"\2":', t)
t = re.sub(r",(\s*[}\]])", r"\1", t)
tool = json.loads(t)
base = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
key = os.environ["ANTHROPIC_API_KEY"]
meals = run.load_meals(os.path.join(EVALS, meals_path))


def one(meal):
    req_body = {"model": os.environ.get("PROBE_MODEL", "claude-haiku-4-5"), "max_tokens": 2000, "system": system,
                       "tools": [tool], "tool_choice": {"type": "tool", "name": "log_meal"},
                       "messages": [{"role": "user", "content": meal["text"]}]}
    if os.environ.get("PROBE_TEMP"):
        req_body["temperature"] = float(os.environ["PROBE_TEMP"])
    body = json.dumps(req_body).encode()
    for attempt in range(6):
        try:
            req = urllib.request.Request(base + "/v1/messages", data=body, headers={
                "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.load(r)
            break
        except Exception:
            if attempt == 5:
                raise
            time.sleep(2 ** attempt)
    items = next(b for b in d["content"] if b["type"] == "tool_use")["input"]["items"]
    pred = {k: float(sum(i[k] for i in items)) for k in run.MACROS}
    return {"id": meal["id"], "text": meal["text"], "tags": meal.get("tags", []),
            "expected": meal["expected"], "expected_range": meal.get("expected_range"),
            "predicted": pred, "unresolved_items": [i["name"] for i in items if i.get("confidence") == "low"],
            "items": items, "usage": d.get("usage", {})}


allruns = []
with ThreadPoolExecutor(12) as ex:
    for i in range(n):
        res = list(ex.map(one, meals))
        s = run.score(res)
        allruns.append({"summary": s, "results": res})
        print(f"run {i+1}: {s['calories_mape']}%  within={s.get('within_tolerance', s.get('within_tolerance_count'))}", flush=True)
json.dump(allruns, open(out, "w", encoding="utf-8"), indent=1)
m = [r["summary"]["calories_mape"] for r in allruns]
print(f"MEAN {statistics.mean(m):.2f}  SD {statistics.stdev(m):.2f}")
