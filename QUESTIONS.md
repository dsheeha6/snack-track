# Questions for Danny

The build agent writes here when it hits something only you can decide or only you
can do. Answer inline under each one — plain text is fine. The next run picks up
answers, acts on them, and moves the item to ANSWERED.

---

## OPEN

### Two calls on the restaurant data (2026-09-21)
1. ~~CAVA PDF~~ answered 2026-09-21: yes, downloaded and parsed.
2. **Most chains come via Nutritionix's public pages.** The numbers match the
   chains' own feeds exactly, but Nutritionix sells this as an API, and its
   terms likely don't allow scraping for a commercial app. Fine for building and
   testing. Before launch it's your call: license it, or replace each chain with
   its own site as the Chipotle/McDonald's/Chick-fil-A fetchers do.

**Danny (2026-09-28):** figure out how MyFitnessPal, Cal AI and the rest get
their data; look at the legality and other ways to get and keep it.

**Answer:** `docs/food-data-sourcing.md`. Short version: nutrition facts
aren't copyrightable, and chains with 20+ locations are required by the FDA to
publish them, so the chains' own pages are free and clean. The risk with
Nutritionix is its terms of service, not copyright. Recommendation: before
launch, rewrite the 57 Nutritionix chains as per-chain fetchers (same numbers),
record `source_url` + `fetched_at`, and grow our own verified data through
label scanning. FatSecret's free tier is the legal fallback for the long tail.
**Left for you:** OK to start the per-chain rewrite (it's the next data job
after accuracy), and a one-hour lawyer consult before Phase 8.

### One dashboard toggle: leaked-password protection (30 seconds, yours to click)
The Supabase security advisor is clean except for this one, and it's been there
since email+password sign-in went in: **Authentication → Policies → "Leaked
password protection"** is off. On, it checks a new password against
HaveIBeenPwned so nobody signs up with a password that's already in a breach
dump. No code, no migration, no downside — it only ever rejects passwords that
are already public.

Not urgent while the only accounts are yours and mine, genuinely worth having
before anyone else installs it (Phase 8).

**Update 2026-09-20:** this is now the *only* security advisor finding and the
last open item in Tier 0 of the backend-first plan (ROADMAP → Backend first).
Everything else in that tier is done and verified. Flip this and the backend is
clean.

**Danny (2026-09-28):** turning it on. **Still reported off by the advisor at
02:14 UTC 09-29**, so check the toggle actually saved (it sits behind a Save
button, and on some plans it needs Pro; if the switch is greyed out, that's why,
and it can wait for launch). A new advisor finding the same night,
`rls_auto_enable()` exposed over RPC, was Supabase's own event trigger and is
fixed (migration `revoke_rls_auto_enable_execute`).

**Danny:**

---

## ANSWERED

### Goal-based nutrient tracking — built 2026-09-28
Danny: presets per goal (cut, bulk, recomp, maintain) showing what matters for
that goal, plus the option to add or drop anything. Built: `lib/nutrients.ts`
and the "choose what you track" sheet on Today. Cut = calories, protein, fiber;
Bulk = calories, protein, carbs; Recomp = calories plus the three macros;
Maintain (also "Just curious") = the three macros plus fiber. Sugar is opt-in
everywhere. Fiber defaults to 14 g per 1,000 kcal and sugar to 10% of calories,
and both can be edited. Stored in `profiles.food_preferences.nutrients`, so no
migration. Onboarding's numbers screen says what the goal will show.

### Deploy the leak-free prompt (v24)? — yes, deployed 2026-09-25
Live as parse-meal v24. Live check: easy 9.7% (v23 9.9%), chains exact,
item names 0.0%.

### Three easy-set answers — fixed 2026-09-25
Danny: "yes fix those three answers". m47 beans 227 -> 114, m14 half avocado
240 -> 160, m49 hot dog 150 -> 270 (bun added). Notes on each line in
meals.jsonl.

### m28 egg whites: fixed 2026-09-22
Danny: fix it. It uses the literal reading, twelve whites = 204 kcal. See BUILD_LOG.

### ANTHROPIC_API_KEY secret — set, and Phase 4 ran on it
Danny set it the same day this was written (2026-09-13). It was listed as OPEN
here until 2026-09-14 purely because nobody moved it: the eval had already run on
that secret and reported Haiku beating the baseline (14.2% vs 19.8%), and the app
had logged a real meal through the deployed function. Nothing was ever blocked.

Worth keeping from it: the secret is a **function** secret, separate from
`.env.local`, set at Project Settings -> Edge Functions -> Secrets. If it ever
goes missing the function says so in plain English rather than 500ing, and it
lists the visible env names — which is how the "saved as Snack-Track" mixup got
diagnosed in one call.

