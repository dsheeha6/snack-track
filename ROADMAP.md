# SNACK TRACK — roadmap

One phase at a time, in order. Each phase has a goal, a short task list, and a
**done when** line. Nothing moves to the next phase until the current one's
"done when" is genuinely true and verified by running it.

**CURRENT PHASE: 4 — AI logging.** Phase 3 landed 2026-08-24: the onboarding
flow was built and driven end to end in the running app against a throwaway
account, which came out the other side with real targets, a weight row and a
first logged food. Phase 2 before it is built and verified:
as of 2026-08-23 the app has been **signed into and driven by hand**, not just
bundled — Today, Week and search across all 407,086 foods, all against real
data — and on 2026-08-24 Danny got it running on the Android emulator.

**Build order, Danny's call 2026-08-24: features first, auth last.** Phases 3-5
(onboarding/targets, AI logging, suggestions) come before Google sign-in, Apple,
and the Supabase redirect allowlist — those three move together, late. No iPhone
until the $99 Apple membership, which he's declined for now; that only becomes
load-bearing at Phase 8.

Both sign-in bugs are closed (resend throttle fixed 2026-08-23; the
session-restore one closed by Danny 2026-08-24, with two defensive fixes already
in). One "done when" is still outstanding and it's a usage question, not a build
one: Phase 2 closes when Danny goes a full day on the app instead of the
prototype.

**Read `PRODUCT.md` before any decision about features, copy, or design.** The app
is simple, easy, and doesn't judge anyone. That's the differentiator, not a slogan —
it decides what gets built and what gets refused.

**Danny's direction 2026-09-17, and it outranks the phase order below when the
two conflict:** the way you log food is settled and he likes it — type what you
ate, it lands. The investment from here is **accuracy on vague, casual and
restaurant descriptions**, not a new input method. Photo logging is explicitly
not the priority. The full statement, with the eleven-item Marcel dinner that
is the working benchmark, is in `PRODUCT.md` → Easy → "The bet". **First win landed 2026-09-20:** the
20-meal hard set exists, it showed both models undercounting restaurant
portions on every meal they missed, and the prompt fix for that is shipped —
**18.09% → 14.90%** mean calorie error on hard meals (p=0.025), no regression
on the everyday 50. Details below, under **Accuracy work**.

**Danny's direction 2026-09-20, and it sets the order of everything below:**
he is starting to see visual work, features and bugs worth doing, but
**the backend, the database and the core parse function get solid first.**
The tiered plan and what's done against it is under **Backend first** below.

**Marketing is tracked in `marketing/MARKETING.md`, not here.** This file is what
gets built; that one is what gets said. Danny's plan as of 2026-09-17: 90-day
eating/fitness challenges with his own daily meal tracking as the long-term
content, heavy organic and word of mouth, **paid ads only after consistent
monthly profit**. The daily-tracking content can start now — it's the same
activity as Phase 2's outstanding "done when". Telling people to *download* it
waits on Phase 8, and converting them waits on Phase 6.

Plan behind all of this: https://claude.ai/code/artifact/098c2efa-faa4-4f9c-a5e4-d4783dc9b4c9
Prototype and eval baseline: `../calorie-tracker` (keep it working — Danny uses it daily)

---

## Phase 0 — Groundwork ✅ done 2026-08-19

**Goal:** somewhere to build, and a database to build against.

- [x] Repo, `build` branch, roadmap / build log / questions files
- [x] Prototype put under version control
- [x] Supabase project created (`snack-track`, free tier)
- [x] Full schema applied with row level security on every table
- [x] Security advisor clean
- [x] `db/schema.sql` and `docs/supabase.md` in git, keys in gitignored `.env.local`

---

## Phase 1 — Foundation

**Goal:** a real app that opens on Danny's phone and signs him in.

- [x] Node.js installed (v24.19.0, npm 11.17.0)
- [x] GitHub repo connected and both branches pushed
- [x] Expo project created (`mobile/`, SDK 57, expo-router). Bundles clean for
      web, iOS, and Android, and **runs on the Android emulator** — Danny had it
      up 2026-08-24. A physical iPhone waits on the $99 Apple membership,
      declined for now.
- [x] Supabase client wired up, reading config from env (`mobile/.env.local`,
      gitignored, `EXPO_PUBLIC_*`)
