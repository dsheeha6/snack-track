# Build log

Newest first. One entry per run: what got done, what was verified, what's blocked.
Nothing gets marked done here that wasn't actually run.

---

## 2026-08-23 (evening) — sign-in rebuilt around a code, plus a biometric lock

Danny asked what the redirect URLs were even for, and assumed he'd have to
build a redirect *page*. He doesn't — it's an allowlist, and the destination
(`auth-callback.tsx`, `snacktrack://`) already exists. But the question was a
good one, because it exposed that the magic link is the slow part of getting
in: leave app → inbox → tap → come back. He asked for sign-in to be fast, with
social logins and biometrics.

Built the three he picked:

- **Email code replaces the magic link as the default.** `signInWithOtp` without
  `emailRedirectTo`, then `verifyOtp({type: 'email'})`. Six digits typed where
  you already are. The important part is what this *removes*: with no redirect
  in the flow, the redirect-allowlist blocker that's been sitting at the top of
  QUESTIONS.md for two entries no longer applies to ordinary sign-in. It got
  downgraded from "blocking" to "still needed for OAuth and password-signup
  confirmation".
- **Email + password**, `signUp` / `signInWithPassword`, with a real
  `needsConfirmation` branch — with confirmation on, `signUp` returns a user but
  no session, so the screen has to say "check your email" rather than assume it
  worked.