### Anthropic API key — done 2026-09-13, and the model is Haiku
Danny pasted a key into `.env.local` and chose the model himself: *"i would like
to use haiku"* → `claude-haiku-4-5`. Sanity-checked without printing it: it's a
standard `sk-ant-api...` key, not an `sk-ant-admin...` one (admin keys are for
org management and are rejected by the Messages API), and it has no stray quotes.

**He saved it as UTF-16 again** — the same trap as the `service_role` key on
2026-08-22, and it cost the first ten minutes of this session. Converted back to
UTF-8 and, this time, fixed the cause: `load_env_local()` in `evals/run.py`
sniffs the BOM and decodes UTF-16 or `utf-8-sig` as needed. **The two seeders in
`scripts/` still have the old brittle copy** — worth porting the same three lines
over next time either one is touched.

On the model choice: Haiku 4.5 is $1/$5 per MTok against Opus 5's $5/$25, which
at a ~1k-in/300-out parse is about **$0.0025 a meal** — roughly $0.38/month at
Danny's ~5 meals a day, and ~$0.13 for a full 50-meal eval run. `--model` on the
harness swaps the tier, so if Haiku doesn't clear the 19.8% baseline, testing
Sonnet 5 costs a quarter and changes one string in the function.

### Build order — features first, auth last (answered 2026-08-24)
Danny's direction, in his words: *"I want to build out main function, design,
features before the adding the google authen and the other stuff."*

So the working order is the roadmap's own order — **Phase 3 onboarding/targets,
then Phase 4 AI logging, then Phase 5 suggestions** — and everything in the
auth/accounts bucket waits until late in the build:

- Google sign-in (his call: "towards end of build")
- Apple sign-in and the $99 developer membership
- The Supabase redirect-URL allowlist, which only those two need
- Phone/SMS login (declined — recurring Twilio cost for no gain over the email
  code) and Notion login (declined)

Nothing in Phases 3-5 is blocked by any of it. The email code, email+password,
and biometric unlock already work, which is all the app needs to be used.

### Phone test — running on the Android emulator 2026-08-24; iPhone deferred by choice
Danny: *"ive got it on the emulator i dont want to pay for the iphone rn."*

So the Android route worked, and the $99 Apple Developer membership is **not**
being bought right now. What that settles and what it doesn't:

- **Settled:** the app runs on a real Android runtime, not just a web bundle.
  Phase 1's "opens on his phone" is close enough to done to stop blocking on it.
- **Still unverified:** the biometric lock. `expo-local-authentication` reports
  no hardware on web, so that screen has still never rendered — unless Danny
  enrolled a fingerprint in the emulator (Extended controls → Fingerprint), it
  is untested. Worth one check next time he's in there.
- **Consequence of no Apple membership:** no iPhone install, no Sign in with
  Apple, and no TestFlight, until that changes. None of it blocks Phases 3-5.
  It becomes load-bearing again at Phase 8 (Ship), which cannot happen without it.

Keep for reference, because it will come up again: **do not install Expo Go from
the App Store or Play Store.** Apple stopped approving new Expo Go releases and
both stores top out at Expo Go 54; this project is SDK 57, and Expo Go only runs
its own matching SDK. The route that works on Android is the dev server + `a`,
which installs the SDK-matched client over adb (`adb` at
`%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`); if that doesn't replace the
older client, sideload
`https://github.com/expo/expo-go-releases/releases/download/Expo-Go-57.0.9/Expo-Go-57.0.9.apk`
and `adb install -r`. Also: in PowerShell, use **`npx.cmd`** / **`npm.cmd`** —
plain `npx` hits "running scripts is disabled on this system". Do not change the
execution policy to work around it.

### Sign-in bug: "logged in before I put in the code" — closed 2026-08-24
Danny: *"no longer an issue."* Closed without a root-cause answer, which is
acceptable here because the two defensive fixes that landed on 2026-08-23 were
built to make it structurally impossible either way:

- `signOut()` uses Supabase's global scope explicitly, so a stale tab can't keep
  working or hand a refreshed token back.
- The sign-in screen is authoritative: a session arriving in a tab that never
  asked for one, while that tab believes it's signed out, is treated as stale
  litter and signed out again.

The leading theory was always agent litter — a signed-in preview tab the agent
left open on `localhost:8081`, whose token-refresh timer rewrote the shared
`localStorage` session. His answer is consistent with that. If it ever recurs,
reopen this: it would mean a third cause exists.

**Still worth doing eventually, and now filed under the auth work:** drop
`{{ .ConfirmationURL }}` from the Magic Link template. The app asks for a code;
a live one-tap link in the same email is a second, untested way in.

