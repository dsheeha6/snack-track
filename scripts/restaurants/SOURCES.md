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
| bojangles | Bojangles |  | nutritionix |
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
| tropical-smoothie-cafe | Tropical Smoothie Cafe |  | nutritionix |
| smoothie-king | Smoothie King |  | nutritionix |
| olive-garden | Olive Garden |  | nutritionix |
| applebees | Applebee's |  | nutritionix |
| chilis | Chili's |  | nutritionix |
| cheesecake-factory | The Cheesecake Factory |  | nutritionix |
| texas-roadhouse | Texas Roadhouse |  | nutritionix |
| outback-steakhouse | Outback Steakhouse |  | nutritionix |
| red-robin | Red Robin |  | nutritionix |
| buffalo-wild-wings | Buffalo Wild Wings |  | nutritionix |
| ihop | IHOP |  | nutritionix |
| dennys | Denny's |  | nutritionix |
| cracker-barrel | Cracker Barrel |  | nutritionix |
| pf-changs | P.F. Chang's |  | nutritionix |
| wawa | Wawa |  | nutritionix |
| sheetz | Sheetz |  | nutritionix |
