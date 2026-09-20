# The hard meal set

`meals_hard.jsonl` — 20 meals that test the thing SNACK TRACK is betting on:
**accuracy when the description is vague, casual, or a real restaurant meal
nobody has a nutrition label for** (`PRODUCT.md` → Easy → "The bet").

It does not replace `meals.jsonl`. That file is 50 everyday sentences with
point ground truth and it stays frozen as the regression set — the 19.8%
baseline and 14.2% Haiku numbers in `BUILD_LOG.md` are measured on it and have
to stay comparable. This is a second instrument for a harder question.

```bash
python run.py --meals meals_hard.jsonl                                    # prototype baseline
python run.py --meals meals_hard.jsonl --pipeline claude --resolve estimate  # shipping pipeline
python run.py --meals meals_hard.jsonl --pipeline claude --model claude-sonnet-5 --resolve estimate
```

---

## Why the ground truth is a range

A point would be a fabrication. Pommes aligot spans **267–932 kcal per serving**
across published recipes depending on the cheese-to-potato ratio; Marcel
publishes nothing at all. Claiming "555" would invent a precision nobody has,
and every model would then be scored against a number that is itself a guess.

So each **item** carries a `[low, high]` band — the range a careful person with
the menu in front of them would defend. The bands live in
`hard_source.json` next to the reasoning that produced them, one `why` field
per item. `build_hard.py` rolls them up into one band per meal and writes the
flat file the harness reads.

**Items combine in quadrature, not linearly.** Midpoints add; half-widths add as
`sqrt(Σh²)`. Adding half-widths straight up would make an eight-item meal's band
so wide that nothing could fail it, and an eval nothing can fail measures
nothing. Quadrature says the true thing: the error on "how big was the aligot"
is independent of the error on "how big was the burger", so they partly cancel.
The looser linear band is still written to every row as
`expected_range_linear` if anyone wants to argue the other way.

**Scoring:** inside the band is 0% error. Outside, error is measured from the
**nearest edge**, not the midpoint — so the band is an admission of what we do
not know, not a discount applied to every miss. `meals.jsonl` has no bands and
scores exactly as it always did; `run.py` handles both files.

Two headline numbers come out, and they answer different questions:
- **within 15%** — is it close enough to be useful?
- **inside the band** — did it land where a careful human would have?

## The one convention that decides everything

**A sentence with no sharing language means one full portion of each named
item.** "split", "shared", "half of", "about a third" are honoured literally.

Without this rule the same sentence is scorable to within a factor of two and
the eval is worthless. With it, the Marcel dinner is genuinely ~5,000 calories,
because that is what the sentence says the person ate. `h02`, `h06` and `h07`
exist to test the other side — `h07` has three different sharing rules in one
sentence (steak split, side not, "half a bottle between us" = a quarter bottle
each).

## Regenerating

`meals_hard.jsonl` is generated. Edit `hard_source.json`, then:

```bash
python build_hard.py          # rewrite meals_hard.jsonl
python build_hard.py --check  # fail if the committed file is stale
```

---

## What the set covers

| tag | meals | what it tests |
|---|---|---|
| `restaurant` | 12 | portions plated by a kitchen, not a home cook |
| `named-dish` | 11 | "pommes aligot" is not "potatoes" |
| `not-in-table` | 7 | nothing in `foods` will ever match |
| `casual-phrasing` | 7 | "went pretty hard", "a bunch of", "kept going back" |
| `no-explicit-unit` | 10 | no number anywhere in the sentence |
| `partial-portion` | 4 | "a third of it", "two thirds of the container" |
| `shared-plate` | 3 | explicit sharing, sometimes only for part of the meal |
| `duplicate-item` | 3 | the same food said twice — additive or not |
| `one-phrase-many-foods` | 2 | "a full english", "twelve courses" |
| `multi-course` | 2 | a whole dinner in one sentence |
| `home-cooked` | 3 | no recipe, no measurements, invisible cooking oil |
| `drinks` | 4 | a "glass of wine", "couple beers" |

