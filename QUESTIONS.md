# Questions for Danny

The build agent writes here when it hits something only you can decide or only you
can do. Answer inline under each one — plain text is fine. The next run picks up
answers, acts on them, and moves the item to ANSWERED.

---

## OPEN

### 🐞 Sign-in bugs Danny hit 2026-08-23 — one fixed, one needs your answer

#### 2. "Wait 19 seconds" reads like a failure — FIXED 2026-08-23
Built exactly as specced: the "Send me a code" button and the "Resend code"
link both disable for 60s after a send and show a live countdown ("Resend in
43s") instead of staying enabled and erroring. If a 429 gets through anyway
(e.g. the local timer was lost on a reload), the app now parses the wait out
of Supabase's message and shows "One code a minute. Try again in Ns." instead
of the raw wording. `tsc --noEmit` and `expo export --platform web` both
clean. **Not eyeballed** — this is an unattended run and the harness won't
start a dev server without someone present, so the countdown ticking down and
the button re-enabling at zero have not been watched happen, only traced
through the code. Worth a look next time someone's driving the app by hand.

#### 1. Signed in without entering the code — CAUSE NARROWED, NEEDS ONE ANSWER
**Two defensive fixes went in regardless of your answer, since they cost
little either way** (see BUILD_LOG for the full reasoning):
- `signOut()` now uses Supabase's global scope explicitly, which revokes the
  session everywhere, not just in the tab that clicked it — so a stale tab
  can no longer keep working, or refresh a token and hand it back to this one.
- The sign-in screen is now authoritative: if a session shows up in a tab
  that never asked for one (no code just verified, no password just
  submitted, no magic-link/OAuth redirect just handled) while that tab
  believes it's signed out, it's treated as stale litter and signed out again
  immediately rather than accepted. A normal app reopen restoring your last
  real session is unaffected — only sessions that arrive *while already on
  the sign-in screen* get this scrutiny.

These two together should make the bug you hit structurally impossible going
forward, regardless of which of the two causes below it turns out to have
been. But the causal question below is still open and still worth answering,
because it tells us whether there's a *third* thing to find.
Danny: *"i can click the login with email and get the code but then when i got
back i was logged in before i put in the code."*

What `auth_logs` actually shows around it:

| time | event |
|---|---|
| 03:29:01 | `Login`, `login_method: otp` — the agent's test sign-in |
| 03:34:46 | `/logout` 204 — Danny signs out |
| 03:35:00 | `/otp` 200 — Danny requests a code |
| 03:35:40 | `/otp` 429 — "only request this after 19 seconds" |

**There is no `Login` event and no successful `/verify` after 03:29:01.** That
rules out the intuitive explanation — he did *not* get signed in by tapping the
"Sign in" link still present in the email template, because that path always
writes a `/verify` + `Login` pair and neither exists.

So no new authentication happened. The app restored a session that was already
in the browser. Leading theory: **the agent left a signed-in preview tab open on
`localhost:8081`.** supabase-js refreshes its token on a timer and persists to
`localStorage`, which tabs share, so that tab could rewrite the session moments
after Danny's `signOut()` cleared it — and his tab reads it back on focus.

**Danny — one question, this decides whether it's a real bug or agent litter:**
were you in the same browser where the agent's preview tab was open, and was
that tab still open? If yes, it's almost certainly the stale-tab artifact. If
no — you used a different browser or a fresh window — then it's a genuine
session-restore bug and worth digging into further even though the two fixes
above should already prevent it from recurring.

**Still queued, not done (a Supabase dashboard setting, not code):** consider
dropping `{{ .ConfirmationURL }}` from the Magic Link template entirely. The
app asks for a code now; leaving a live one-tap link in the same email is a
second, untested way in that nobody needs, and it muddies exactly this kind
of diagnosis.

**Danny:**

### Add the app's redirect URLs in Supabase — still needed, but no longer the top blocker
**Downgraded 2026-08-23, and that still stands.** The code flow is now the
default sign-in and needs no redirect at all — it's been proven working end to
end, so nothing is blocked on this. Redirect URLs are still required for three
things: the email+password signup confirmation link, Google and Apple sign-in
when those land, and any magic link already sitting in an inbox.

(The paragraph below was written when magic links *were* the only way in and
called this the top item. Keeping the evidence, dropping the urgency.)

On 2026-08-23 I stopped guessing and tested it: I
asked Supabase's admin API for a sign-in link with five different redirect URLs
and checked which ones came back intact. Only one does.

| redirect the app asks for | what Supabase actually returns |
|---|---|
| `http://localhost:8081/auth-callback` (web) | ❌ replaced with `localhost:3000` |
| `snacktrack://auth-callback` (the installed app) | ❌ replaced with `localhost:3000` |
| `exp://…/--/auth-callback` (Expo Go) | ❌ replaced with `localhost:3000` |
| `http://localhost:3000` (untouched default) | ✅ kept |

Supabase does **not** error on a redirect URL that isn't allowlisted — it
silently swaps in the Site URL. That's why this slipped through when sign-in was
called "verified end to end": the session was real, the redirect was not. So
when you tap the magic link on your phone, it will send you to
`http://localhost:3000`, which is nothing, and you'll never land back in the app.

**Fix:** open
https://supabase.com/dashboard/project/grltvenoqmzhgkfasvlb/auth/url-configuration
and add these four under **Redirect URLs**:

```
snacktrack://**
exp://**
http://localhost:8081/**
http://localhost:19006/**
```

(The `**` wildcards matter — Expo Go's URL contains your laptop's LAN IP and
port, which change between networks. `19006` is Expo's web port when 8081 is
busy.) Leave Site URL alone; it's only the fallback.

I can't do this one — it's a dashboard auth setting, and neither the Supabase MCP
tools nor the service_role key can reach it. **No longer blocking anything:** the
code flow made sign-in work without a redirect, and Today, Week and search were
verified against real data on 2026-08-23.

**Danny:**

### Try the app on your phone
Phase 1's real app exists now (`mobile/`) and everything I can verify without a
device checks out: it bundles clean for iOS/Android/web, sign-in works end to end
(proved 2026-08-23 by requesting a code in the real UI, reading it out of your
Gmail, and signing in), Today/Week/search were driven by hand against real data,
and row-level security is locked down. **The one thing only you can do is open it
on an actual phone** — and the biometric lock in particular is still unverified,
because `expo-local-authentication` reports no hardware on web, so that screen
has never rendered.

**Do not tell Danny to install Expo Go from the App Store or Play Store. It does
not work and it cannot work.** Corrected 2026-08-22 after he tried it and hit
"Project is incompatible with this version of Expo Go" on a real device.

Apple stopped approving new Expo Go releases; per Expo's own changelog the SDK 55
build was still stuck in review as of May 2026, and both stores top out at **Expo
Go 54**. This project is **SDK 57**, and Expo Go only ever runs its own matching
SDK. Verified directly: the emulator on this machine had `host.exp.exponent`
versionName 54.0.8 installed from the Play Store, against an SDK 57 project.
https://expo.dev/changelog/expo-go-and-app-store-may-2026

The two routes that actually work:

**Android (free, and already set up on this machine).** Danny installed Android
Studio on 2026-08-22 and has an emulator running — `adb` lives at
`%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`. Start the dev server, press
`a`, and Expo CLI installs the SDK-matched Expo Go over adb, bypassing the store
entirely. If it doesn't replace the older client, sideload it by hand:
`https://github.com/expo/expo-go-releases/releases/download/Expo-Go-57.0.9/Expo-Go-57.0.9.apk`
(199 MB), then `adb install -r`. Note the URL — the one linked from expo.dev/go
is missing the `expo/` owner segment and 404s.

**iPhone (costs $99/yr).** `npx eas-cli@latest go` builds a personalized Expo Go
and delivers it through TestFlight, which requires an Apple Developer Program
membership. That makes the "when?" question below load-bearing rather than
optional — on iOS it is the only way to see this app on a real device.

Also note: in PowerShell, plain `npx` fails with "running scripts is disabled on
this system" because every execution-policy scope on this machine is Undefined,
so it defaults to Restricted and blocks `npx.ps1`. Use **`npx.cmd`** and
**`npm.cmd`**. Do not change the execution policy to work around this.

Whichever route, the check is the same: sign in with email, tap the link when it
lands, confirm you land on a "Today" screen showing calories and macro targets
(2200 / 165P / 220C / 70F — the schema defaults, real numbers from your database).

**Do the redirect-URL item above first.** That paragraph used to be a guess
("if the tap doesn't redirect back, it's *probably* the allowlist"). As of
2026-08-23 it's confirmed: the allowlist is at its default and every redirect
this app uses gets silently swapped for `localhost:3000`. The magic-link tap
*will* dead-end until those four URLs are added. Everything else about the phone
routes below is unchanged.

**Danny:**

### Goal-based nutrient tracking — scope it into its own phase, don't sneak it into 2
From Danny's drinks answer: track more than the four macros (he named sugar), and
have onboarding ask the user's goals, then recommend or show only what's relevant
to that goal. This is a good idea and it is not a Phase 2 task — Phase 2 is half
done and this would swallow it whole. Put it in the roadmap as its own phase.

Two things worth knowing before anyone plans it:

**The profile side is mostly already modeled.** `profiles` already has `goal`
(goal_type), `onboarded_at`, `hide_calorie_numbers`, and `food_preferences jsonb`.
Which nutrients a user sees can live in `food_preferences` with no migration at
all — so the "ask your goals, show what matters" idea is largely a UI and
onboarding job, not a schema job.

**The nutrient side is a real migration.** Sugar would need a column on three
tables — `entries`, `foods`, `personal_foods` — plus a re-seed, because the
seeders only pull four USDA nutrient IDs today (1008 calories, 1003 protein,
1004 fat, 1005 carbs). Total sugars is 2000 and fiber is 1079.

**This got bigger on 2026-08-23**, when ~399k branded foods were loaded. The
re-seed is now three steps, not one, and `WANT_NUTRIENTS` appears in *three*
files that must be changed together:
`scripts/seed_foods_usda.py`, `scripts/stage_branded.py`, and the selection in
`scripts/seed_foods_branded.py`. Re-staging the branded dataset means
re-parsing its 1.5GB `food_nutrient.csv` (~10 min) and re-uploading ~399k rows
(~20 min) on top of the cheap 7,793-row SR Legacy re-seed. Still entirely
automated — just budget the time, and don't do it twice, which is exactly why
sugar and fiber go in together.

**Danny confirmed fiber on 2026-08-22:** add **sugar and fiber together**, not
sugar alone. One migration and one re-seed instead of two. So when this phase
starts, `entries`, `foods`, and `personal_foods` each get a `sugar` and a `fiber`
column, and `WANT_NUTRIENTS` in the seeder gains `"2000": "sugar"` and
`"1079": "fiber"` before the re-seed.

The rest of this item — which nutrients each goal surfaces, and the onboarding
flow that asks — is still unscoped and still Danny's call.

**Danny:**

### Social sign-in: Google needs 10 minutes from you, Apple needs $99
From Danny's 2026-08-23 ask for Google / Apple / phone logins. Email code,
email+password, and biometric unlock are all built. The rest split by what they
cost you:

**Google** — free, but I can't create it: you make an OAuth client at
https://console.cloud.google.com/apis/credentials (type "Web application"),
paste the client ID and secret into Supabase's Google provider, and I wire the
app side. Also add the redirect URLs above first, since OAuth uses them.

**Apple — $99/year, and it's probably not optional once Google ships.** App
Store guideline 4.8 requires an equivalent privacy-preserving login alongside
any third-party social login. Our passwordless email code may well satisfy it
on its own, but Sign in with Apple is the answer nobody gets rejected for. I'd
treat Google and Apple as arriving together on iOS rather than assuming we can
ship Google alone. The $99 also covers installing on your own iPhone, so it
unblocks the phone test too.

**Phone / SMS** — this one has a *recurring* cost, unlike the others. Supabase
doesn't send SMS itself; you'd bring Twilio or similar and pay per message,
forever, including for every failed and re-sent code. For a calorie tracker I'd
skip it: the email code does the same job for free. Say so if you disagree.

**Notion** — I'd leave this one out, and it's the only one I'd push back on
outright. It's a workplace identity, and nobody reaches for their Notion login
to record a burrito. Every extra provider is more config, more to keep working,
and more App Review surface for no reach.

**Danny:**

---

## ANSWERED

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
