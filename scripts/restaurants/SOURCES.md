# Restaurant sources — moving off Nutritionix

Goal (Danny 2026-09-28, see docs/food-data-sourcing.md): every chain from its
own published numbers. A chain moves to `official` only when its fetcher
exists and its numbers were checked against the rows it replaces.
Until then its Nutritionix rows stay loaded, so nothing goes missing.

Official already: chipotle, mcdonalds, chick-fil-a, sweetgreen, cava.

**Wing-chain trap (2026-10-30):** a sauce listed per wing count must never be
loaded as a row of its own. The parser read "10 boneless honey bbq" as the
140 kcal sauce row and dropped the 610 kcal of wings. `buffalo_wild_wings.py`
writes wings + sauce as one dish per count; Wingstop and Zaxby's will need the
same when they move.

**Range trap (2026-11-02):** a calorie range like "100-150" can parse as a name
ending "100-" and 150 calories, because the row pattern allows no space before
the first number. Shake Shack's spirits loaded that way once. Reject names that
end in `-` or `/` after a digit.

**Blocked sites (probed 2026-11-02):** Panda Express, KFC, Raising Cane's,
Zaxby's, Panera, Dairy Queen and Applebee's answer a script with 403. That is
bot blocking, so don't work around it: look for a public PDF link instead, or
leave the chain for licensing. Subway's page reset or timed out; its 2026 US
allergen PDF exists, the nutrition one wasn't found. Wingstop, Culver's,
Whataburger, Jimmy John's, Papa John's, Krispy Kreme, Chili's, Smoothie King,
MOD, Blaze, McAlister's and Jason's Deli load but show no nutrition PDF in their
HTML, so they probably need a look in a browser.