- [x] Email sign-in working end to end — verified for real: requested a magic
      link, read it out of Gmail, followed it, landed signed in on the Today
      screen. Only the physical-device leg (tap the link on an iPhone) is unverified.
- [x] Sign-in reworked for speed (2026-08-23, Danny's ask): a 6-digit **email
      code** typed in the app is now the default, which never leaves the app and
      so needs no redirect at all; **email+password** is there for people who
      expect it; and a **biometric lock** (Face ID / fingerprint) re-opens an
      existing session. Google and Apple are scoped in QUESTIONS.md.
- [x] Email delivery working for real (2026-08-23): Danny added `{{ .Token }}`
      to the Magic Link template and configured Gmail SMTP (no domain needed).
      Proved end to end — code requested in the app, delivered, read back,
      signed in. Note the OTP here is **8 digits**, not Supabase's default 6.
- [x] The 60s resend throttle no longer surfaces as a raw error (2026-08-23):
      both the send and resend buttons disable with a live countdown, and a
      429 that gets through anyway is phrased plainly. Traced through the
      code but not eyeballed — no dev server in this unattended run.
- [x] **Both sign-in bugs closed.** The resend throttle was fixed 2026-08-23.
      The session-restore one Danny closed 2026-08-24 ("no longer an issue")
      without a root cause — acceptable because the two defensive fixes that
      landed anyway (`signOut()` uses global scope; the sign-in screen rejects
      any session arriving while it believes it's signed out) were built to make
      it structurally impossible either way. Reopen it if it ever recurs.
- [ ] Biometric lock still unverified — `expo-local-authentication` reports no
      hardware on web, so the lock screen has never rendered. Now testable on
      the emulator if a fingerprint is enrolled (Extended controls → Fingerprint).
- [x] Row level security verified: exercised the deployed policies directly
      with impersonated JWTs for two different user IDs — a second user gets
      zero rows from `entries` and `profiles`, even when explicitly querying by
      the first user's ID. Anon gets zero rows too.

**Done when:** Danny opens the app on his phone, signs in, and lands on an empty
day view backed by the real database.
*(Met 2026-08-24. Signing in and landing on the real day view was proven on web
2026-08-23 with an emailed code, and the app now runs on the Android emulator.
A physical iPhone waits on the Apple membership, deferred by choice.)*

---

## Phase 2 — Core tracker

**Goal:** everything the prototype does, but multi-user and on a phone.

- [x] Day view: calories, macro bars, meals — grouped by breakfast/lunch/
      dinner/snacks with meal-colored dots matching the prototype's palette.
      No red/scold state on the calorie bar, per PRODUCT.md — over-target
      shows coral only as information, same as the prototype's bottle fill.
- [x] Add and delete entries — modal with a food search box and a manual
      cal/P/C/F form, meal picker defaulting to the time-of-day guess. Delete
      is optimistic (removes from the list immediately, rolls back on error).
- [x] Food search against the `foods` table — debounced query using the
      trigram index. Driven by hand in the running app 2026-08-23 across all
      407,086 rows: "starbucks", "quest bar", "oreo", "chobani" and "chicken
      breast" all return sensible branded matches ("starbucks" returned zero
      before the branded load). Result rows show the brand — without it a Quest
      bar displays as just "APPLE PIE".
- [x] Seed `foods` from USDA FoodData Central — two sources, two seeders,
      each idempotent on its own `source` value so they never clobber each
      other:
      - `source='usda'` — 7,793 SR Legacy whole foods, loaded 2026-08-22 by
        `scripts/seed_foods_usda.py`.
      - `source='usda_branded'` — ~399k packaged products, loaded 2026-08-23 by
        `scripts/stage_branded.py` + `scripts/seed_foods_branded.py`. The full
        2.0M-product dataset doesn't fit the free tier; this is every
        *distinct* product after deduping on (brand, name) and on barcode,
        with implausible and all-zero rows dropped. Danny's call was to stay
        on the free tier.
- [x] Week view and streaks — bottom tabs (Today/Week), 7-day bar chart with
      goal line ported from the prototype, tap a day to see its entries, plus
      a simple "days logged in a row" streak (no prototype precedent for
      streaks specifically, so this is a first design — see BUILD_LOG)
- [x] **Water write bug fixed 2026-09-13** (Danny: "the water doesnt work
      well"). The goal wouldn't save and the count reset — one cause, and not a
      water bug: every write in the app called `supabase.auth.getUser()` first,
      which is a *network* round trip, so a stalled auth request meant the write
      never happened, nothing threw, and the optimistic UI showed water that was
      never saved. Now `requireUserId()` off the cached session. Details and the
      reproduction in BUILD_LOG.
- [x] Drinks — answered by Danny 2026-08-22 and built to that answer. Water is
      a *hydration* feature, not a calorie one: its own `water_log` table and a
      blue ounces widget on the day view, one tap = 8 oz, editable daily goal
      (default 64 oz). It never touches calorie/macro totals and never appears
      as a row in a meal section. Calorie-bearing drinks, alcohol included, go
      through the normal food flow with no special casing.

**Done when:** Danny can stop using the localhost prototype for a full day without
missing anything.

---

## Phase 3 — Onboarding and targets ✅ done 2026-08-24 (bar one optional screen)

**Goal:** a stranger can install it and get correct targets without help.

- [x] The onboarding screens — **eight**, not the plan's seven: name,
      sex/date of birth, height/weight, movement, training, goal, the numbers,
      and an optional first log. `mobile/src/components/onboarding/`, routed at
      `/onboarding`, gated on `profiles.onboarded_at` in both `index.tsx` and
      the root layout so a deep link can't skip it.
- [ ] The **optional food-preferences screen is deliberately not built.** It
      feeds Phase 5's suggestions, and what it should ask is tangled up with
      the still-open nutrient question in QUESTIONS.md. Build it with that
      answer, not before.
- [x] Mifflin-St Jeor + activity math, with the arithmetic shown to the user —
      `mobile/src/lib/targets.ts` (built 2026-08-24), now rendered line by line
      on the review screen: BMR → × activity multiplier → TDEE → goal
      adjustment → calories, then each macro's rule. Verified in the running
      app for Danny's own stats: 1,813 → ×1.725 → 3,128 → −250 → **2,878 cal,
      180P / 360C / 80F**.
- [x] Editable targets, written to `target_history` — "Set my own numbers
      instead" on the review screen, and every finish writes a `target_history`
      row whose `reason` records whether the numbers were calculated or
      adjusted by hand. Today's weight goes to `weights` in the same save.
- [x] The safety floor, **both halves**. Under ~1,200 cal warns plainly and
      still lets you continue — and it re-checks the hand-edited number, not
      just the calculated one. The goal-weight half is now built too: a
      `goal_weight_lb` column was added to `profiles` (migration
      `add_goal_weight_to_profiles`), the question is only asked for cut/bulk
      goals, it's skippable, and a goal below BMI 18.5 is refused with the
      actual pound figure for that height rather than a scold.

**Done when:** a fresh account reaches a personalised target screen and the numbers
match the plan's worked example for Danny's own stats.
*(Met 2026-08-24, with the same caveat recorded when the math was built: BMR,
protein and fat reproduce his real numbers exactly, and calories land at 2,878
against the 2,900 on record — 0.8% — because that 2,900 was never derived from
a documented activity/goal formula there was anything to reverse-engineer.)*

---

## Phase 4 — AI logging

**Goal:** the feature the whole product exists for.

- [x] `evals/meals.jsonl` — 50 meal sentences with hand-checked calorie/
      protein/carb/fat ground truth, tagged by what they test (simple,
      ambiguous quantity, typo, restaurant/not-in-table, etc).
- [x] `evals/run.py` — accuracy harness; **baseline established from the
      prototype's `parse.py`** before any Claude call: 19.8% mean calorie
      error, 56% of meals within 15%, 12/50 meals with an unresolved item.
      Full numbers and what a Claude pipeline needs to beat in BUILD_LOG.
- [x] Edge function holding the Anthropic key, never called from the client —
      `supabase/functions/parse-meal/index.ts`, built 2026-09-13 on
      **`claude-haiku-4-5`** (Danny's pick). Strict tool use for schema-valid
      JSON; returns the prototype's `{items, totals}` shape. Hardened past
      `verify_jwt`, which by itself accepts the **anon key that ships in the app
      bundle** — the function reads the role claim and takes only
      `authenticated` / `service_role`. Danny set the `ANTHROPIC_API_KEY`
      *function secret* the same day and it has been running on it since.
- [x] `--pipeline claude` in `evals/run.py`, with `--model` and `--resolve`,
      calling the deployed function rather than a Python copy of the prompt.
      Reports tokens and dollars per run and per meal.
- [x] **Run it** — done 2026-09-13. **Haiku beats the baseline: 14.2% mean
      calorie error vs 19.8%, 35/50 within 15% vs 28/50, and 1 meal with an
      unresolved item vs 12.** $0.106 a run, $0.0021 a meal. Full per-tag
      breakdown in BUILD_LOG — the short version is that Claude fixed every
      reading-comprehension failure (typos −53.7, word-numbers −35.1,
      restaurant −32.7) and gave back accuracy on the easy meals the ingredient
      table already knew (simple +10.7, multi-item +16.5).
- [x] Structured-output parse → resolve against `foods` → confidence flags.
      All three modes built and two scored. **`db` lost and will not ship:**
      protein 16.3% → 32.4%, carbs 24.4% → 35.3%, fat 33.2% → 39.7%. Cause is
      match quality, not scaling — generic words hit the 399k branded rows
      first (`wine` → red wine *vinegar*, `banana` → banana *pepper*, `oatmeal`
      → oatmeal raisin *cookies*). **`estimate` is the shipping mode**: Claude's
      numbers, database only for the `food_id` link.
- [x] **Fix single-best food resolution** — done 2026-09-14. There were *two*
      defects, not the one recorded here: the ranking, and `search_foods`
      matching with `ILIKE '%apple%'`, which matches **inside** words (`apple`
      in pine*apple* → PINEAPPLE SALSA, `beans` in soy*beans*). New
      `resolve_food(q)` function, deliberately separate from `search_foods` so
      the hand-verified search UX is untouched: word-boundary matching, the
      query's head noun must head the food (no more `chicken` → `Fat, chicken`
      at 900 cal), whole foods before branded, and a branded row only when its
      own name carries every word the user said. **Returns nothing when unsure,
      by design** — `almond milk`, `wine`, `oatmeal` and `beer` now resolve to
      no link at all rather than to something close-but-wrong. 44-54ms.
      Full reasoning, the three rejected versions of the brand rule, and the
      four-attempt performance story in BUILD_LOG.
- [x] `entries.food_id` and the client flipped to `resolve:'estimate'` —
      2026-09-14. The column the link had nowhere to go into (nullable,
      `on delete set null` so a re-seed of `foods` can never delete a food log),
      and `RESOLVE_MODE` in `mobile/src/lib/parse-meal.ts` moved off `'none'`.
      Verified against the deployed function: 10 of 13 items across five
      sentences linked, every link correct, calories untouched by resolution.
- [x] **Wire `parse-meal` into the app** — done 2026-09-13 and **driven by hand
      in the running app**, not just bundled. The sentence box is now the first
      thing in the add-food modal per PRODUCT.md ("typing a sentence is the
      fastest path and stays the primary one"); search and the manual form moved
      below it. Type → review what came back → remove anything wrong → one
      button logs the lot as `source='ai'`. Also wired into onboarding's last
      step, so the first thing a new user is shown is the primary interaction.
- [ ] Follow-up questions: high-variance foods only, capped at two
- [x] **Corrections captured into `personal_foods`** — done 2026-09-17. The
      review list is editable: tap any row, fix the name, amount or numbers, and
      the fix is stored against *the name the parser produced* (not the sentence,
      so "2 eggz" and "some eggs" share one correction) via a new
      `remember_food` function. Every later parse of that food comes back
      carrying the user's own numbers, scaled by amount, labelled "your
      numbers" instead of "estimated portion". A stored correction that can't be
      scaled honestly — "1 scoop" against "a cup" — is declined rather than
      guessed at, the same principle as `resolve_food` returning nothing.
      Logged entries now record where the numbers came from: `manual` for a row
      just corrected, `history` for one that arrived carrying a stored
      correction, `ai` for the parser's own.
- [x] **Token metering into `ai_usage`** — done 2026-09-17. The edge function
      writes the row itself with the service_role key, because a client that
      reports its own usage is a client that can decline to, and Phase 6's free
      tier (5 AI logs/week) has to count something unforgeable. Verified in the
      running app: three parses, three rows, token counts matching what the
      function reported, and a hand-rolled insert from a signed-in client
      refused by RLS. Eval runs are deliberately not metered.

**Done when:** the harness reports the Claude pipeline beating the prototype's
baseline on the 50-meal set, and Danny can log a day by typing sentences.
*(**Both halves met 2026-09-13.** The harness reports 14.2% vs 19.8%, and
typing a sentence into the running app logs a meal — driven by hand against a
throwaway account: "2 eggz on sourdough and a grande latte from starbucks"
came back as Eggs / Sourdough bread / Starbucks grande caffe latte, and the two
kept rows landed under lunch as `source='ai'` with the macro bars updating.
Still open in this phase: follow-up questions, `personal_foods` corrections and
`ai_usage` metering. Danny has not yet used it for a real day — that is what
closes Phase 2's outstanding "done when" too.)*

*(2026-09-14: resolution and the `food_id` link are now done too, so what
remains in Phase 4 is the three items above and nothing structural.)*

*(2026-09-17: corrections and metering are both done and both driven by hand in
the running app. **Follow-up questions are the only Phase 4 item left**, and
they are the one that has to argue with PRODUCT.md's "easy" promise before
they're built — every question is friction in the primary flow.)*

---

## Backend first (Danny's direction 2026-09-20)

Runs ahead of new features, and ahead of the design pass and retention work
below. Visual and feature ideas are not lost — they are queued behind this.

### Tier 0 — database hygiene ✅ done 2026-09-20 (bar one dashboard click)

- [x] **RLS initplan fixed on all nine tables.** Every policy wrapped
      `auth.uid()` in a scalar subquery via `ALTER POLICY` (never DROP +
      CREATE, so no table is ever policy-less mid-migration). `foods` excluded
      — `using (true)` calls nothing. Verified by impersonating the owner, a
      second user and anon: 31 / 0 / 0 / 0 entries visible. Advisor clear.
- [x] **Covering indexes for the two unindexed foreign keys** —
      `entries.food_id` (added 9/14, never indexed) and
      `target_history (user_id, effective_on desc)`. Matters most during the
      sugar/fiber re-seed, which churns 407k `foods` rows.
- [x] **The database can be rebuilt from the repo.** All 24 migrations are now
      in `supabase/migrations/` — before this they existed *only* inside the
      Supabase project. `scripts/check_migrations.py` compares applied-vs-repo
      both ways and checks every live table and function appears in
      `db/schema.sql`; exit code gates a commit. Run it after any schema change.
      Note the constraint it works around: **no Supabase CLI on this machine and
      no database password, only API keys** — so `pg_dump` is not available and
      the check is inventory-level, not column-level.
- [ ] **Leaked password protection — Danny's click, 30 seconds.**
      Authentication → Policies. The only security advisor finding left, and the
      last thing between here and a clean backend. Also tracked in QUESTIONS.md.

### Tier 1 — the core function

The parse function is where the product lives, and the hard eval set gave it a
target. Details under **Accuracy work** below.

- [x] **The eval can now measure its own noise** — `run.py --repeat N`, added
      2026-09-20 after two prompt revisions were compared on single runs and the
      comparison turned out to be meaningless. **Same prompt, three runs of the
      hard 20: 22.8% / 16.7% / 19.4% — spread 6.1 points, sd 3.1.** The easy 50
      scored 14.2% on 09-13 and 16.8% on 09-20 with nothing changed.
      **Nothing below is decided on a single run again.** Ten runs puts the
      standard error near 1 point and costs ~$0.60 a variant on the hard set,
      ~$1.00 on the easy 50. Spend it.
- [x] **Restaurant-portion prompt shipped** — 2026-09-20, deployed as
      **parse-meal v19**. Measured at `--repeat 10` per variant: hard 20 goes
      **18.09% → 14.90%** mean calorie error (p=0.025, 95% CI [0.53, 5.85]) with
      **no regression on the easy 50** (16.72% → 17.28%, p=0.73). It is also
      about half as variable run to run (sd 1.91 vs 3.52).
      The rules added: a restaurant serving is not a home serving; a named dish
      is that dish and not its category; count what the dish arrives with; and
      the same food named twice in one sentence is one item, while a second
      helping adds. The feared non-restaurant regression was itself noise — the
      easy 50 is almost entirely everyday food and shows none at n=10.
- [x] **Haiku vs Sonnet 5, settled 2026-09-22 at 10 runs a side:** hard 20
      16.1% -> 5.0%; easy 50 ties once m28's broken truth is excluded
      (BUILD_LOG). Switching production is Danny's call.
      *Original note:* The 15.1% vs 10.2% gap recorded
      earlier on 09-20 is 4.9 points against a 6.1-point spread — it is not a
      result. Re-run both at `--repeat 10` before spending anything on the tier.
- [ ] **The baguette / bread-service dedupe bug.** The prompt fix was rejected
      2026-09-22 (worse on both sets, and it merged h15's second helping of
      chips; BUILD_LOG). If retried, do it in code, not prompt wording. Currently masked by the
      bias. Expect h01 to move oddly before it moves right.
- [ ] **Never put eval-set dishes in the prompt.** The first v14 draft named
      pommes aligot, adjaruli khachapuri and the baguette/bread-service pair —
      caught before deploying, but it would have made the re-run meaningless.
      Worth a contamination check in `scripts/`.

### Tier 2 — the schema change that gets costlier the longer it waits

- [ ] **Sugar + fiber together** (Danny confirmed 2026-08-22). Three tables,
      `WANT_NUTRIENTS` in three seeder files that must change as a set, and a
      re-seed measured in tens of minutes. Cheapest while Danny is the only
      person with data. Full scope in QUESTIONS.md.

### Tier 3 — only after the above

- [ ] Close out Phase 4 (follow-up questions — see the recommendation under
      Accuracy work) and start Phase 5.

---

## Accuracy work (started 2026-09-20)

Danny's 2026-09-17 direction, written down so it isn't re-derived later.
**Started 2026-09-20 at his call — the measuring instrument is built and the
first numbers are in.** This is a track, not a phase — it runs alongside
whatever phase is current, and the statement it serves is in `PRODUCT.md` →
Easy → "The bet".

**The goal in one line:** a vague, casual, real-world description — an eleven-item
restaurant dinner, a dish nobody has published nutrition for — comes back right,
measurably and repeatably.

- [x] **The instrument exists** — done 2026-09-20. `evals/meals_hard.jsonl`, 20
      meals covering exactly the case that matters, with **range ground truth**
      because a point would be a fabrication (pommes aligot spans 267-932 kcal
      across published recipes). `evals/meals.jsonl` is untouched and stays the
      frozen regression set, so the 19.8%/14.2% numbers stay comparable. The
      derivation lives in `evals/hard_source.json` — a `[low, high]` band per
      *item* with a `why` beside it — and `build_hard.py` rolls those up into
      the scored file. `run.py` scores either set. **Read `evals/HARD_MEALS.md`
      before touching any of it**; the one convention that decides every number
      is that a sentence with no sharing language means one full portion of
      each named item.

**First results, 2026-09-20.** The set separates pipelines the easy 50 rates as
similar: prototype **67.7%** mean calorie error, Haiku 4.5 **15.1%**, Sonnet 5
**10.2%**. (Same prototype scores 19.8% on the easy set.)

**The finding, and it reorders the levers below: every miss is an undercount.**
27 out-of-band misses across both models, 27 of them low, none high. Both models
estimate restaurant portions as home portions — on the Marcel dinner, Haiku put
the one-pound dry-aged Reserve Burger at 750 kcal against a defensible 2,100,
and every other item on the plate was low too. That is a bias, and a bias is a
prompt problem before it is a model problem.

**The levers, re-ranked by what the run showed:**

- **The prompt, and it is now aimed at something specific.** Restaurant portions
  are not home portions; a named dish served with something (steak tartare and
  its focaccia) includes the something; "bread service" and "baguette" in one
  sentence are one bread. This is the cheap lever and it targets the measured
  bias directly.
- **Model tier — real, but second.** Sonnet 5 cuts mean error by a third for
  2.2x the cost ($0.0058/meal vs $0.0026). It does not fix the bias: Sonnet
  undercounts on 14 of 20 meals too, just by less. Worth revisiting after the
  prompt work, when the remaining error isn't something a sentence could fix.
- **Giving the model the restaurant.** Looking up the actual menu changes the
  architecture and the cost per parse, so it needs the numbers to justify it,
  not enthusiasm. Still unjustified.
- **Follow-up questions would not have helped any of these** and the run says so
  in numbers — every sentence was complete, nobody needed to be asked anything,
  and the gap was knowledge of what a restaurant serves. That is the strongest
  argument yet for PRODUCT.md's refusal to buy accuracy with interrogation.

**Two things that are already helping and should be counted before anything new
is built:** `resolve_food` returns nothing rather than a bad match, and as of
2026-09-17 a corrected food stays corrected — so the meals a person actually
repeats get more accurate without anyone being asked anything.

**Two things this must not become.** Follow-up questions as an accuracy crutch,
and photo input as a substitute for getting the sentence right. Both trade away
the thing Danny says already works.

---

## The design pass (not scheduled)

Also Danny's 2026-09-17 direction, also **not started by his call**. The app is
currently a flat, tidy, template-shaped version of itself, and `PRODUCT.md` has
always said that a flat rounded-rectangle version of this app is a *different
product*. He's now given a much fuller reference set — Graza, the Australian
peanut butter, **Doodle Jump**, and five named currents (analogue/handcrafted,
doodle art, "toasty" logos, elemental folk, illustrative branding). It's written
out in `PRODUCT.md` → The look, which is where design arguments get settled.

What makes this real work rather than a colour swap, and why it keeps getting
deferred: **React Native has no four-value `border-radius`**, so the wobble that
carries the whole look in the prototype's CSS doesn't port. It needs SVG borders
or nine-slice images, plus a real decision about the display typeface on device.
Budget actual time. The existing porting note in `PRODUCT.md` stands.

One constraint worth carrying in from the new references: the imperfection has
to vary, or it reads as a texture rather than a hand — and none of it may cost
legibility of the numbers.

---

## Retention, incentives, and the Duolingo question (not scheduled)

Danny, 2026-09-17: design that draws people in, onboarding that sets them up
properly, **creative incentives**, high retention and daily usage, low churn,
heavy inspiration from **Duolingo**. **Not started.**

The full position — what to take from Duolingo (onboarding that reaches value
fast, a legible daily loop, character and humour, celebration that lands) and
what to refuse (streak guilt, loss-framed notifications, leaderboards, a mascot
that performs disappointment) — is in `PRODUCT.md` → "Getting people in, and
keeping them". Read it before scoping anything here; the refusals are the
product's differentiator, not taste.

Where it already touches the plan:

- **Phase 7** is the nearest scheduled work: notifications with quiet hours,
  cancelled on log, timed to when someone actually eats. That is a retention
  feature already, and it is the one most at risk of drifting into nagging.
- **Onboarding exists** (Phase 3, eight screens) and has never been watched over
  the shoulder of someone who isn't Danny. That observation is worth more than
  any new mechanic and costs nothing but a TestFlight build (Phase 8).
- **Incentives overlap `marketing/MARKETING.md`** — challenges and referrals are
  the same idea seen from two sides. Scope them together.
- **The one hard rule for any mechanic:** it has to work on someone coming back
  after two weeks off. If it needs them to feel bad about the gap, it's out.

---

## Phase 5 — Suggestions

**Goal:** "what should I eat" on real data.

- [ ] Port the macro-shape scoring from `../calorie-tracker/suggest.py`
- [ ] Nine-at-a-time batching, three cards shown, background refill
- [ ] One-tap accept-to-log
- [ ] Skip and reject feedback into `suggestion_feedback`
- [ ] The two guardrails: nothing under ~200 cal left, never suggest past the target

**Done when:** the cards fit the shape of the remaining macros, not just the calories.

---

## Phase 6 — Paywall

**Goal:** it can take money.

- [ ] RevenueCat wired to App Store and Play products
- [ ] Webhook → `subscriptions` table
- [ ] Free tier limits enforced server-side: 5 AI logs/week, 1 suggestion set/day
- [ ] Trial, restore purchases, visible cancel

**Done when:** a test purchase flips the account to paid and unlocks the gated features.

---

## Phase 7 — Health and nudges

**Goal:** it keeps people coming back.

- [ ] HealthKit read: steps and active energy *(needs a physical iPhone)*
- [ ] Activity-adjusted targets
- [ ] Habit model: rolling median log time per meal slot
- [ ] Local notifications with quiet hours, cancelled on log
- [ ] The dinner nudge carries suggestions

**Done when:** the app reminds Danny at the times he actually eats, and stops when
he's already logged.

---

## Phase 8 — Ship

**Goal:** in the App Store.

- [ ] Empty states, offline behaviour, real error copy
- [ ] Hide-calorie-numbers setting, disclaimer, App Review health compliance
- [ ] Icon, screenshots, listing copy
- [ ] TestFlight with a handful of real people
- [ ] Submit
- [ ] Launch content ready to go — see `marketing/MARKETING.md`. The first 90-day
      challenge can't ask anyone to install until this phase is done.

**Done when:** it's live and someone who isn't Danny has installed it.
