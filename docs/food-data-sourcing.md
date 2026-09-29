# Where food data comes from: what other trackers do, what's legal, what we do

Written 2026-09-28 for Danny's question in QUESTIONS.md ("figure out how
myfitnesspal, cal ai, those other top calorie trackers get their data"). Not
legal advice. Get a one-hour consult with a lawyer before launch (Phase 8);
the job is small enough that one hour covers it.

## What the big apps actually do

| App | Where its data comes from |
|---|---|
| **MyFitnessPal** | Mostly **crowdsourced**: any user can add a food, with no source required and no review before it goes live. That's how it reached 14M+ entries, and it's why it has so many duplicate or wrong ones. A "verified" badge (staff review plus ML that averages many entries of the same food) covers a minority. It also **licenses Nutritionix** data (Syndigo lists MyFitnessPal as a Nutritionix customer). |
| **Cronometer** | **Government and research databases**: USDA FoodData Central, NCCDB (the University of Minnesota's lab database, licensed), and the Canadian Nutrient File, plus its own curated community database checked by staff. The accuracy leader. |
| **MacroFactor** | An in-house team plus **user submissions that other humans vet** before they go public. |
| **Cal AI** and other photo apps | Mostly **estimates**: a vision model guesses the food and portion, backed by a food database of roughly 1M items for search and barcodes. They don't say publicly which one. Same shape as our parse-meal, with a camera instead of a sentence. |
| **Lose It!** | A mix of in-house, crowdsourced and licensed data. |

In short, nobody has secret data. Everyone combines the same few things: public
USDA data, a licensed commercial feed, and their own users' contributions. The
apps that win on accuracy are the ones that **verify** what comes in.

## The legal picture (US)

1. **Nutrition facts are not copyrightable.** *Feist v. Rural* (1991): facts
   can't be owned, even when collecting them took work. "A Big Mac is 580
   calories" belongs to nobody. What *can* be protected is a compilation's
   creative selection and arrangement, plus any written text and photos.
2. **Chains are required to publish their numbers.** The FDA menu-labeling
   rule (21 CFR 101.11, enforced since 2018) makes every chain with 20+
   locations post calories and provide full written nutrition information.
   That's why every big chain has a nutrition page or PDF. **The chain's own
   page is the primary source, and it's the one we want.**
3. **The real risk is contract (terms of service), not copyright.** That's why
   Nutritionix is the problem and McDonald's isn't. Nutritionix sells this data
   as an API, and its terms forbid scraping. The courts have leaned toward
   scrapers of public pages:
   - *hiQ v. LinkedIn*: scraping public pages isn't "hacking" under the
     Computer Fraud and Abuse Act. But hiQ ultimately **lost on breach of
     contract** and settled, so the win was only partial.
   - *Meta v. Bright Data* (N.D. Cal. 2024): a logged-out scraper wasn't bound
     by Meta's terms, and Meta dropped the case.

   Even so, "we'd probably win the lawsuit" is not a plan for a small app.
   Nutritionix could send a cease-and-desist the week we launch, and building
   a business on its compiled work is exactly the fact pattern that loses.
4. **The EU and UK are different.** They have a *database right* that protects
   the effort of compiling a database even when the facts inside aren't
   protected. This matters only if we launch there.
5. **Licenses have strings.** Open Food Facts is free but ODbL: merge it into
   our database and the merged database has to be shared under the same
   license. Use it as a lookup kept separate from `foods`, or don't use it.
   USDA data is public domain with no strings, which is why it's our base.

## What we should do

Most-legitimate first. None of these are loopholes; they're the routes the
serious apps use.

1. **Go to the source for every chain (before launch).** Replace the 57
   Nutritionix-mirrored chains in `scripts/restaurants/nutritionix_chains.py`
   with each chain's own nutrition page, PDF or calculator, the way
   `chipotle.py`, `mcdonalds.py`, `chick_fil_a.py` and `sweetgreen.py` already
   work. The numbers will be identical (checked 2026-09-21), and the rule above
   means every chain in the list publishes them. One catch: Taco Bell's
   official calculator is itself *hosted* by Nutritionix, so Taco Bell should
   come from its own PDF. This is mechanical, one fetcher per chain, and the
   `common.py` 4/4/9 check applies to every one.
2. **Store where every number came from.** Add `source_url` and `fetched_at`
   to `restaurant_items`, and re-fetch quarterly with a diff (menus change,
   which is why the eval set's Big Mac was stale). That record is our defence
   if anyone ever asks, and it keeps the data from going stale.
3. **Build our own data from users (Phase 5b plus label scanning).** This is
   what makes MyFitnessPal big and MacroFactor accurate. Add a "scan the
   nutrition label" step for when a barcode isn't found: the user photographs
   the label, a vision model reads the panel, and the result goes into
   `pending` community foods, which get promoted once a second scan or a
   review agrees. Unlike MyFitnessPal, **nothing goes public unverified**.
   Over time this becomes data nobody else has.
4. **A licensed fallback for the long tail, if we need one.** FatSecret
   Platform has a **free tier** (5,000 calls a day on the US dataset, with an
   attribution credit) and a free Premier tier for startups, and it includes
   restaurant and branded foods. It's legal coverage for chains and products
   we don't hold, at $0 until we're big. Nutritionix is ~$1,850/month and
   Edamam $299+/month, so not now.
5. **Keep estimating like Cal AI does, but better.** For anything no database
   holds, parse-meal's estimate is the product. It's measured (the everyday
   set is at 9.3% error), and accuracy on vague and restaurant meals is
   already where the effort goes.

## Sources

- [How MyFitnessPal's food database works](https://blog.myfitnesspal.com/how-food-database-works/)
- [MyFitnessPal and Nutritionix (Syndigo)](https://syndigo.com/success-stories/myfitnesspal/)
- [Cronometer data sources](https://support.cronometer.com/hc/en-us/articles/360018239472-Data-Sources)
- [Cronometer vs MacroFactor](https://calorie-trackers.com/compare/cronometer-vs-macrofactor/)
- [Cal AI](https://www.calai.app/)
- [FDA menu labeling requirements](https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/menu-labeling-requirements), [21 CFR 101.11](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.11)
- [Meta v. Bright Data ruling](https://www.fbm.com/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/)
- [fatsecret Platform editions](https://platform.fatsecret.com/api-editions)
- [Nutrition API pricing, 2026](https://www.spikeapi.com/blog/top-nutrition-apis-for-developers-2026)
