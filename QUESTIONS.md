# Questions for Danny

The build agent writes here when it hits something only you can decide or only you
can do. Answer inline under each one — plain text is fine. The next run picks up
answers, acts on them, and moves the item to ANSWERED.

---

## OPEN

Nothing is fully blocked — both items below are things only you can do, not
decisions that hold anything up.

### Try the app on your phone
Phase 1's real app exists now (`mobile/`) and everything I can verify without a
device checks out: it bundles clean for iOS/Android/web, email sign-in works
end-to-end (I proved it by requesting a real magic link, reading it out of your
Gmail, and following it through to a signed-in session), and row-level security
is locked down. The one thing only you can do is open it on an actual phone.

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

If the magic-link tap doesn't redirect back into the app, it's almost certainly
because Supabase's Auth → URL Configuration → Redirect URLs allowlist doesn't
include the Expo Go redirect for your network. Reply here with what you saw and
I'll adjust the redirect handling or walk you through adding the URL — I can't
change that dashboard setting myself with the tools I have.

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
tables — `entries`, `foods`, `personal_foods` — plus a re-seed, because
`scripts/seed_foods_usda.py` only pulls four USDA nutrient IDs today
(1008 calories, 1003 protein, 1004 fat, 1005 carbs). Total sugars is 2000 and
fiber is 1079. The re-seed itself is cheap and idempotent (~2 min for 7,793 rows).

**Danny confirmed fiber on 2026-08-22:** add **sugar and fiber together**, not
sugar alone. One migration and one re-seed instead of two. So when this phase
starts, `entries`, `foods`, and `personal_foods` each get a `sugar` and a `fiber`
column, and `WANT_NUTRIENTS` in the seeder gains `"2000": "sugar"` and
`"1079": "fiber"` before the re-seed.

The rest of this item — which nutrients each goal surfaces, and the onboarding
flow that asks — is still unscoped and still Danny's call.

**Danny:**

### Apple Developer Program — when?
$99/year. Not needed until there's something to install on your phone, and Expo Go
covers testing before that. Say the word when you want to enroll.

**Danny:**

---

## ANSWERED

### Drinks tracking — answered 2026-08-22
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