`h09` (bibimbap) and `h19` (a smoothie with every ingredient named) are
deliberate controls at the easy end. If those two score badly, the problem is
the pipeline, not the obscurity of the food.

## The benchmark meal

`h01` is Danny's real Marcel dinner, the sentence `PRODUCT.md` names as the
standard. Ground truth was built from the restaurant's own 2023 dinner menu
(which confirms the Reserve Burger, the tartare's rosemary focaccia, the Caesar
à la minute and pommes aligot as a side) plus press describing the burger in
detail: **a one-pound patty of 28-day dry-aged ribeye and chuck, gruyère, an
Alon's sesame brioche bun, served with frites, a small salad and a roasted
marrow bone.**

That one item is ~2,100 kcal on its own. A pipeline that reads "burger" and
returns 750 is not making a rounding error, and h01 exists to say so in a
number.

The `baguette` / `bread service` pair is counted **once**, at ~355 kcal: they
are the same bread named twice, because that is how people talk. `h15` (chips,
then more chips) is the deliberate inverse, where the repeat *is* additive —
a pipeline that learns to dedupe from h01 must not dedupe there.

---

## Results, 2026-09-20

First run of the set. 20 meals.

| pipeline | mean kcal err | median | within 15% | inside band | meals w/ unresolved | $/meal |
|---|---|---|---|---|---|---|
| prototype `parse.py` | **67.7%** | 78.0% | 2/20 | 2/20 | 17/20 | — |
| `claude-haiku-4-5` | **15.1%** | 6.8% | 12/20 | 7/20 | 3/20 | $0.0026 |
| `claude-sonnet-5` | **10.2%** | 5.8% | 15/20 | 6/20 | 9/20 | $0.0058 |

For scale, the same prototype scores 19.8% on the easy 50. The set is doing its
job: it separates pipelines that the easy set rates as similar.

### The finding: every miss is an undercount

**27 out-of-band misses across both models. 27 undercounts. Zero overcounts.**

That is not noise, it is a bias — and a bias is a prompt problem before it is a
model problem. Both models estimate **restaurant portions as home or chain
portions**. h01 item by item, against ground truth:

| item | truth | haiku | sonnet |
|---|---|---|---|
| Marcel Reserve Burger | 2100 | 750 | 950 |
| Caesar à la minute | 560 | 320 | 320 |
| Steak tartare *with focaccia* | 590 | 280 | 300 |
| Pommes aligot | 555 | 400 | 400 |
| Brie course | 300 | 200 | 200 |
| Gelato | 350 | 140 | 200 |

Every line is low. The bread is the one exception and only by accident: both
models counted `baguette` **and** `bread service` separately (~460 vs 355
counted once), so they over-counted the bread while under-counting everything
else. The dedupe is not working — it is being masked.

### What this says about the levers

- **Model tier is real but second.** Sonnet 5 cuts mean error by a third
  (15.1% → 10.2%) for 2.2× the cost. Worth taking, but it does not fix the bias
  — Sonnet undercounts on 14 of 20 meals too, just by less (14.6% mean
  shortfall vs Haiku's 23.3%).
- **The prompt is the cheap lever and it is aimed at something specific now:**
  restaurant portions are not home portions; a named dish served with something
  (tartare + focaccia) includes the something; "bread service" and "baguette"
  in one sentence are one bread.
- **Follow-up questions would not have helped** any of these. Nobody needed to
  be asked anything — the sentences were complete. The gap is knowledge of what
  a restaurant serves, which is exactly the argument `PRODUCT.md` makes for not
  buying accuracy with interrogation.

One honest caveat: Sonnet lands **inside the band** on fewer meals than Haiku
(6 vs 7) while being much better on mean error. The two metrics measure
different things — Sonnet's misses are smaller but still outside. Sonnet also
flags low confidence far more often (9 meals vs 3), which for a pipeline that is
systematically undercounting is arguably the more honest behaviour.
