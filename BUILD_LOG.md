# Build log

Newest first. One entry per run: what got done, what was verified, what's blocked.
Nothing gets marked done here that wasn't actually run.

---

## 2026-08-19 (night) — Phase 1: real app, real sign-in, real RLS proof

The Expo app exists now and email sign-in genuinely works end to end.

- **Scaffolded `mobile/`**: Expo SDK 57, TypeScript, expo-router, stripped down
  from the tabs template to a single auth-gated screen (sign in → today view).
  Stray template screens/components (`explore.tsx`, `app-tabs.*`, hint cards,
  etc.) removed rather than left dead.
- **Supabase wired up**: `@supabase/supabase-js` + AsyncStorage session
  persistence, config from `mobile/.env.local` (gitignored, `EXPO_PUBLIC_*`
  vars) copied from the root `.env.local`'s public values.
- **Email sign-in built and proved working for real**, not just "code looks
  right": clicked send in the running app, pulled the actual Supabase auth
  email out of Danny's Gmail, decoded the confirmation link, followed it
  through to a live session, and watched the app land on a Today screen
  showing his real profile targets (2200 cal / 165P / 220C / 70F) pulled live
  from Postgres through RLS. Also verified sign-out and that a reload keeps
  the session (AsyncStorage persistence working).
- **Two real bugs found and fixed along the way, both while testing, not left
  for Danny to hit**:
  1. `app.json`'s `web.output: "static"` tried to server-render the Supabase
     client during `expo export`, which touches `window` and crashed under
     Node. Switched to `"single"` (pure client SPA) — this app doesn't need
     static prerendering.
  2. The magic-link redirect landed on expo-router's "Unmatched Route" screen
     instead of the app, because there was no `/auth-callback` route and
     `Linking.getInitialURL()` didn't reliably surface the URL fragment in the
     web SPA. Added an explicit `auth-callback.tsx` route (redirects to `/`
     once the session lands) and read `window.location.hash` directly on web
     instead of trusting Linking's wrapper there.
- **Row level security verified rigorously**: rather than only the UI-level
  "sign in as user B" check, exercised the deployed policies directly via SQL
  with impersonated JWTs for a second user ID and for `anon` — zero rows
  returned from `entries`/`profiles` in every case, including an explicit
  query for the first user's `user_id`. Full method in `docs/supabase.md`.
- **Bundled clean for all three targets**: `expo export` succeeded for web,
  iOS, and Android with no errors (1167–1296 modules each). Ran `tsc --noEmit`
  clean too.
- **Light brand pass**: a `PRODUCT.md` landed mid-session (Danny working in
  parallel — see note below) with the app's actual visual identity. Swapped
  the generic Expo-template blue for the real palette (cream background, paper
  cards, green primary action) in `theme.ts` and the two screens. Did **not**
  attempt the full hand-drawn look (wobble borders, offset shadows, the
  cursive display font) — `PRODUCT.md` itself says that's deferred, real time,
  budget separately.
- **Noticed mid-session**: a commit (`c4f3a3a`, "Add PRODUCT.md...") landed on
  `build` and swept up my in-progress `mobile/` scaffold along with it — Danny
  was evidently working in this repo concurrently. No conflict, just flagging
  it so it's not a surprise reading history later.
- What's **not** verified: actually opening the app on a physical phone via
  Expo Go. I have no device here. Queued for Danny in QUESTIONS.md with exact
  steps. Everything short of that final tap is proven working.
- Found the default Supabase mailer is rate-limited to a couple emails/hour —
  hit it while testing. Not a blocker now, but flagged in `docs/supabase.md`
  as a pre-beta requirement (custom SMTP).

**Next run:** if Danny's answered the phone-test question, read the result and
either fix whatever broke or move the Phase 1 checkbox for real and start
Phase 2 (day view, add/delete entries, food search). If it's still unanswered,
do prep work that doesn't need his phone — e.g. start on the `foods` table
seed script from USDA FoodData Central, which Phase 2 needs regardless.

---

## 2026-08-19 (evening) — Phase 1 unblocked

Both blockers cleared. Nothing is waiting on Danny now.

- **GitHub connected:** https://github.com/dsheeha6/snack-track (private). `main`
  and `build` both pushed. Git Credential Manager already held his login, so
  pushes need no prompt — the daily run can push unattended. Verified only
  `.env.example` is tracked; the Supabase keys stayed out of the repo.
- **Node v24.19.0 / npm 11.17.0 installed**, verified by running both binaries.
- Noted a PATH gotcha: any process started before the install can't see `node`.
  Fall back to the absolute paths under `C:\Program Files\nodejs`.
- Fixed two of my own mistakes from earlier in the session: `QUESTIONS.md` had
  been written in the wrong encoding (mangled em dashes) and a Windows path had
  its backslash-n read as a newline. Both files rewritten cleanly.
- Found that two earlier build-log entries never actually saved. The markdown
  files use CRLF line endings, so Python string replacements anchored on `\n\n`
  matched nothing and silently wrote the file back unchanged. **Use the Edit and
  Write tools for these files, not line-anchored Python replacements.**

**Next run:** start Phase 1 properly — create the Expo project in the repo, wire
up the Supabase client from `.env.local`, and get email sign-in working end to
end. Then verify row level security by signing in as a second test user and
confirming they cannot see the first user's rows. If Expo scaffolding eats the
session, stop once the app runs on device and leave auth for the next run.

---

## 2026-08-19 (afternoon) — Supabase backend live, phases defined

Phase 0 done. There's a real database now.

- Created Supabase project `snack-track` (ref `grltvenoqmzhgkfasvlb`, us-east-1,
  free tier, $0/month).
- Applied the full schema: profiles, target_history, entries, foods,
  personal_foods, weights, suggestion_feedback, subscriptions, ai_usage.
- Row level security enabled on all nine tables with per-user policies. `foods` is
  read-only to signed-in users; `subscriptions` and `ai_usage` are read-only to
  their owner and written only by the server.
- Signup trigger creates a profile and a subscription row automatically.
- Ran the Supabase security advisor. It flagged pg_trgm sitting in the public
  schema and both trigger functions being callable over the REST API. Fixed both —
  moved the extension to `extensions`, revoked EXECUTE from anon and
  authenticated. Advisor now returns clean.
- `db/schema.sql` and `docs/supabase.md` committed. Keys in `.env.local`, which is
  gitignored — confirmed nothing secret is in the commit.
- Rewrote ROADMAP.md as eight phases, each with a goal and a "done when" line, so
  it's obvious what's being worked on at any moment.

---

## 2026-08-19 (morning) — repo set up

Created the project, the roadmap, and this log. No code yet.

- Repo initialised, `build` branch created. Daily work commits there; `main` stays
  clean until Danny merges.
- Roadmap seeded from the Build Facts plan.
- Opening questions queued in QUESTIONS.md — Node, GitHub, Apple.
- The prototype in `../calorie-tracker` put under version control too, so the
  daily agent can't break it without a way back.