### Redirect URLs — I can't reach this one, and it's parked with the auth work
Danny asked: *"cant you do that?"* Straight answer: **no, not with anything I
have.** Checked rather than assumed:

- The Supabase MCP server exposes database and project tools (`execute_sql`,
  `apply_migration`, `get_advisors`, logs, branches…) and **no auth-config
  endpoint at all**. The allowlist isn't reachable from it.
- The `service_role` key is a database credential. GoTrue's URI allow-list is
  platform config, not a table, so no SQL can set it either.

Two ways it *could* happen if it ever becomes urgent:

1. **A Supabase personal access token** (`sbp_…`) from
   https://supabase.com/dashboard/account/tokens, dropped into `.env.local`.
   The Management API can then set it in one call:
   `PATCH /v1/projects/grltvenoqmzhgkfasvlb/config/auth` with `uri_allow_list`.
   That token is full account access, so it's a real decision, not a shortcut.
2. **Driving the dashboard in his logged-in Chrome**, which needs him present
   and needs him to say go — it's an account settings change.

Either way it's ~30 seconds of clicking for him versus setup for me, and **it is
not blocking anything**: the email-code flow needs no redirect and is proven end
to end. It's needed only for the password-signup confirmation link, Google/Apple,
and any magic link already sitting in an inbox. It moves when Google does. The
values, when that day comes:

```
snacktrack://**
exp://**
http://localhost:8081/**
http://localhost:19006/**
```

(The `**` wildcards matter — Expo Go's URL contains the LAN IP and port, which
change between networks.) Evidence it's actually needed, from 2026-08-23: asking
Supabase's admin API for links with five different redirects showed it does not
error on a non-allowlisted URL — it silently swaps in the Site URL
(`http://localhost:3000`), which is why sign-in once looked "verified end to end"
with a redirect that never worked.

### Social sign-in — Google at the end of the build, everything else declined
Danny: *"ill do google sign in towards end of build."* Filed accordingly.

- **Google** — free, ~10 minutes of his time when the day comes: an OAuth client
  at https://console.cloud.google.com/apis/credentials (type "Web application"),
  client ID + secret into Supabase's Google provider, and I wire the app side.
  The redirect URLs above have to go in first, since OAuth uses them.
- **Apple** — $99/yr, and probably not optional once Google ships (App Store
  guideline 4.8 wants an equivalent privacy-preserving login alongside any social
  login; our passwordless email code may satisfy it, but Sign in with Apple is
  the answer nobody gets rejected for). Deferred with the membership.
- **Phone / SMS** — declined. Supabase doesn't send SMS; it means Twilio and a
  per-message cost forever, including failed and re-sent codes, to do what the
  email code already does free.
- **Notion** — declined. Workplace identity; nobody reaches for their Notion
  login to record a burrito.

### Sign-in email code — done 2026-08-23, verified end to end
Danny added `<p>Your SNACK TRACK code is: <strong>{{ .Token }}</strong></p>` to
the **Magic Link** template and configured Gmail SMTP. Proven working: a code was
requested in the real app, delivered from his Gmail, read back out of his inbox,
typed in, and it signed in and landed on Today with real targets.

Editing the template **did** require custom SMTP first — the dashboard gates the
Source editor behind it, whatever the docs imply. I initially told him it didn't;
he was right. Gmail SMTP needs no domain and no new address:

| Field | Value |
|---|---|
| **Host** | `smtp.gmail.com` — **the only field that is not his email address** |
| Port | `587` |
| Username / Sender email | `daniel.sheehan03@gmail.com` |
| Password | 16-character App Password (needs 2-Step Verification on) |
| Sender name | `SNACK TRACK` |

**Three things worth keeping, because they will recur:**

1. **The email address went into the Host field**, so GoTrue dialled a mail
   server named `daniel.sheehan03@gmail.com` and every send 500'd. The client
   message — "Error sending magic link email" — is useless. `auth_logs` had the
   real cause: `dial tcp: lookup ...: no such host`. **Diagnose email failures
   from `auth_logs`, never from the client error.**
2. **Tell that custom SMTP is actually live:** `auth_logs` prints
   `updating Email limiter from 2/1h to 30` on config reload. `2/1h` means the
   built-in mailer is still in charge.
3. **This project's OTP is 8 digits, not Supabase's default 6** (e.g.
   `18027152`). The app had `6` hardcoded and would have silently truncated
   valid codes; it now accepts 6–10.

Gmail is a testing answer, not a shipping one — it sends from Danny's personal
address. A real sender domain on Resend or SES is the pre-launch upgrade, and
that is when the domain question actually arrives. Rate limit is now 30/hour,
and codes expire after an hour with one send per address per 60s.