- **Biometric lock** via `expo-local-authentication` (read the v57 docs first,
  per `mobile/AGENTS.md`; added the plugin's `faceIDPermission` to app.json).
  Framed correctly: biometrics are **not** a login provider — Face ID proves
  nothing to Supabase, it unlocks a session this device already holds. So it's a
  lock over an existing session, not a way in.
  - Applied in the **root layout**, not the index route. Gating `/` only would
    let a deep link or restored navigation state land on `/(tabs)/today` with
    the lock never shown.
  - Re-locks on `AppState` background, otherwise it only ever runs on cold start
    and is close to useless.
  - Enabling it requires passing the check once, so nobody can turn on a lock
    they can't open. Passcode fallback stays enabled — locking someone out of
    their own food log because Face ID misread them in bad light would be its
    own kind of judgement.

- **The thing that would have shipped broken.** Checked Supabase's docs instead
  of assuming: the default Magic Link template sends a link and **no code**, so
  "Send me a code" would have delivered an email with nothing to type. Needs
  `{{ .Token }}` added to the template — queued as the new top item in
  QUESTIONS.md. Also confirmed the real limits while there: one code per address
  per 60s, expiring after an hour, and the screen's copy now says the true hour.
- **Corrected same day, after Danny sent a screenshot.** I told him the template
  edit needed no custom SMTP, citing the docs' line about the built-in service
  being for "setting up and testing email templates". The dashboard disagrees:
  a banner reads *"Set up custom SMTP to edit templates"* and the Source editor
  is greyed out. He'd guessed SMTP was required and he was right. **When the
  product UI and the docs disagree, believe the UI** — and prefer a screenshot
  of the actual account over a docs page describing it.
  The unblock still costs nothing: Supabase accepts any SMTP provider and does
  not require a verified domain (that's a deliverability recommendation), so
  Gmail SMTP with an App Password works with no domain and no new address.
  Worth doing regardless of the code flow — the built-in mailer refuses to
  deliver to anyone who isn't a project team member, so **no one but Danny could
  ever have received a sign-in email**. That was always a prerequisite to a
  second user; it merely now also gates the template.
- **Verified in the browser**, which worked this time because the dev server was
  running: bundles clean (944 modules), `tsc --noEmit` clean, and drove the real
  UI — code ↔ password ↔ sign-up toggles all switch the right inputs and
  buttons, and the submit button stays at 0.5 opacity for an empty *and* an
  invalid email, going to 1.0 only on a valid one.
- **Tooling note that cost time twice now**: synthetic `PointerEvent` dispatch
  does *not* reliably trigger React Native Web `Pressable`. Inspecting the React
  props showed the handler is `onClick` on the middle of three nested divs, and
  a native **`el.click()`** works where the synthetic sequence silently does
  nothing. Also: the page re-renders between separate `javascript_tool` calls,
  so any interaction sequence has to run inside a single call with a
  wait-for-element helper rather than being split across calls.
- **Not verified**: an actual code arriving in an actual inbox, and the
  biometric prompt itself — the first needs the template change, the second
  needs a real device. Both are flagged rather than assumed working.

**Next run:** if the template line is in, sign in with a code and finally look
at Today, Week, and the 407k-food search in the real app — still the oldest
unverified thing here. Google sign-in needs a free OAuth client from Danny;
Apple ties to the $99 and probably has to ship alongside Google for App Store
4.8. Phase 3 remains the unblocked build work.

---

## 2026-08-23 (later) — 407k foods loaded, and the search that made them findable

Danny asked to load "all of the food data ... since I added the api key". Two
things worth recording about that framing: the key he meant was the
service_role key from 08-22, and **it had already done its job** — the 7,793 SR
Legacy whole foods went in that day. The actual gap was *branded* food.
"Quest protein bar" and "starbucks" both returned zero.

- **Sized it before loading anything.** Full USDA Branded is 1,981,655 products
  (440MB zipped, ~3GB of CSV). Measured against this schema that projected well
  past the free tier's 500MB, so Danny picked "curated subset, stay free" over
  a $25/mo Pro upgrade or a live-API-lookup architecture.
- **Then measured instead of trusting the projection, which changed the
  answer.** A 20k sample load came out at **358 bytes/row**, not the ~1,200 I'd
  estimated — branded names average 40 chars against SR Legacy's long
  descriptive ones, and the trigram index scales with name length. That put the
  *entire* deduplicated catalog inside the free tier, so there was no need to
  cap anything. Loaded all of it: **399,293 branded + 7,793 whole = 407,086
  foods, 165MB, 33% of the free tier, 335MB headroom.** Final size landed within
  1% of the projection from the sample.
- **What got dropped, and why.** From 1.98M down to 399k: US-only and not
  discontinued; all four macros present; calories physically possible
  (0–900/100g); deduped on (brand, name) keeping the most recent; deduped on
  barcode, because `foods.barcode` is UNIQUE and USDA records the same physical
  product repeatedly under different descriptions (this alone halved 796k→399k).
  Also dropped rows where all four macros are zero — that costs us genuinely
  zero-calorie condiments, a real loss, but USDA also records bottled Coca-Cola
  as 0 cal, and **a wrong zero is worse than a missing row**: a gap makes you
  search again, a false zero silently under-counts the day.
- **Two new scripts**, both stdlib, both idempotent:
  `scripts/stage_branded.py` streams the three CSVs straight out of the zip into
  a local SQLite file (never extracting 3GB), and `scripts/seed_foods_branded.py`
  picks the set with SQL and bulk-loads it. Separate `source='usda_branded'`
  means the two seeders can't clobber each other — each only clears its own
  source. Re-running the selection is seconds instead of an hour.
- **Loading the data exposed that search was about to get much worse, and
  fixing it was most of the work.** Three real bugs, each found by testing
  actual queries rather than assuming:
  1. `order by name limit 20` over 407k rows returns whichever brand sorts
     first, not the food you asked for. Moved ranking into a `search_foods`
     database function: exact name, then prefix, then whole foods ahead of
     packaged, then shortest name.
  2. `ilike '%whole phrase%'` needs the words adjacent, so "quest protein bar"
     matched **nothing** while "QUEST BAR / PROTEIN BAR" sat right there. Now
     every word must appear, in any order, with the first word kept as a plain
     ilike so the planner still drives the GIN index off it.
  3. The real one: SR Legacy bakes the brand into the name
     ("Yogurt, Greek, plain, CHOBANI") but branded data does **not** — a Quest
     bar is name "PROTEIN BAR, COOKIES & CREAM", brand "QUEST BAR". Name-only
     search could never find it. Added a stored generated column
     `search_text = name || ' ' || brand` with its own trigram index, replacing
     the name-only index rather than adding to it (net ~+28MB).
  I nearly mis-diagnosed #3 as "Quest isn't in the dataset" — a `limit 6`
  without an `order by` showed me "Buck Quest" and "CHEF'S REQUESTED" and I
  took it as absence. It wasn't; ~230 Quest products were loaded the whole time.
  **Don't read an unordered LIMIT as evidence of absence.**
- **Verified**: every previously-failing query now returns the right thing —
  "quest protein bar" → Quest bars, "great value peanut butter" → Great Value
  peanut butter, "starbucks latte" → Starbucks lattes, "chicken breast" →
  chicken breast. Ranked search runs 10.7ms typical; worst case is a broad
  single word like "chicken" (~10k matches, all sorted) at 147ms, which is fine
  behind the client's 300ms debounce but is the thing to optimise if search ever
  feels slow. RLS holds: `authenticated` can call `search_foods`, `anon` gets
  "permission denied for function". Security advisor clean.
- Also fixed the UTF-16 `.env.local` crash that QUESTIONS.md had queued — both
  seeders now sniff the BOM instead of dying with a `UnicodeDecodeError` that
  looks exactly like a missing key.
- **Not verified**: the client's `supabase.rpc('search_foods', ...)` call itself,
  same session blocker as the earlier entry. The function is proven from SQL;
  the round trip through PostgREST is not.
- Deliberately **not** changed: values stay per-100g with `serving_label
  "100 g"`, matching the SR Legacy convention. Real per-serving figures ("1 bar
  (60g)") are staged in the SQLite file and would be more useful, but switching
  has to happen for *both* sources at once — mixing per-serving and per-100g
  rows behind one column would show wrong numbers, which is the one thing a
  calorie tracker cannot do. Queued as a follow-up.

**Next run:** unchanged from below — the redirect URLs are still the top
blocker, and now they also gate seeing this search working in the actual app.
Phase 3 remains the next unblocked build work.

---

## 2026-08-23 — Water tracking; Phase 2's task list is done; a real auth blocker found

First interactive session in a while, so the thing the last two runs kept
deferring — actually looking at the UI — finally happened, and a blocker that
had only been a guess got confirmed as real.

- **The magic-link redirect allowlist is genuinely broken, and it's the reason
  the phone test will fail.** Probed the Supabase auth config directly by asking
  `admin/generate_link` for five different `redirect_to` values and seeing which
  came back intact. Only `http://localhost:3000` — the untouched default Site
  URL — survives. `http://localhost:8081/auth-callback` (what
  `Linking.createURL()` produces on web), `snacktrack://auth-callback` (the
  native scheme from `app.json`), and the `exp://…` form Expo Go uses were all
  **silently replaced** with `localhost:3000`. Supabase doesn't error on an
  unlisted redirect, it just swaps it, which is exactly why this went unnoticed
  while sign-in was called "verified end to end". Queued in QUESTIONS.md with
  the precise URLs to paste — it's a dashboard setting, not something the MCP
  or the service_role key can reach.
- **Water tracking built, closing the last open Phase 2 task.** Built to
  Danny's 2026-08-22 answer exactly: hydration, not calories.
  - Migration `add_water_log`: `water_log` (user_id, logged_on, ounces,
    `check (ounces > 0)`), a `(user_id, logged_on desc)` index, RLS matching
    `entries`, plus `profiles.target_water_oz numeric default 64`.
  - `lib/water.ts` — fetch/add/delete/sum plus `updateWaterTarget`. `user_id` is
    stamped inside `addWater()` from `getUser()` rather than trusted from the
    call site, the same trap `addEntry()` hit back on 08-21.
  - `components/water-card.tsx` — blue so it reads as its own thing beside the
    macro card. One big `+ 8 oz` button, a `custom` sheet for an arbitrary
    amount *and* the editable daily goal (Phase 3 has no settings screen yet, so
    the goal lives here for now), and `undo` when there's something to undo.
  - Wired into `TodayScreen` between the macro card and the meal sections.
    Adds are optimistic like `handleDelete`. `handleUndoWater` deliberately
    no-ops on a still-pending row: deleting by a `pending-` id would 404 and
    roll back a tap that actually did save.
- **RLS verified before building on it, not after.** Ran the real insert/select
  shapes inside a rolled-back transaction with impersonated JWTs: the owner saw
  their 2 rows / 20 oz, a second user querying explicitly by the owner's
  `user_id` got 0, `anon` got 0, and an attempt to insert a row owned by someone
  else was rejected by the `with check` clause. Confirmed 0 rows left behind
  afterward. Security advisor after the migration: clean, only the pre-existing
  `auth_leaked_password_protection` warning, which doesn't apply to a
  passwordless app.
- **The UI was actually looked at this time** — partly. `TodayScreen` needs a
  session and minting one was blocked by the harness (reasonably — the script
  handled auth tokens), and with the redirect allowlist broken there was no
  clean way in. So `WaterCard` was rendered on a temporary `_dev-water` route
  with local state and driven for real: `+ 8 oz` moved 24 → 32 with the copy
  following, the fill bar sat at 50% and clamped to 100% past goal instead of
  overflowing, a custom 20 oz add landed, changing the goal to 100 recomputed
  "8 oz to go", and the bar **stayed blue past the goal** with "Goal reached —
  nice." — no red, no scold, per PRODUCT.md. Route deleted afterward; it is not
  in the commit.
- **A scare that turned out to be the harness, not the app**: the sheet appeared
  not to close — Close, Add and Save all left it on screen. The React tree said
  otherwise (`sheetOpen=false`, `visible=false` all the way down), and
  `document.hidden` was `true` with the slide-out animation stuck at
  `currentTime: 0`. The Browser pane isn't displayed in this session, so the page
  composites no frames, so the CSS animation never ends, so React Native Web's
  `Modal` never reaches the `animationend` that unmounts it. Not a bug. Worth
  remembering before chasing the next one: **a hidden pane can't finish an
  animation, so anything that unmounts on animation end will look stuck.**
- Still **not** eyeballed by anyone: the tab bar, the Week screen, and the day
  view with real entries in it. Those need a session, which needs the redirect
  fix.
- `tsc --noEmit` clean; `expo export --platform web` bundles clean (1.5MB).

**Next run:** if Danny's added the redirect URLs, sign in normally and finally
look at Today + Week with real data — that's the last unverified thing in
Phase 2, and Phase 1's "done when" depends on the same fix. If the phone test
passed too, both phases close. Otherwise Phase 3 is the next unblocked work and
needs nothing from him: Mifflin-St Jeor + activity math, the onboarding screens,
`target_history` writes, and the safety floor. Note the goal-based nutrient
phase (sugar + fiber) sitting in QUESTIONS.md — it is **not** part of Phase 3
and shouldn't be folded into it.

---

## 2026-08-22 — Phase 2: tab navigation, Week view, a first take on streaks

Both QUESTIONS.md items are still unanswered — checked `.env.local` directly
(service_role key still blank) and the OPEN section's "Danny:" lines directly
(both still empty), not just skimmed the file. Nothing new is blocked; kept
building Phase 2's next unblocked item.

- **Real screen navigation, finally**: added `app/(tabs)/_layout.tsx` using
  expo-router's standard `Tabs` (not the `unstable-native-tabs` API — checked
  the versioned SDK 57 docs first per `mobile/AGENTS.md`, and the stable,
  cross-platform `Tabs` from `expo-router` itself is the better fit for an app
  that also needs to bundle for web). Today and Week are now separate routes;
  `/` redirects signed-in users into `/(tabs)/today` via `<Redirect>` instead
  of switching components in place, so the URL/back-stack actually reflects
  what's on screen.
- **Week view built and wired to real data**: `WeekScreen`
  (`components/week-screen.tsx`) ports the prototype's bar-chart-with-goal-line
  and week stats (avg cal/day, avg protein, week total, days within 10% of
  goal) from `../calorie-tracker/index.html`'s `renderWeek()` — same math,
  same thresholds. Tapping a bar shows that day's entries below (reused
  `EntryRow`, made its `onDelete` prop optional rather than forking a
  read-only copy).
- **Streaks: no prototype precedent, so this is a first design, not a port**.
  Unlike drinks (queued as a real product question below), a logging streak
  didn't seem worth blocking on Danny for — there's no calorie-math ambiguity,
  just "count consecutive logged days." Implemented as: walk backwards from
  today over a 30-day fetch window, don't break the streak just because today
  isn't over yet (a day with zero entries only breaks it if it's *not* the
  most recent day). Flagging the definition here in case Danny wants
  something different (e.g. counting only *on-target* days, not just *any*
  logging).
