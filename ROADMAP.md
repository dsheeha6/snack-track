# SNACK TRACK — build roadmap

The work queue for the daily build agent. Ordered. Check things off as they land,
and never mark something done that hasn't been run and verified.

Plan this comes from: https://claude.ai/code/artifact/098c2efa-faa4-4f9c-a5e4-d4783dc9b4c9
Working prototype (keep it running, it's the eval harness): `../calorie-tracker`

---

## Phase 0 — groundwork that needs no Node, no accounts

- [ ] **Accuracy test set.** 50 real meals phrased the way Danny actually types them,
      in `evals/meals.jsonl`, each with hand-checked calories and macros.
- [ ] **Eval harness.** `evals/run.py` — runs a parser over the test set, reports
      % within 10% on calories and each macro, and prints the worst misses.
      Must run against the existing `../calorie-tracker/parse.py` first, so there's
      a baseline number before any Claude call exists.
- [ ] **Prompt draft.** `docs/parse-prompt.md` — the system prompt and JSON schema
      for the real parse endpoint. Include the high-variance food rule and the
      two-question cap.
- [ ] **Database schema.** `db/schema.sql` — users, profiles, goals, entries,
      foods, personal_food_library, suggestions_feedback, subscriptions.
      Row-level security policies included, every table.
- [ ] **API contract.** `docs/api.md` — every endpoint the app will call, with
      request and response shapes. The prototype's `/api/parse` and `/api/suggest`
      responses are the starting point; keep them stable.
- [ ] **Screen inventory.** `docs/screens.md` — every screen, what's on it, what it
      calls. Onboarding (8), day view, week view, suggestions, paywall, settings.

## Phase 1 — foundation (blocked on Node + Supabase account)

- [ ] Expo app skeleton, runs on device
- [ ] Supabase project, schema applied, RLS verified with a second test user
- [ ] Auth: Sign in with Apple + Google + email fallback

## Phase 2 — core tracker

- [ ] Day view: rings, macro bars, meal sections
- [ ] Quick add + food search against the local DB
- [ ] Week view and streaks
- [ ] Drinks: water, coffee, alcohol

## Phase 3 — onboarding and targets

- [ ] The 7 screens + optional preferences screen
- [ ] Mifflin-St Jeor + activity math, with the arithmetic shown to the user
- [ ] Editable targets

## Phase 4 — AI logging

- [ ] Edge function holding the Claude key (never called from the client)
- [ ] Structured output parse → resolver against food DB → confidence flags
- [ ] Follow-up questions, capped at two, high-variance foods only
- [ ] Correction capture → personal food library

## Phase 5 — suggestions

- [ ] Preferences, card deck, nine-at-a-time batching
- [ ] Accept-to-log in one tap
- [ ] Skip/reject learning loop

## Phase 6 — paywall

- [ ] RevenueCat, entitlements via webhook, trial, restore
- [ ] Web checkout via Stripe

## Phase 7 — health + nudges

- [ ] HealthKit read (needs a physical iPhone)
- [ ] Habit model: rolling median log time per meal slot
- [ ] Local notifications, quiet hours, cancel-on-log

## Phase 8 — ship

- [ ] Empty states, offline behaviour, error copy
- [ ] The safety guardrails: calorie floor, hide-numbers setting, disclaimer
- [ ] TestFlight, then App Store review