| slug | chain | official source | status |
|---|---|---|---|
| taco-bell | Taco Bell | tacobell.com shows calories only; its own "nutrition calculator" link IS Nutritionix | blocked: needs a Nutritionix license, FatSecret, or a written request to Taco Bell |
| wendys | Wendy's |  | nutritionix |
| burger-king | Burger King | bk.com is an app shell; menu needs a store selected; no public PDF found | todo: capture the app's menu API in the browser |
| subway | Subway |  | nutritionix |
| starbucks | Starbucks | starbucks.com/menu (product pages) | nutritionix |
| dunkin | Dunkin' | Nutrition Guide PDF, dunkindonuts.com (updated 2026-08-19) | **official** 2026-09-28: 974 rows; 748 exact-name matches, 9 differ (guide newer; Nutritionix had S/M macchiato swapped) |
| panda-express | Panda Express |  | nutritionix |
| five-guys | Five Guys | US Nutrition & Allergen PDF, fiveguys.com (chart dated 01-2024) | **official** 2026-11-02: 41 rows, components only; 32/32 matched agree. Hamburger Patty prints 302 kcal but its macros give 217, left as published: see BUILD_LOG |
| shake-shack | Shake Shack | Nutrition & Allergen PDF, shakeshack.com/document/2451 (created 2026-08-10) | **official** 2026-11-02: 275 rows; 122/142 matched agree, the rest look like recipe changes (Avocado Bacon Single 610 -> 670). Spirits and combos are ranges and are not loaded |
| in-n-out-burger | In-N-Out Burger | PDF at in-n-out.com/docs/default-source/downloads/nutrition_info.pdf; script fails certificate verification, not tried in a browser | todo |
| popeyes | Popeyes | same platform as BK (RBI) | nutritionix |
| kfc | KFC |  | nutritionix |
| raising-canes | Raising Cane's |  | nutritionix |
| wingstop | Wingstop |  | nutritionix |
| zaxbys | Zaxby's |  | nutritionix |
| bojangles | Bojangles | Nutrition wall-sign PDF (2025), bojangles.com | **official** 2026-10-30: 148 rows; 139/141 matched agree. The guide lists Garden Salad twice (170 and 260); the first is kept. Still the newest file the site links |
| sonic | Sonic |  | nutritionix |
| arbys | Arby's | Nutritional & Allergen PDF, arbys.com/nutrition (Sept 2026) | **official** 2026-09-28: 123 rows; 94/101 matched agree, rest are Nutritionix's retired sizes/items |
| jack-in-the-box | Jack in the Box |  | nutritionix |
| culvers | Culver's |  | nutritionix |
| whataburger | Whataburger |  | nutritionix |
| carls-jr | Carl's Jr. |  | nutritionix |
| hardees | Hardee's |  | nutritionix |
| del-taco | Del Taco | Nutritional List PDF, deltaco.com/files/pdf/2026/nutritional-09-2026.pdf (September 2026; the path carries the date, so read deltaco.com/nutrition.html for the next one) | **official** 2026-11-02: 166 rows (Nutritionix had 101); 47/59 matched agree, others look like recipe changes (Bean & Cheese Red 460 -> 520). Meal tables are ranges and are not loaded |
| el-pollo-loco | El Pollo Loco | Nutrition Guide PDF, elpolloloco.com (May 2026) | **official** 2026-09-28: 118 rows; drinks are the guide's no-ice figures (size says "(no ice)"); Nutritionix's were ~half |
| qdoba | Qdoba |  | nutritionix |
| panera-bread | Panera Bread |  | nutritionix |
| jimmy-johns | Jimmy John's |  | nutritionix |
| firehouse-subs | Firehouse Subs | same platform as BK (RBI) | nutritionix |
| potbelly | Potbelly |  | nutritionix |
| mcalisters-deli | McAlister's Deli |  | nutritionix |
| jasons-deli | Jason's Deli |  | nutritionix |
| noodles-company | Noodles & Company |  | nutritionix |
| pizza-hut | Pizza Hut |  | nutritionix |
| dominos | Domino's |  | nutritionix |
| papa-johns | Papa John's |  | nutritionix |
| mod-pizza | MOD Pizza |  | nutritionix |
| blaze-pizza | Blaze Pizza |  | nutritionix |
| dairy-queen | Dairy Queen |  | nutritionix |
| krispy-kreme | Krispy Kreme |  | nutritionix |
| tim-hortons | Tim Hortons | same platform as BK (RBI) | nutritionix |
| tropical-smoothie-cafe | Tropical Smoothie Cafe | Health & Nutrition Guide PDF, tropicalsmoothiecafe.com (05/14/26) | **official** 2026-10-30: 123 rows incl. a "made with Splenda" row per smoothie; 41/60 exact names agree, the rest are recipe changes (Mocha Madness 620 -> 810). LTO Javablender page not read |
| smoothie-king | Smoothie King |  | nutritionix |
| olive-garden | Olive Garden | Nutrition PDF, media.olivegarden.com (US_083126) | **official** 2026-10-30: 288 rows, read by text position; lunch/lighter/kids/catering kept apart in `size`. 96/102 exact names agree; Alfredos ~80 lower, lunch Fettuccine Alfredo 650 -> 920 |
| applebees | Applebee's |  | nutritionix |
| chilis | Chili's |  | nutritionix |
| cheesecake-factory | The Cheesecake Factory | Nutrition PDF served at thecheesecakefactory.com/nutrition | hold: 413/445 agree but some big gaps (meatloaf 1930 vs 1400, fries 530 vs 1060); check before switching |
| texas-roadhouse | Texas Roadhouse |  | nutritionix |
| outback-steakhouse | Outback Steakhouse | Full nutrition PDF, outback.com (2026) | **official** 2026-09-28: 487 rows; 186/262 exact matches agree, the rest look like recipe changes (guide is current) |
| red-robin | Red Robin |  | nutritionix |
| buffalo-wild-wings | Buffalo Wild Wings | Nutrition Guide PDF 08-18 to 11-17-2026, buffalowildwings.com | **official** 2026-10-30: 1,050 rows (Nutritionix had 313); wings x sauce written as combined dishes per count. 86/97 exact names agree. **Guide expires 11-17-2026: re-download then** |
| ihop | IHOP |  | nutritionix |
| dennys | Denny's | Core + LTO nutrition PDFs, dennys.com (May 2026) | **official** 2026-09-28: 223 rows; 41/43 exact-name matches agree |
| cracker-barrel | Cracker Barrel |  | nutritionix |
| pf-changs | P.F. Chang's | Nutrition PDF, pfchangs.com (autumn 2026 menu) | **official** 2026-09-28: 199 rows; 41/41 exact-name matches agree (Nutritionix split shareables into per-person rows) |
| wawa | Wawa |  | nutritionix |
| sheetz | Sheetz |  | nutritionix |