- **New query added and proved against the live database, not just read**:
  `fetchEntriesRange()` in `lib/entries.ts` (date-range `gte`/`lte` on
  `eaten_on`, ordered for day-bucketing) — ran the exact query/group-by shape
  through the Supabase MCP against Danny's real test user
  (`8c5c12bc-2c3a-4d2a-9499-6002c018d8d1`) inside a rolled-back transaction:
  inserted five dated test rows spanning the 30-day window, grouped sums came
  back bucketed on the right days (e.g. two same-day entries summed to one
  row), and a second impersonated user got zero rows for the identical query.
  No test rows were left behind (transaction rolled back, not deleted after
  the fact).
- **Verified the same way as last run, for the same reason**: this is another
  unattended scheduled-task session, so `expo start` can't be launched here —
  confirmed by trying `preview_start` against the existing
  `snack-track-mobile` launch config, which the harness correctly refused.
  Instead: `tsc --noEmit` clean, and `expo export --platform web` bundled
  clean (853 modules — up from before since `Tabs` pulls in
  `@react-navigation/bottom-tabs`, no errors). The new tab bar, the bar
  chart's visual layout, and tapping between days are **not** eyeballed —
  someone should open this on a phone or `npx expo start --web` before
  trusting the Week screen's look, same caveat as last time.
