# Supabase

**Project:** `snack-track` — ref `grltvenoqmzhgkfasvlb`, region us-east-1, free tier ($0/mo)
**API URL:** https://grltvenoqmzhgkfasvlb.supabase.co
**Dashboard:** https://supabase.com/dashboard/project/grltvenoqmzhgkfasvlb

Keys live in `.env.local`, which is gitignored. The publishable key is safe in the
app bundle. The service_role key is not — it bypasses row level security, so it
belongs only in server-side code (edge functions) and never in the client.

## What's in the database

| Table | Holds |
|---|---|
| `profiles` | One row per user: stats, goal, current targets, preferences |
| `target_history` | Every target change, for adaptive TDEE |
| `entries` | The food log |
| `foods` | Shared food database (USDA / Open Food Facts) — read-only to clients |
| `personal_foods` | Each person's own phrases and their resolved numbers |
| `weights` | Daily weigh-ins for the trend line |
| `suggestion_feedback` | Shown / skipped / rejected / logged, so suggestions learn |
| `subscriptions` | Entitlements, written by the RevenueCat webhook only |
| `ai_usage` | Per-call token metering |

Full DDL: `db/schema.sql`.

## Security posture

Row level security is on for every table. A signed-in user reaches their own rows
and nothing else; `foods` is readable by any signed-in user and writable by none.
`subscriptions` and `ai_usage` are read-only to their owner — the server writes them.

A new signup automatically gets a `profiles` row and a `subscriptions` row via the
`on_auth_user_created` trigger.

The security advisor is clean as of 2026-08-19. Re-run it after any schema change —
it catches missing RLS policies, which is the failure that leaks other people's data.

## Still to do

- Turn on Apple and Google auth providers in the dashboard (needs Danny's developer accounts)
- Seed `foods` from USDA FoodData Central
- Custom SMTP before any real onboarding testing. The default Supabase mailer
  (`mail.app.supabase.io`) is rate-limited to a couple of emails per hour — hit
  it during Phase 1 testing. Fine for solo dev testing, not fine once more than
  one or two people are signing up. Needs a provider (Resend/Postmark/etc.) and
  an API key from Danny — queue in QUESTIONS.md when it's time.
- Advisor also flags leaked-password protection as disabled — not applicable
  today (the app only uses passwordless email OTP, no passwords exist to leak),
  but worth a look if password auth ever gets added.

## RLS verification (2026-08-19)

Row level security was exercised directly against the deployed policies by
impersonating two different signed-in users via `set local role authenticated;
set local request.jwt.claims to '{"sub":"<uuid>","role":"authenticated"}'` in a
SQL session, plus a plain `set local role anon` for the unauthenticated case.
Results: a second user reading `entries` or `profiles` gets zero rows — even
when explicitly filtering by the first user's `user_id` — and `anon` gets zero
rows too. This is a stronger test than a UI-level "sign in as user B and look
around" because it directly proves the policy predicate holds for arbitrary
user IDs, not just the two test accounts used.
