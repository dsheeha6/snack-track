# SNACK TRACK — roadmap

One phase at a time, in order. Each phase has a goal, a short task list, and a
**done when** line. Nothing moves to the next phase until the current one's
"done when" is genuinely true and verified by running it.

**CURRENT PHASE: 2 — Core tracker** — every task in it is built, and as of
2026-08-23 the app has been **signed into and driven by hand**, not just bundled:
Today, Week and search across all 407,086 foods were verified against real data.

Two "done when" checks remain, both Danny's: opening it on a phone (Phase 1) and
using it for a real day instead of the prototype (Phase 2).

**Before anything else next run**, clear the two sign-in bugs Danny hit on
2026-08-23 — they're the first item in `QUESTIONS.md`, with `auth_logs` evidence
that already rules out the obvious cause. Then Phase 3 is the open build work.

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
      web, iOS, and Android — **on-device launch via Expo Go still needs Danny**,
      see QUESTIONS.md
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
- [ ] **Two sign-in bugs open** from Danny's first real use — a session
      restoring without a code being entered, and the 60s resend throttle
      surfacing as a raw error. Both written up with log evidence at the top of
      QUESTIONS.md; first work for the next run.
- [ ] Biometric lock unverified — `expo-local-authentication` reports no
      hardware on web, so the lock screen has never rendered. Needs a device.
- [x] Row level security verified: exercised the deployed policies directly
      with impersonated JWTs for two different user IDs — a second user gets
      zero rows from `entries` and `profiles`, even when explicitly querying by
      the first user's ID. Anon gets zero rows too.

**Done when:** Danny opens the app on his phone, signs in, and lands on an empty
day view backed by the real database.
*(Signing in and landing on the real day view is proven — done on web 2026-08-23
with an emailed code. Only the "on his phone" half is outstanding.)*

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
- [x] Drinks — answered by Danny 2026-08-22 and built to that answer. Water is
      a *hydration* feature, not a calorie one: its own `water_log` table and a
      blue ounces widget on the day view, one tap = 8 oz, editable daily goal
      (default 64 oz). It never touches calorie/macro totals and never appears
      as a row in a meal section. Calorie-bearing drinks, alcohol included, go
      through the normal food flow with no special casing.

**Done when:** Danny can stop using the localhost prototype for a full day without
missing anything.

---

## Phase 3 — Onboarding and targets

**Goal:** a stranger can install it and get correct targets without help.

- [ ] The seven onboarding screens, plus the optional food-preferences screen
- [ ] Mifflin-St Jeor + activity math, with the arithmetic shown to the user
- [ ] Editable targets, written to `target_history`
- [ ] The safety floor: warn under ~1,200 cal, no goal weight below a healthy BMI

**Done when:** a fresh account reaches a personalised target screen and the numbers
match the plan's worked example for Danny's own stats.

---

## Phase 4 — AI logging

**Goal:** the feature the whole product exists for.

- [ ] `evals/meals.jsonl` — 50 real meals with hand-checked numbers
- [ ] `evals/run.py` — accuracy harness; get a baseline from the prototype's
      `parse.py` before writing any Claude call
- [ ] Edge function holding the Anthropic key, never called from the client
- [ ] Structured-output parse → resolve against `foods` → confidence flags
- [ ] Follow-up questions: high-variance foods only, capped at two
- [ ] Corrections captured into `personal_foods`
- [ ] Token metering into `ai_usage`

**Done when:** the harness reports the Claude pipeline beating the prototype's
baseline on the 50-meal set, and Danny can log a day by typing sentences.

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
