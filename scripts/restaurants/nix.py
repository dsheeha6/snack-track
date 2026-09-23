"""Nutritionix-hosted menu pages: m.nutritionix.com/<brand>/menu/premium lists
items, each item page carries the label values in its nutritionLabel() call."""
import re, html, time
from concurrent.futures import ThreadPoolExecutor
from common import fetch

BASE = "https://m.nutritionix.com"
KEYS = {"valueCalories": "calories", "valueProteins": "protein", "valueTotalCarb": "carbs",
        "valueTotalFat": "fat", "valueSugars": "sugar", "valueFibers": "fiber",
        "valueSodium": "sodium_mg", "valueServingWeightGrams": "serving_g"}


def more(brand, cat_id, offset):
    """A category's 'View More' pages: JSON, 6 items at a time, XHR-only."""
    import json
    menu_url = f"{BASE}/{brand}/menu/premium"
    items = []
    while True:
        for attempt in range(4):
            try:
                raw = fetch(f"{BASE}/{brand}/categoryItems/{cat_id}/{offset}/", timeout=40,
                            headers={"Referer": menu_url, "X-Requested-With": "XMLHttpRequest"})
                break
            except Exception:
                time.sleep(2 ** attempt)
        else:
            raise RuntimeError(f"{brand} category {cat_id} offset {offset} kept failing")
        page = json.loads(raw)
        for k, v in page.items():
            if k.isdigit():
                items.append((html.unescape(v["name"]).strip(), v["url"] + "?show"))
        added = int(page.get("addedItems") or 0)
        if not page.get("showViewMore") or added == 0:
            return items
        offset += added


def menu(brand):
    b = fetch(f"{BASE}/{brand}/menu/premium", timeout=40)
    out, cat, seen = [], "", set()
    pat = (r'list-divider[^>]*>(?:<!--.*?-->)?\s*([^<]+?)\s*</li>'
           r'|<a class="ui-btn" href="(/[^"]+/\?show)"[^>]*>\s*([^<]+?)\s*<span'
           r'|href="/[^"]+/categoryItems/(\d+)/(\d+)/"')
    for m in re.finditer(pat, b, re.S):
        if m.group(1):
            cat = html.unescape(m.group(1)).strip()
        elif m.group(2):
            if m.group(2) not in seen:
                seen.add(m.group(2))
                out.append((cat, html.unescape(m.group(3)).strip(), m.group(2)))
        else:
            for name, path in more(brand, m.group(4), int(m.group(5))):
                if path not in seen:
                    seen.add(path)
                    out.append((cat, name, path))
    return out


def item(path):
    for attempt in range(4):
        try:
            b = fetch(BASE + path, timeout=40)
            break
        except Exception:
            time.sleep(2 ** attempt)
    else:
        return None
    vals = dict(re.findall(r"\b(value[A-Za-z_0-9]+)\s*:\s*'?([^,'\n]*)'?", b))
    d = {KEYS[k]: vals[k] for k in KEYS if k in vals}
    d["unit"] = vals.get("valueServingSizeUnit", "")
    d["unit_qty"] = vals.get("valueServingUnitQuantity", "")
    return d


def brand_rows(brand, workers=6):
    """Every menu item with its label. Items whose page failed get a second,
    slower serial pass; any still missing are reported, never silently dropped
    (2026-09-21: Pizza Hut lost 167 of 263 rows that way under three parallel
    jobs)."""
    items = menu(brand)
    with ThreadPoolExecutor(workers) as ex:
        details = list(ex.map(lambda t: item(t[2]), items))
    for i, d in enumerate(details):
        if not d or d.get("calories") in (None, ""):
            time.sleep(1.5)
            details[i] = item(items[i][2])
    missing = [items[i][1] for i, d in enumerate(details) if not d or d.get("calories") in (None, "")]
    if missing:
        print(f"{brand}: {len(missing)} of {len(items)} items still failed, e.g. {missing[:3]}")
    return [(c, n, p, d) for (c, n, p), d in zip(items, details) if d and d.get("calories") not in (None, "")]
