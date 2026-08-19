# SNACK TRACK — roadmap

One phase at a time, in order. Each phase has a goal, a short task list, and a
**done when** line. Nothing moves to the next phase until the current one's
"done when" is genuinely true and verified by running it.

**CURRENT PHASE: 1 — Foundation**

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
- [x] Row level security verified: exercised the deployed policies directly
      with impersonated JWTs for two different user IDs — a second user gets
      zero rows from `entries` and `profiles`, even when explicitly querying by
      the first user's ID. Anon gets zero rows too.

**Done when:** Danny opens the app on his phone, signs in with an email link, and
lands on an empty day view backed by the real database.

---

## Phase 2 — Core tracker

**Goal:** everything the prototype does, but multi-user and on a phone.

- [ ] Day view: calories, macro bars, meals
- [ ] Add and delete entries
- [ ] Food search against the `foods` table
- [ ] Seed `foods` from USDA FoodData Central
- [ ] Week view and streaks
- [ ] Drinks: water, coffee, alcohol

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
