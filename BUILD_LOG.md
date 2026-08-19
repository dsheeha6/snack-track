# Build log

Newest first. One entry per run: what got done, what was verified, what's blocked.
Nothing gets marked done here that wasn't actually run.

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