- Did not touch `foods` seeding or the drinks design question — both still
  sit on Danny, unchanged from last run.

**Next run:** check `.env.local` and QUESTIONS.md directly again before
assuming still blocked. If the service_role key landed, run
`scripts/seed_foods_usda.py`. If the phone test or drinks answer landed, act
on it. Otherwise: **open the app for real** (`npx expo start --web` from
`mobile/`, interactive session only) and actually look at the new tab bar and
Week screen before building further on top of it — this is the second run in
a row shipping UI that's only been proven at the query/type level, not by
eye. If that checks out, drinks is still the only clearly-scoped remaining
Phase 2 item once Danny answers it; short of that, look for smaller
Phase 2/3 prep (e.g. starting the Mifflin-St Jeor math for Phase 3, which
doesn't depend on any open question).

---

## 2026-08-21 — Phase 2: day view, entries, food search — all real, none of it live-tested

Both Phase 1 questions are still unanswered (checked `.env.local` directly for
the service_role key, not just QUESTIONS.md — still blank). Nothing new is
blocked on Danny; kept building Phase 2 work that doesn't need him.

- **Day view, add/delete entries, food search — the core of Phase 2 — built
  and wired to the real database**: `lib/meals.ts` (meal slots, colors ported
  from the prototype's palette, time-of-day guess), `lib/entries.ts` and
  `lib/foods.ts` (typed CRUD/search against `entries` and `foods`),
  `MacroBar`, `EntryRow`, `AddEntryModal` components, and `TodayScreen`
  rewritten to group real entries by meal, sum live totals against the
  profile's targets, and open a search-or-manual-entry modal per meal.
- **A real bug caught before it shipped, not after**: the first draft of
  `addEntry()` never set `user_id`, which would have failed outright —
  `entries.user_id` is `not null` and RLS requires `auth.uid() = user_id`.
  Fixed by stamping it from `supabase.auth.getUser()` inside `addEntry()`
  rather than trusting call sites to pass it.
- **No red states, per PRODUCT.md**: the calorie bar shades coral only past
  ~105% of target, same threshold and color as the prototype's bottle fill —
  informational, not a warning. The "X over" label is plain text, no scold
  copy anywhere in the new screens.
- **How this was verified, given the constraint below**: `tsc --noEmit` clean,
  `expo export --platform web` bundles clean (1.5MB single-file, no errors).
  More importantly, ran the *exact* insert/select/delete query shapes from
  `entries.ts` and the food search's `ilike` query from `foods.ts` directly
  against the live Supabase project via the MCP, impersonating Danny's real
  test user (`8c5c12bc-2c3a-4d2a-9499-6002c018d8d1`) with `set local
  request.jwt.claims`: insert succeeded and round-tripped through a
  `select ... where eaten_on = current_date` exactly matching `fetchEntries()`,
  a second (fake) user's `request.jwt.claims` saw zero rows for it, delete
  removed it cleanly, and `foods` search for "chicken" returned real USDA
  rows. Confirmed no test rows were left behind afterward. This is a real
  proof of the query/RLS shape, not a guess — but it is **not** the same as
  tapping through the actual app.
- **Could not open the app itself this run**: this was an unattended
  scheduled-task session, and dev servers can't be launched without someone
  present to approve the command — so no live Metro/Expo Go verification of
  the new screens, no screenshot. Everything above is real, but the UI itself
  is unverified by eye. Flagging this plainly rather than claiming a look I
  didn't get. Whoever runs this interactively next should open it and check
  the day view renders sanely before trusting it fully.
- **Found and did NOT fix a real environment problem**: `expo export
  --platform ios` and `--platform android` both failed at the Hermes
  bytecode step with `spawn UNKNOWN`. Traced it to a Windows Application
  Control policy blocking `node_modules/hermes-compiler/hermesc/win64-bin/
  hermesc.exe` outright (confirmed via PowerShell: "An Application Control
  policy has blocked this file") — not a code bug, not something in scope to
  route around. Doesn't block Phase 1/2 work: local Expo Go testing goes
  through Metro's dev bundle, not this production Hermes step, and Phase 8's
  eventual store builds will most likely run through EAS Build (cloud) rather
  than this machine. Worth knowing about before anyone tries a local
  `--platform ios/android` export or a local EAS build on this machine.
- **Accidentally triggered `expo lint`'s auto-install** (it silently added
  eslint + eslint-config-expo to `package.json`/`package-lock.json` and wrote
  an `eslint.config.js`, then failed anyway with "Cannot find module
  'eslint'"). Reverted the package.json/lock changes and deleted the config
  file rather than leave a half-working, unrequested lint setup in the repo.
- Did **not** start Week view/streaks or Drinks tracking. Week view has a
  prototype reference to port from (`../calorie-tracker/index.html`'s
  bottle-chart week logic) but needed real screen navigation, which the app
  doesn't have yet (only a single `/` route) — bigger than fitting in cleanly
  alongside today's work. Drinks has **no schema and no prototype precedent
  at all** — genuinely undesigned. Queued the design question in
  QUESTIONS.md rather than guess at whether water/coffee count toward
  calories.

**Next run:** if either QUESTIONS.md item is answered, act on it first
(service_role key → run `scripts/seed_foods_usda.py`; phone test result →
either fix the redirect issue reported or check Phase 1's box for real and
update the roadmap). Either way, **open the app for real this time** —
`npx expo start --web` (interactive session only — blocked in unattended
runs, see above) — and eyeball the new day view before building on top of it
further. Then either add tab/stack navigation and build Week view from the
prototype's logic, or get an answer on the drinks question and design that
table. `foods` search only has 800 rows to search against until the seed
finishes, so don't be alarmed if some obvious foods are missing yet.

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

With Phase 1 genuinely done except the phone tap, and that being squarely
Danny's to do, moved to Phase 2 prep that doesn't need him:

- **Started seeding `public.foods`** from USDA FoodData Central's SR Legacy
  dataset (public domain, ~7,800 standard foods — the well-curated whole-foods
  set, not the 2GB+ user-submitted Branded Foods dump). Downloaded it, wrote
  the food.csv/food_nutrient.csv parsing (join on fdc_id, pull energy/protein/
  fat/carbs by nutrient ID, values are per-100g by USDA convention), and
  loaded 800 rows by hand through the Supabase MCP as a correctness check —
  verified the count and spot-checked values.
- **Hit a real constraint, and built the actual fix instead of finishing the
  same way**: `foods` is deliberately insert-blocked for every client role
  (RLS — see `docs/supabase.md`), so loading it needs the service_role key,
  which isn't in `.env.local` yet. Hand-relaying the remaining ~7,000 rows
  through tool calls would have worked but is a bad way to move bulk data —
  wrote `scripts/seed_foods_usda.py` instead: pure-stdlib Python, downloads
  the dataset itself, parses it the same way, and bulk-loads via the REST API
  with the service_role key once it's available. Idempotent (clears
  `source='usda'` rows before reloading, so re-running for a future USDA
  release, or after the manual 800, can't create duplicates). Dry-ran the
  parsing half against the cached dataset — 7,793 rows, matches the manual
  count exactly, values check out.
- Queued the service_role key in QUESTIONS.md with exact steps. This is the
  right long-term tool for any future bulk load too (Branded Foods later,
  when that's wanted, is 2GB+ — hand-relaying that really isn't an option).

**Next run:** if Danny's pasted the service_role key into QUESTIONS.md, move
it to `.env.local`, run `scripts/seed_foods_usda.py` to finish the food seed,
and check the phone-test answer while there. If the phone test passed, move
Phase 1's checkbox and start Phase 2 proper (day view, add/delete entries,
food search UI against the now-real `foods` table). If neither is answered,
keep finding Phase 2 prep that doesn't need Danny.

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
