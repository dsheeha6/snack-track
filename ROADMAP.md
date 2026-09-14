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
      `authenticated` / `service_role`. **Written and deployed but not yet
      executed**: it needs the `ANTHROPIC_API_KEY` *function secret*, which is
      separate from `.env.local` and is Danny's to set (QUESTIONS.md).
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
- [ ] Fix single-best food resolution before the `food_id` link is trusted —
      prefer `source='usda'` for unbranded queries and return nothing rather
      than a bad guess. Linking a banana to a banana pepper is wrong even when
      the numbers are unaffected.
- [x] **Wire `parse-meal` into the app** — done 2026-09-13 and **driven by hand
      in the running app**, not just bundled. The sentence box is now the first
      thing in the add-food modal per PRODUCT.md ("typing a sentence is the
      fastest path and stays the primary one"); search and the manual form moved
      below it. Type → review what came back → remove anything wrong → one
      button logs the lot as `source='ai'`. Also wired into onboarding's last
      step, so the first thing a new user is shown is the primary interaction.
- [ ] Follow-up questions: high-variance foods only, capped at two
- [ ] Corrections captured into `personal_foods`
- [ ] Token metering into `ai_usage`

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

**Done when:** it's live and someone who isn't Danny has installed it.
