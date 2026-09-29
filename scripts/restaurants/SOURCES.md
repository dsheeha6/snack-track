# Restaurant sources — moving off Nutritionix

Goal (Danny 2026-09-28, see docs/food-data-sourcing.md): every chain from its
own published numbers. A chain moves to `official` only when its fetcher
exists and its numbers were checked against the rows it replaces.
Until then its Nutritionix rows stay loaded, so nothing goes missing.

Official already: chipotle, mcdonalds, chick-fil-a, sweetgreen, cava.

| slug | chain | official source | status |
|---|---|---|---|
| taco-bell | Taco Bell | tacobell.com shows calories only; its own "nutrition calculator" link IS Nutritionix | blocked: needs a Nutritionix license, FatSecret, or a written request to Taco Bell |
| wendys | Wendy's |  | nutritionix |
| burger-king | Burger King | bk.com is an app shell; menu needs a store selected; no public PDF found | todo: capture the app's menu API in the browser |
| subway | Subway |  | nutritionix |
| starbucks | Starbucks | starbucks.com/menu (product pages) | nutritionix |
| dunkin | Dunkin' | Nutrition Guide PDF, dunkindonuts.com (updated 2026-08-19) | **official** 2026-09-28: 974 rows; 748 exact-name matches, 9 differ (guide newer; Nutritionix had S/M macchiato swapped) |
| panda-express | Panda Express |  | nutritionix |
| five-guys | Five Guys |  | nutritionix |
| shake-shack | Shake Shack |  | nutritionix |
| in-n-out-burger | In-N-Out Burger |  | nutritionix |
| popeyes | Popeyes | same platform as BK (RBI) | nutritionix |
| kfc | KFC |  | nutritionix |
| raising-canes | Raising Cane's |  | nutritionix |
| wingstop | Wingstop |  | nutritionix |
| zaxbys | Zaxby's |  | nutritionix |
| bojangles | Bojangles | Nutrition guide PDF (Feb 2025), bojangles.com | todo: two-column page; check it is current |
| sonic | Sonic |  | nutritionix |
| arbys | Arby's | Nutritional & Allergen PDF, arbys.com/nutrition (Sept 2026) | **official** 2026-09-28: 123 rows; 94/101 matched agree, rest are Nutritionix's retired sizes/items |
| jack-in-the-box | Jack in the Box |  | nutritionix |
| culvers | Culver's |  | nutritionix |
| whataburger | Whataburger |  | nutritionix |
| carls-jr | Carl's Jr. |  | nutritionix |
| hardees | Hardee's |  | nutritionix |
| del-taco | Del Taco | PDF linked from deltaco.com/nutrition via script (path 404s when fetched directly) | todo |
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
| tropical-smoothie-cafe | Tropical Smoothie Cafe | Nutrition guide PDF, tropicalsmoothiecafe.com | todo: allergen codes precede the numbers |
| smoothie-king | Smoothie King |  | nutritionix |
| olive-garden | Olive Garden | Nutrition PDF, media.olivegarden.com (downloaded 2026-09-28) | todo: names and numbers on separate lines |
| applebees | Applebee's |  | nutritionix |
| chilis | Chili's |  | nutritionix |
| cheesecake-factory | The Cheesecake Factory | Nutrition PDF served at thecheesecakefactory.com/nutrition | hold: 413/445 agree but some big gaps (meatloaf 1930 vs 1400, fries 530 vs 1060); check before switching |
| texas-roadhouse | Texas Roadhouse |  | nutritionix |
| outback-steakhouse | Outback Steakhouse | Full nutrition PDF, outback.com (2026) | **official** 2026-09-28: 487 rows; 186/262 exact matches agree, the rest look like recipe changes (guide is current) |
| red-robin | Red Robin |  | nutritionix |
| buffalo-wild-wings | Buffalo Wild Wings | Nutrition Guide PDF 08-18 to 11-17-2026, buffalowildwings.com | todo: sauces/wings in several layouts |
| ihop | IHOP |  | nutritionix |
| dennys | Denny's | Core + LTO nutrition PDFs, dennys.com (May 2026) | **official** 2026-09-28: 223 rows; 41/43 exact-name matches agree |
| cracker-barrel | Cracker Barrel |  | nutritionix |
| pf-changs | P.F. Chang's | Nutrition PDF, pfchangs.com (autumn 2026 menu) | **official** 2026-09-28: 199 rows; 41/41 exact-name matches agree (Nutritionix split shareables into per-person rows) |
| wawa | Wawa |  | nutritionix |
| sheetz | Sheetz |  | nutritionix |