### Drinks tracking — answered 2026-08-22, built 2026-08-23
**Built exactly as specced below**, including every one of the "defaults to
assume" — 8 oz per tap, 64 oz default goal (editable, not computed from
bodyweight), caloric drinks excluded from the water total, and a `water_log`
table with RLS matching `entries` (verified with impersonated JWTs; security
advisor clean). The one addition beyond the spec: the daily goal is editable
from the widget's `custom` sheet, because Phase 3's settings screen doesn't
exist yet and "editable" needed somewhere to live. Details in BUILD_LOG.

Danny's call, in his words and then what it means to build:

**Water is tracked, and it's a hydration feature, not a calorie feature.** One
simple button to add water. The point is helping people stay consistent with
drinking it — "there are a lot of people that are technically dehydrated." So it
does not touch calorie or macro targets. Build it as its own thing, not as a
0-calorie row in a meal section: a water row cluttering the food list fights
PRODUCT.md's whole positioning.

**A water / ounces widget** on the day screen so they can see where they are.

**Calorie-bearing drinks go through the normal food flow** — same `entries` row,
same meal group as food, no special casing. Alcohol included; it's just calories.
This is the "keep it simple" answer to the original question.

**Longer-term, and explicitly not Phase 2:** track more than four macros — sugar,
and others — and have onboarding ask the user's goals, then recommend or show only
the ones that matter for that goal. See the new OPEN item below; do not start this
inside Phase 2.

Defaults to assume unless Danny says otherwise (he said "we can figure out" the
button, so don't block on these — build the obvious version and he'll correct it):

- One tap = **8 oz**, stored in ounces. Long-press or a secondary control for a
  custom amount.
- Default daily target **64 oz**, editable. Don't compute it from bodyweight —
  the formulas disagree with each other and it isn't worth a settings argument.
- Caloric drinks do **not** count toward the water total in v1. Only explicit
  water taps do. Revisit if it feels wrong in use.
- New `water_log` table (user_id, logged_on date, ounces), RLS matching `entries`.
  Run the security advisor after, per the rules above.

### Supabase service_role key — done 2026-08-22
Danny pasted it into `.env.local`. `scripts/seed_foods_usda.py` has been run:
7,793 USDA SR Legacy foods loaded, the 800 test rows cleared. Verified directly
against the database — `select source, count(*) from public.foods` returns a
single `usda` group of 7,793, every row with calorie data, and a sample search
for "chicken breast" returns sensible names with full macros. Security advisor
run afterward: no RLS findings (only `auth_leaked_password_protection`, which
doesn't apply — this app is passwordless magic-link only).

Gotcha for future runs: he saved `.env.local` as **UTF-16** (Notepad/PowerShell
default), which made `load_env_local()` crash with
`UnicodeDecodeError: 0xff in position 0` because it reads with `encoding="utf-8"`.
Converted the file back to UTF-8 and it ran clean. If a `.env.local` read ever
fails that way again, check the BOM before assuming the key is missing — and
consider making `load_env_local()` tolerate a UTF-16 BOM, since Danny will hit
this again the next time he pastes a key into it.

### Node.js installed — done 2026-08-19
Node v24.19.0, npm 11.17.0, installed at `C:\Program Files\nodejs`.

Gotcha for automated runs: any process started *before* the install has a stale
PATH and won't see `node`. If `node --version` fails in a session, call the
binaries by absolute path instead — `"C:\Program Files\nodejs\node.exe"` and
`"C:\Program Files\nodejs\npm.cmd"` — or restart the app so it picks up the PATH.

### GitHub connected — done 2026-08-19
Repo: https://github.com/dsheeha6/snack-track (private).
Remote is set over HTTPS, and Git Credential Manager already holds Danny's GitHub
login, so pushes need no prompt and can run unattended. `main` and `build` are
both pushed.

A dedicated SSH key was generated at `~/.ssh/id_ed25519_snacktrack` as a backup
route. It is NOT registered on GitHub and isn't needed while HTTPS works. If
pushes ever start failing on auth, add that key's `.pub` contents at
https://github.com/settings/keys and switch the remote back to
`git@github.com:dsheeha6/snack-track.git`.

### Create a Supabase backend — done 2026-08-19
Project `snack-track` created on the free tier ($0/month), region us-east-1.
Full schema applied with row level security on every table; security advisor clean.
Details in `docs/supabase.md`, DDL in `db/schema.sql`, keys in `.env.local`
(gitignored). Dashboard: https://supabase.com/dashboard/project/grltvenoqmzhgkfasvlb

Apple and Google sign-in still need turning on in the Supabase dashboard, but that
waits on the developer accounts — email sign-in works without them.
