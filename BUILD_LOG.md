# Build log

Newest first. One entry per run: what got done, what was verified, what's blocked.
Nothing gets marked done here that wasn't actually run.

---

## 2026-09-13 (later) — parse-meal wired into the app, and driven by hand

Phase 4's other half. **Verified by using it, not by reading it**: the web
bundle was run, a throwaway account signed in, and a sentence typed into the
real modal produced real rows in `entries`.

- **`mobile/src/lib/parse-meal.ts`** — client for the edge function.
  `functions.invoke` attaches the session JWT automatically, so the Anthropic
  key stays server-side and this call carries only the user's session.
  Non-2xx responses are unwrapped: `error.message` is a useless generic
  ("Edge Function returned a non-2xx status code") while the function's own
  plain-English message is in the `Response` on `error.context`.
- **It requests `resolve: 'none'`, which is a measured choice.** `estimate`
  would run a `foods` lookup per item to attach `food_id` — but **`entries` has
  no `food_id` column**, so today that buys a database round trip per item and
  nothing else, and this morning's eval showed the match would be wrong as
  often as right (banana → banana pepper). Flip it to `estimate` when
  single-best resolution is fixed and there's a column to put the id in.
- **`addEntries()` in `lib/entries.ts`** — one insert for the whole sentence.
  Inserting per item would mean a half-logged meal whenever one call failed,
  and the user having to work out which half to retype.
- **The add-food modal now leads with the sentence box.** PRODUCT.md is
  explicit that "typing a sentence is the fastest path and stays the primary
  one", so search and the manual form moved below it rather than the sentence
  being bolted on underneath. Parsing swaps the modal into a review state:
  every item with its quantity, a confidence note, its calories and a × to drop
  it, then running totals and one button. Removing an item recomputes the
  totals and the button label.
- **Confidence copy is about the guess, never the person** — "estimated
  portion", not "you didn't say how much". PRODUCT.md's test is whether a
  string would feel bad to read on a day someone already feels bad.
- **Onboarding's last step got the same treatment**, so the first thing a new
  user sees is the primary interaction. Its `logged` state now holds a finished
  sentence rather than a bare name, because one sentence can log four foods and
  "eggs and 3 more is on today's list" is not English.

**What was actually verified, in the running app:**

1. `tsc --noEmit` clean. It caught a real miss — `onboarding-flow.tsx` mounts
   the same modal and needed the new prop.
2. Web bundle boots, renders, no console errors.
3. **The `authenticated` path, which had never been tested.** Every call
   earlier today used `service_role`; the app sends a user JWT. Created a
   throwaway account via the admin API, confirmed `role=authenticated`, and
   called the function with it — HTTP 200.
4. **The whole loop by hand**: typed *"2 eggz on sourdough and a grande latte
   from starbucks"* → came back as **Eggs** (typo fixed), **Sourdough bread**
   (marked "estimated portion"), **Starbucks grande caffe latte** with the real
   grande serving → removed the sourdough, watched totals drop 665 → 345 and
   the button change to "Add all 2" → logged it → both rows appeared under
   lunch and the macro bars moved. Confirmed in the database as `source='ai'`.
5. Throwaway account deleted afterwards (entries and profile cascade); a second
   one from a crashed first attempt was tracked down and deleted too. Security
   advisor re-run: clean.

**Two things noticed and deliberately not fixed here:**

- **`expo lint` fails with 5 errors**, all `react-hooks/set-state-in-effect`,
  across `auth-context.tsx`, `water-card.tsx`, `use-color-scheme.web.ts` and
  the two effects in `add-entry-modal.tsx`. **All five predate this change** —
  confirmed against `git show HEAD:` — but the project's own lint gate is red,
  which will matter the moment anything runs it in CI.
- **The security advisor's `auth_leaked_password_protection` warning was
  dismissed on 2026-08-22 as "doesn't apply — this app is passwordless
  magic-link only". That reasoning expired on 2026-08-23**, when email+password
  sign-in was added. It's a dashboard toggle and Danny's call, but the old note
  shouldn't be trusted next time it appears.

**Next run:** Danny using it for a real day is now the gate on *two* "done
when" lines — Phase 2's (stop using the prototype for a full day) and the
practical half of Phase 4's. After that: follow-up questions for high-variance
foods (capped at two), corrections into `personal_foods`, and `ai_usage`
metering, then Phase 5.

---

## 2026-09-13 — The edge function that calls Claude, on Haiku, plus the eval entry that scores it

Danny added the Anthropic key and picked the model: *"i would like to use
haiku"* → `claude-haiku-4-5`. Built the function and wired it into the harness.
**Not yet scored** — see the two blockers at the bottom, one of which is his.

- **`.env.local` was UTF-16 again.** Same trap as the `service_role` key on
  2026-08-22: Notepad/PowerShell save UTF-16 by default and a plain `utf-8` read
  dies with `UnicodeDecodeError: 0xff in position 0`, which reads like a missing
  key rather than an encoding problem. Converted back to UTF-8 (BOM stripped)
  and **fixed the cause this time**: `load_env_local()` in `evals/run.py` sniffs
  the BOM and decodes UTF-16 or `utf-8-sig`. The copies in
  `scripts/seed_foods_usda.py` and `scripts/seed_foods_branded.py` are still the
  old brittle version — port it over when either is next touched.
- **Key sanity-checked without printing it**: it's a standard `sk-ant-api...`
  key, not `sk-ant-admin...` (admin keys are org-management only and the
  Messages API rejects them), and carries no stray quotes or whitespace.
- **`supabase/functions/parse-meal/index.ts`** — the first edge function in this
  project. Takes `{text, meal, resolve, model}`, returns the same
  `{items, totals, meal, questions}` shape `../calorie-tracker/parse.py`
  produces, so it drops into the existing UI and the harness scores both the
  same way. Decisions worth recording:
  - **Strict tool use, not `output_config.format`.** Both give schema-valid
    JSON, but strict tool use has a raw wire shape that needs no helper subpath
    import — and this file cannot be run locally (no Deno, no Docker on this
    machine), so first execution is on deploy. Fewer exotic imports in code you
    can't test locally is worth more than the marginally nicer API.
  - **`verify_jwt` alone was not enough, and this is the one real security
    finding of the session.** It proves only that the token was signed by this
    project — and the *anon key is a valid project JWT that ships inside the app
    bundle*. Anyone who unzips the APK could have called a function holding an
    Anthropic key. The function now reads the `role` claim and accepts only
    `authenticated` or `service_role`; `anon` gets a 401. No signature check in
    our code on purpose — the platform already did it before the handler ran.
  - **Three resolve modes** rather than one guess about whether the food
    database helps: `none` (Claude's numbers alone — what the first score
    measures), `estimate` (Claude's numbers stand, a `foods` match only attaches
    `food_id`/provenance), `db` (a match overrides the numbers). This turns the
    roadmap's "resolve against `foods` → confidence flags" line into something
    measurable instead of assumed, and reuses the existing `search_foods` RPC
    through the caller's own JWT so RLS and the authenticated-only grant apply
    exactly as they do in the app.
  - **No thinking configured.** Haiku 4.5 takes `budget_tokens` rather than
    adaptive thinking and rejects `effort`; for a one-sentence extraction it
    earns nothing, so it's omitted — which is also the cheap and fast setting.
  - **Missing-secret case returns plain English**, not an SDK stack trace,
    because that is by far the most likely first-run failure.
- **`evals/run.py` gained `--pipeline claude`**, plus `--model` and `--resolve`.
  It calls the **deployed** function over HTTPS rather than reimplementing the
  prompt in Python: a local copy would drift from what ships, and a score for
  code nobody runs is worse than no score. 8-way threaded, and it prints token
  totals and a dollar cost per run and per meal. "Unresolved" is mapped to
  Claude's `confidence: "low"` so the column means the same thing it means for
  the baseline — an item the pipeline couldn't put a real number on.
- **Baseline re-run as a regression check**: still 19.8% mean calorie error,
  28/50 within 15%, 12 meals with an unresolved item. Identical to 2026-08-25,
  so the refactor moved nothing.
- **The Supabase project had auto-paused.** Free tier pauses after ~1 week idle
  and the last run was 2026-08-25, so `deploy_edge_function` failed with
  `status 'INACTIVE'`. Restored it via MCP; it came back `COMING_UP`. **Worth
  knowing for every future unattended run: the first call of a session may fail
  purely because the project is asleep, and the fix is a restore, not a bug
  hunt.**

**RESULT (same day, after Danny set the secret): Haiku beats the baseline.**

| | baseline (`parse.py`) | Haiku 4.5 |
|---|---|---|
| Calorie mean % error | 19.8% | **14.2%** |
| Calorie median % error | **0.0%** | 6.4% |
| Within 15% on calories | 28/50 (56%) | **35/50 (70%)** |
| Meals with an unresolved item | 12 | **1** |

Cost: **$0.106 per 50-meal run, $0.0021/meal.** 68,046 input / 7,685 output
tokens. Run twice (see the caveat below): the second gave 14.6% / 34-of-50, so
**run-to-run variance is roughly ±0.5 points of mean error and ±1 meal** — small,
but real, and worth remembering before reading much into a 1-point difference
between future runs.

**The per-tag view is the actual finding, and it is a trade rather than a clean
win.** Only tags with n≥3 shown, because most of the others are a single meal and
mean nothing:

| tag | n | baseline | Haiku | delta |
|---|---|---|---|---|
| typo | 3 | 61.0% | 7.3% | **−53.7** |
| word-number | 3 | 56.8% | 21.7% | **−35.1** |
| not-in-table | 10 | 39.9% | 7.2% | **−32.7** |
| restaurant | 7 | 36.4% | 3.7% | **−32.7** |
| ambiguous | 9 | 22.5% | 17.2% | −5.3 |
| no-explicit-unit | 6 | 10.9% | 6.4% | −4.6 |
| casual-phrasing | 4 | 5.0% | 9.7% | +4.7 |
| simple | 18 | 4.3% | 14.9% | **+10.7** |
| multi-item | 7 | 3.8% | 20.2% | **+16.5** |

Read that as: **Claude fixed every reading-comprehension failure the baseline
had, and gave back accuracy on the easy meals the ingredient table already knew
cold.** The median error moving 0.0% → 6.4% says the same thing from another
angle — the table is *exactly* right on what it knows, Claude is *approximately*
right on everything. Bias is not the cause: 20 over-estimates to 23 under.

**That is the argument for the hybrid, and it is now a testable one rather than a
hunch:** let Claude do the reading (which foods, how much) and let `foods` supply
the numbers where it has a confident match. That is exactly what `--resolve
estimate` and `--resolve db` exist to measure, and `search_foods` is callable by
both `service_role` and `authenticated` (checked, not assumed), so the eval can
run them. **Not run yet** — each is another ~$0.11 and it's Danny's money.

**Caveat on this run, recorded because the numbers above depend on it:** the eval
was run twice. The first run's headline got cut off by a `tail` in the command
that produced it, so it was re-run to read the calorie line — ~$0.11 of avoidable
spend. Read the saved `evals/claude_results.json` instead of re-running; that is
what it is for.

**Getting the secret set took four attempts and every failure was worth a
guard.** Recorded because all four are the kind that look like a broken key:
1. Secret saved with the **project name in the Name field** (`Snack-Track`), so
   `ANTHROPIC_API_KEY` was simply absent. The function now lists the non-secret
   env names it can see in its 500, which is what found it.
2. Then a **workspace-scoping 400** — a key created at org level rather than
   inside a workspace needs an `anthropic-workspace-id` header. Added an optional
   `ANTHROPIC_WORKSPACE_ID` secret for that case; unused, since the good key is
   workspace-scoped.
3. Then `.env.local` **reverted to UTF-16** (Notepad), so PowerShell's
   `Get-Content` read the 108-char key as 88 characters.
4. Then the Supabase secret held **256 characters with internal whitespace** —
   the PowerShell command text itself. `Set-Clipboard` fails silently when run
   without an interactive window station, so the clipboard still held the copied
   command. **Never verify a clipboard copy by printing the length of the
   variable you copied *from*** — that reports success when the copy failed.
   The fix that worked was printing the key and copying it by hand.

The durable lesson is the diagnostic, not the four mistakes: a `debug: true`
body flag (service_role only) returns the stored key's **length, a 12-hex
SHA-256 prefix, and whitespace flags**. Comparing that prefix against the same
hash of `.env.local` settles "is the secret the key I think it is" in one free
call, and it is what ended this. Use it first next time.

**`--resolve db` was then run and it is WORSE. Do not ship it.** ($0.11)

| | `resolve=none` | `resolve=db` |
|---|---|---|
| Calories mean | 14.2% | 16.1% |
| **Protein mean** | **16.3%** | **32.4%** |
| **Carbs mean** | **24.4%** | **35.3%** |
| **Fat mean** | **33.2%** | **39.7%** |
| Within 15% on calories | 35/50 | 37/50 |

Two separate things are true here and they matter for whoever reads this next:

**1. The calorie column of this experiment is meaningless — that's a design flaw
in the mode, not a result.** `db` computes `servings = claude_calories / row_calories`
and then `calories = row_calories * servings`, which is algebraically
`claude_calories` again. **The db path cannot change calories by construction.**
The 14.2 → 16.1 and 35 → 37 differences are run-to-run noise (±0.5 / ±1, measured
earlier), not the database doing anything. Only the macros are a real comparison.

**2. The macros got much worse, and the cause is match quality, not the scaling.**
79 of 92 items matched a `foods` row, and the matches are bad in a specific,
diagnosable way — generic food words hit the 399k branded rows before the 7,793
clean USDA whole foods:

- `wine` → **CIRIO RED WINE VINEGAR**
- `banana` → **PICKERFRESH MEDIUM HOT SLICED BANANA PEPPER**
- `oatmeal` → **LECOUR'S OATMEAL RAISIN SOFT COOKED COOKIES**
- `Chipotle Chicken Bowl` → **Old El Paso Chipotle Chicken Burrito Bowl** (the
  supermarket freezer product, not the restaurant — and the restaurant tag was
  Claude's single best category at 3.7%)

`search_foods` orders by exact-name, then prefix, then `source='usda'`, then
`length(search_text)`. With `lim: 1` and a one-word query, a short branded name
containing the word beats the correct whole food. **The branded load that made
search good for the app's own search box makes it bad for automated single-best
resolution.**

**Conclusion: ship `resolve: estimate`** — Claude's numbers stand, the database
is used only to attach `food_id`. And note that even *that* is not trustworthy
yet: linking a logged banana to a banana pepper is wrong even when the numbers
don't change. Before the `food_id` link or any `db` numbers can ship,
`search_foods` needs a resolution path that prefers `source='usda'` for
unbranded queries and returns nothing rather than a bad guess.

One fragile code path found and worth fixing when this is next touched: a matched
row with 0 calories makes `servings` default to 1 and zeroes the item. It only
hit `water` → `IGA WATER` this run, where 0 is the right answer anyway, so it did
no damage — but it would silently zero a real food whose row has bad data.

**Still blocked on nothing.** Previous blockers, both now cleared:

1. ~~Danny sets the `ANTHROPIC_API_KEY` secret~~ — done, after the four
   attempts above.
2. ~~Then run it~~ — done. Results above.

**Next run:** the question is no longer "does Claude beat the table", it's
"can we keep both halves". Score `--resolve estimate` and `--resolve db`
(~$0.11 each) and compare against the `none` numbers above, specifically on the
`simple` and `multi-item` tags where the database should win back the +10.7 and
+16.5 regressions without giving up the typo/restaurant gains. If `db` does that,
it's the shipping mode and the confidence flags follow from it. Only if the
hybrid fails to recover those tags is `--model claude-sonnet-5` (~$0.25) worth
trying — the failures here are portion-size judgement, not comprehension, and a
bigger model is not obviously the fix for that.

---

## 2026-08-25 — Phase 4 started: the eval harness and the baseline it exists to beat

Unattended scheduled run. QUESTIONS.md checked first — the one OPEN item
(goal-based nutrient tracking) still has no answer under it, nothing to act
on. Phase 4 is next per every prior "Next run" note, and its own task list is
explicit that the baseline comes before any Claude call, so that's the whole
session: no API key was touched, none is in `.env.local` yet.

- **`evals/meals.jsonl`** — 50 meal sentences, each with hand-entered
  calorie/protein/carb/fat ground truth (cross-checked against standard
  USDA-ballpark values, and for chain-restaurant items each chain's own
  published nutrition figures — not copied from the prototype's ingredient
  table, since scoring the prototype against its own numbers would be
  meaningless). Every meal is tagged by what it's testing:
  - **20 simple/explicit-quantity meals** close to the prototype's ingredient
    table — the easy case.
  - **10 ambiguous meals** with no stated portion ("a bowl of oatmeal", "a
    handful of almonds") — ground truth assumes a typical serving; these
    test whether a pipeline's default guess lands near a normal one.
  - **7 typo/casual-phrasing meals** ("3 eggz", "peanutbutter" run together,
    "grabbed a protien bar") — the way people actually type, not clean text.
  - **7 restaurant/branded meals** (Chipotle, Big Mac, Chick-fil-A, Starbucks,
    Five Guys, Panda Express, Subway) that the local ingredient table has no
    entries for at all — the case a real food-database lookup should win
    outright and a fixed local table structurally cannot.
  - **6 mixed/edge cases** — fractional quantities (3/4 cup), word-numbers
    ("half a dozen"), a zero-calorie meal, a genuinely unknowable homemade
    item.
- **`evals/run.py`** — loads the jsonl, runs a pipeline over each meal's raw
  text, and scores calorie/protein/carb/fat against ground truth (mean and
  median absolute % error, % of meals within a 15%-on-calories tolerance,
  error broken down by tag, worst-10 list, unresolved-item count). Built with
  a `--pipeline` registry so the Claude pipeline slots in later as a second
  entry with the same `{calories, protein, carbs, fat}` output shape — the
  roadmap's "done when" is this same harness reporting Claude beating the
  number below, so the harness had to exist in a form that can score both.
  The baseline pipeline runs the prototype's real `parse_text()` (imported
  directly from `../calorie-tracker/parse.py`, not reimplemented) with an
  **empty logging history** on purpose — otherwise the "same as last time"
  shortcut would make the baseline look better at reading a sentence than it
  actually is, and a future Claude pipeline has no equivalent memory to lean
  on either, so scoring with it on would bias the comparison.
- **Verified by running it**, not by reasoning about the code: `python
  evals/run.py --json evals/baseline_results.json` executes cleanly and
  produces real numbers. Spot-checked one result by hand (m01, "3 eggs on
  sourdough with sriracha") to make sure the harness itself wasn't lying —
  traced the 471-vs-351-calorie gap to a real and defensible cause: the
  sentence's SPLIT regex separates "on sourdough" from the leading "3", so
  the prototype falls back to sourdough's table default of 2 slices where
  the hand-written ground truth assumed 1 — a genuine natural-language
  ambiguity, not a bug in either the parser or the eval.
- **The baseline, for the record — this is the number Phase 4's "done when"
  has to beat:**
  - Mean calorie error **19.8%**, median **0.0%** (most meals it knows
    outright; the mean is dragged up by the ones it doesn't).
  - **56% of meals (28/50) land within 15% on calories.**
  - **12/50 meals have at least one item the parser can't resolve at all** —
    every restaurant meal, plus a couple of typos ("protien", "peanutbutter"
    run together) and one deliberately unknowable homemade item.
  - By tag: restaurant items average **36.4%** calorie error (all-or-nothing
    misses drag this up — an unresolved item scores as 0 predicted, 100%
    error), typos **61.0%**, word-numbers ("half a dozen") **56.8%**, but
    plain multi-item meals with explicit quantities average **3.8-4.3%** —
    the table itself is accurate; the failures are reading comprehension
    (typos, unstated units, world knowledge) rather than nutrition data.
  - Full per-meal breakdown in `evals/baseline_results.json` (not committed —
    regenerate with the command above; it's a derived artifact, not a source
    of truth).
- **Not built this run**: anything touching Claude. No edge function, no
  `ANTHROPIC_API_KEY` in `.env.local` (still empty), no structured-output
  parsing. That's next, now that there's a number to beat and a harness that
  can prove it.

**Next run:** check QUESTIONS.md first, as always. Then Phase 4's next item:
the edge function that holds the Anthropic key (needs `ANTHROPIC_API_KEY`
from Danny — queue it in QUESTIONS.md if it's still not in `.env.local`) and
the structured-output prompt that turns a meal sentence into the same
`{items, totals}` shape `parse.py` already produces, so it can resolve
against `foods` and slot into `evals/run.py` as a second pipeline. Once that
exists, run the harness on both and see whether the baseline above actually
gets beaten before building anything further on top of it (follow-up
questions, `personal_foods` corrections, `ai_usage` metering).

---

## 2026-08-24 (later) — Phase 3 done: onboarding, driven end to end in the running app

Danny was at the keyboard for this one, and answered all four open questions
first. Recorded in QUESTIONS.md and acted on here:

1. **The app is on the Android emulator**, and he's not paying the $99 for an
   iPhone right now. Phase 1's "on his phone" is met; Apple sign-in, TestFlight
   and any physical-iPhone check are parked until that changes.
2. **The redirect URLs — "cant you do that?"** Checked properly instead of
   assuming: no. The Supabase MCP server exposes database and project tools and
   **no auth-config endpoint at all**, and the `service_role` key is a database
   credential while GoTrue's URI allow-list is platform config, so no SQL
   reaches it either. The two ways it could happen (a `sbp_` personal access
   token dropped in `.env.local`, or driving the dashboard in his own logged-in
   Chrome) are both written up in QUESTIONS.md. Not urgent: nothing is blocked
   on it while the email-code flow is the way in.
3. **The session-restore sign-in bug is closed** — "no longer an issue." No root
   cause, which is acceptable only because the two defensive fixes from
   2026-08-23 were built to make it impossible either way. Reopen if it recurs.
4. **Google sign-in is deferred to the end of the build**, and his direction for
   everything else was explicit: *"build out main function, design, features
   before the adding the google authen and the other stuff."* So the order is
   the roadmap's own — Phase 3, then 4, then 5 — with all the auth/accounts work
   late.

**Built: the whole onboarding flow.** Eight screens, not the plan's seven (the
extra is a name/welcome step; the plan's "first natural-language log" is here as
an optional manual first log, since the sentence box is Phase 4 work and pulling
it in early would have meant building it twice).

- `mobile/src/lib/onboarding.ts` — the draft shape, the parsing and validation
  for every answer, and one `saveOnboarding()` that writes all three places a
  finish touches: `profiles`, today's row in `weights`, and the first
  `target_history` row.
- `mobile/src/components/onboarding/` — `onboarding-ui.tsx` (the step frame,
  progress dots, choice grid, number field), `onboarding-flow.tsx` (all state,
  so Back never loses an answer), `targets-review.tsx` (the "show your work"
  screen).
- Route `/onboarding`, gated **twice** on `profiles.onboarded_at`: `index.tsx`
  waits for the check before redirecting, and a root-layout `OnboardingGate`
  catches deep links — the same reasoning the existing `LockGate` was built on.
  The gate redirects from an effect rather than rendering `<Redirect>`, because
  the navigator has to exist before anything can navigate. Onboarding status
  lives on `AuthContext` alongside `session` and `locked`, with a
  `markOnboarded()` the flow calls after saving so the last step doesn't get
  bounced straight back.
- **Migration `add_goal_weight_to_profiles`** — `goal_weight_lb numeric(6,2)`,
  nullable. `db/schema.sql` updated in the same commit, per its own header rule.

**Verified twice over, and the second one is the one that counts.**

*First, the logic on its own.* 27 assertions run under `node`'s TS stripping
against mechanical copies of `targets.ts`/`meals.ts`/`onboarding.ts` — only the
import lines rewritten and `supabase` stubbed, nothing else touched. All pass:
Danny's stats reproduce BMR 1,813 / 180P / 80F exactly and 2,878 cal; 5'10" and
178 cm agree; "6 ft" with blank inches works; 12 inches, 31 February, month 13
and an age of 8 are all rejected; the healthy-BMI floor at 5'10" computes to
129 lb; a 120 lb goal is refused and 135 lb allowed; a blank goal weight is
allowed and a recomp goal is never asked; "I don't track my steps" with a desk
lifestyle gives exactly the same answer as typing 4,000 steps.

*Then the real thing.* Created a throwaway Supabase account with the admin API
(**no email, no touching Danny's inbox and no rate limit spent**), signed into
the running dev server as it, and drove all eight screens by hand:

- Signing in landed **straight on onboarding**, not Today — the gate works.
- The goal-weight floor fired in the app with the right number and the right
  tone: *"For your height, 129 lb is the low end of the healthy range…"*, and
  **Next stayed blocked** until it was fixed. Switching to recomp made the
  question disappear entirely.
- The review screen rendered the whole calculation: 1,813 → × 1.725 →
  3,128 → − 250 → **2,878 cal**, with 180P / 360C / 80F and each macro's rule
  spelled out underneath.
- Hand-editing calories to 900 updated the headline live and tripped the
  1,200 floor warning **on the edited number**, phrased as information and still
  letting you continue.
- Saved with hand-set 2,900 / 180 / 365 / 80. Checked the database directly:
  every profile field correct, `weights` holding 179.00 for today,
  `target_history` reading `onboarding — adjusted by hand`, `onboarded_at` set,
  `goal_weight_lb` correctly null for a recomp goal.
- The optional first log worked through the real food search ("chobani" against
  the 399k-row branded index) and Today then showed **53 / 2900** with the entry
  under dinner. A reload went straight to Today instead of back to onboarding.
- No console errors. `tsc --noEmit` clean, `expo export --platform web` clean.
- **Cleaned up after myself**: the test user was deleted (cascade verified — 0
  rows left in profiles/entries/weights/target_history) and the preview server
  stopped, so no signed-in tab is left lying around. That specific litter cost a
  whole diagnostic cycle last time.

**Three things to know.**

- **Danny's own account has `onboarded_at` null**, so his next sign-in goes
  through onboarding. That's the right outcome rather than a bug — his profile
  is still carrying the schema defaults (2200/165/220/70) instead of his real
  2900/180/365/80, and finishing onboarding fixes that in one pass.
- `expo lint` can't run — `eslint` isn't in `node_modules`, and trying it
  scaffolded an `eslint.config.js`, added two devDependencies and rewrote 5,566
  lines of `package-lock.json` without ever producing a working linter. All of
  that was reverted; adding a linter is its own decision, not a side effect of a
  Phase 3 commit. `tsc --noEmit` is the check this repo has actually been using.
- Known environment quirk, not a bug: in the Browser pane the `AddEntryModal`'s
  contents linger in the DOM after closing, because the pane doesn't composite
  frames so React Native Web's `animationend` never fires. Same thing the log
  noted before; screenshots fail for the same reason, so this run was driven
  through `read_page` and the accessibility tree.

**Next run:** check QUESTIONS.md first, as always — the nutrient/goal question is
the only OPEN item and it's still unanswered. Then **Phase 4, AI logging**, which
is the feature the whole product exists for and the next thing in Danny's stated
order. Its first task needs neither him nor an API key: build `evals/meals.jsonl`
(50 real meals with hand-checked numbers) and `evals/run.py`, then get a baseline
out of the prototype's `parse.py` **before** writing a single Claude call — the
roadmap is explicit that the baseline comes first, and there's no way to tell
whether the AI pipeline is an improvement without it. `ANTHROPIC_API_KEY` in
`.env.local` is still empty, and the key belongs in an edge function rather than
the client, so that's the point at which Danny gets asked for one.

---

## 2026-08-24 — Phase 3 started: the target-math module, checked against Danny's real numbers

Unattended scheduled run. Checked QUESTIONS.md first — every OPEN item still has
an empty `**Danny:**` line, nothing to act on. All of Phase 1/2's remaining work
(phone test, the sign-in root-cause answer, redirect URLs, social sign-in) is
still his. Phase 3 is the next unblocked build work, per every prior entry's
"Next run" note, and the full phase (seven onboarding screens, target math,
editable targets, the safety floor) is too big for one session — picked the
piece that stands alone and is checkable without any UI: the calorie/macro
math itself.

- **Built `mobile/src/lib/targets.ts`**: Mifflin-St Jeor BMR, an activity tier
  (steps + lifting days + cardio minutes → one of the standard 1.2-1.9 PAL
  multipliers), a goal-based calorie adjustment (cut -500 / recomp -250 /
  bulk +300 / track +0 — standard sports-nutrition ranges, not tuned to
  anyone), a macro split anchored to bodyweight (1 g protein/lb, 0.45 g
  fat/lb, both rounded to the nearest 5g, carbs fill the rest), and the
  ~1,200-calorie floor warning PRODUCT.md requires, worded plainly rather than
  as a scold. Pure functions, no React Native imports, so it types and runs on
  its own.
- **Verified against a real worked example, not just types.** Danny's own
  stats are already on record: `../calorie-tracker/data/log.json` has his
  actual targets (2900 cal / 180P / 365C / 80F) and
  `memory/danny-fitness-profile.md` has the inputs (23M, 5'10", 179 lb, ~10k
  steps/day, 4 lifting days/week, 12 mi/week running) and the BMR that was
  computed for him at the time (1,813). Ran the new module against those exact
  inputs (`node`'s built-in TS stripping, no new dependency installed):
  - **BMR: 1,813.18 → rounds to 1,813.** Exact match to the number on record.
  - **Protein 180g, fat 80g — exact match.** The bodyweight-anchored split
    (179 lb × 1.0 → round5 → 180; 179 × 0.45 → round5 → 80) reproduces his
    real macros precisely.
  - **Calories: 2,878 vs. the real 2,900 — 22 kcal off (0.8%).** Activity
    tiered as "very active" (his steps/lifting/cardio put him at 5.9 of the
    tier scale's 7-point "very" cutoff), giving TDEE 3,128; the -250 recomp
    adjustment lands at 2,878. **Carbs came out 360g vs. the real 365g** —
    entirely downstream of that same 22-calorie gap (22/4 ≈ 5g), not a
    separate error; the fill-the-rest formula is correct given its calorie
    input.
  - This is expected, not a bug to chase: the real 2,900 was never derived
    from a documented formula (no activity-multiplier or goal-delta logic
    exists anywhere in the repo or the plan doc), so there was nothing to
    reverse-engineer exactly. What matters is that the pieces that **are**
    fully specified (the Mifflin-St Jeor constant, the bodyweight macro
    split) reproduce his real numbers exactly, and the one piece that had to
    be designed from scratch (activity tier → TDEE → goal delta) lands within
    1% using standard, explainable constants rather than anything hand-fit to
    this one data point. Flagging rather than claiming an exact match the
    module doesn't actually produce.
  - Also checked: `ageYearsFromBirthDate()` against a same-year and
    not-yet-had-birthday date (both correct), and the floor warning fires
    with plain, non-alarming copy for a case built to trip it (110 lb,
    sedentary, cutting → 956 cal).
  - `tsc --noEmit` clean.
- **Not built this run**: the seven onboarding screens themselves, wiring this
  module into a screen that "shows the arithmetic," writes to
  `target_history`, or the goal-weight/BMI half of the safety floor (there's
  no goal-weight field on `profiles` yet — that's an onboarding-screen
  decision about what to ask, not something this module needed to guess at).
  ROADMAP.md's Phase 3 box for this item stays unchecked; only the module
  itself is done and verified.

**Next run:** check QUESTIONS.md first, as always. If still nothing's
answered, build the onboarding screens on top of `targets.ts` — screens 1-5
collect the inputs the module already takes (sex/age, height/weight, steps,
training, goal), screen 6 renders `calcTargets()`'s output with the BMR →
activity → goal arithmetic laid out line by line (the module's return shape
already separates `bmr`/`tdee`/`goalAdjustment`/`calories` for exactly this),
and screen 7 is the first natural-language log — which is Phase 4 work, so
stub it as a manual entry for now rather than pulling AI logging in early.
`target_history` writes and the goal-weight safety floor can follow once
there's a screen that asks for a goal weight at all.

---

## 2026-08-23 (later still) — one sign-in bug fixed, the other closed off from two directions

Unattended scheduled run. Picked up exactly where the last entry said to:
the two sign-in bugs Danny hit were the first item in QUESTIONS.md.

- **The 60s resend throttle no longer reads as a failure.** Both the "Send me
  a code" button and the "Resend code" link now disable for 60 seconds after
  a send and show a live countdown ("Resend in 43s"). If a 429 gets through
  anyway — the cooldown is client-side state, so a reload right after sending
  would lose it — the app parses the wait out of Supabase's own message
  (`/after (\d+) seconds?/i`) and starts the countdown from that exact number
  instead of guessing 60, with plain copy ("One code a minute. Try again in
  Ns.") replacing the raw wording. Built in `sign-in-screen.tsx`; no change
  needed to `auth-context.tsx` for this one.
  - Caught one bug in my own fix before it shipped: the countdown's
    `setInterval` never stopped itself at zero, so it would have kept firing
    a state update every second for the rest of the session once any cooldown
    had ever started. Fixed to clear itself once `Date.now() >= until`.
- **The session-restore bug got two defensive fixes, not a full diagnosis** —
  the root cause still needs Danny's one-question answer in QUESTIONS.md
  (same browser as the leftover preview tab, or not), which nothing here can
  substitute for. But both fixes are worth having regardless, per the queued
  "worth doing either way" note:
  - `signOut()` now passes `{ scope: 'global' }` explicitly. It turns out this
    was already the supabase-js default in this version — checked
    `GoTrueClient.js` directly rather than assuming — so behavior doesn't
    change, but intent is now explicit and it can't silently regress if a
    future supabase-js version flips its default.
  - **The sign-in screen is now authoritative.** `AuthProvider` tracks whether
    *this tab* just asked for a session (code verified, password submitted, a
    magic-link/OAuth redirect handled) via a ref set around each of those
    calls. If `onAuthStateChange` delivers a session this tab never asked for,
    while the tab currently holds no session, it's treated as stale litter —
    signed out again immediately instead of silently accepted. This is the
    exact shape of the leading theory: a stale tab's token-refresh timer
    rewriting the shared session and this tab picking it up.
  - **Caught a serious bug in this fix before shipping it, by reading the
    library instead of assuming its behavior.** The first version gated on
    "any session that appears while `hasSessionRef.current` is false," full
    stop. But `onAuthStateChange` always fires once synchronously on
    registration with whatever session Supabase already restored from
    storage — confirmed by grepping `GoTrueClient.js` for `_emitInitialSession`
    rather than trusting the docs' summary of it. That event carries a real,
    legitimate session on nearly every normal app reopen. Without an
    exemption, the fix would have signed every user out the instant they
    reopened the app — a bug far worse than the one being fixed, and one that
    would have shipped straight to Danny's phone the next time he opened it.
    Fixed by exempting the `'INITIAL_SESSION'` event by name; the guard now
    only fires on `SIGNED_IN`/`TOKEN_REFRESHED`-shaped events, which is what a
    cross-tab broadcast actually replays.
  - The two fixes reinforce each other: with `signOut()` now revoking
    server-side, a stale tab's next refresh attempt should fail outright
    rather than succeed and broadcast a new session — so the listener guard
    is now a backstop for a path that shouldn't be reachable at all, not the
    only line of defense.
- **Verified**: `tsc --noEmit` clean and `expo export --platform web` bundled
  clean (860 modules, no errors) after every change, including the two
  self-caught bugs above. **Not verified**: actually watching the countdown
  tick down or the stale-tab scenario in a running app — this is an
  unattended run and `preview_start` was refused for the same reason prior
  entries record (nobody present to approve a dev server). Traced through the
  code carefully instead, including reading the actual auth-js source rather
  than assuming its behavior, but this still needs eyes on a real session the
  next time someone's driving the app by hand.
- Did not touch the queued "drop `{{ .ConfirmationURL }}` from the Magic Link
  template" suggestion — that's a Supabase dashboard change, still Danny's.

**Next run:** if Danny's answered the one question in QUESTIONS.md, close out
that item. Either way, Phase 3 (onboarding, Mifflin-St Jeor targets) is the
next unblocked build work — nothing in Phase 1/2 is waiting on anything except
Danny opening the app on his phone.

---

## 2026-08-23 (night) — signed in for the first time, and three bugs that only showed up there

**The app has now been used, not just bundled.** Every prior entry carried the
same caveat — verified at the type/query level, never actually signed into.
That's finally gone. Full loop proved end to end: requested a code in the real
UI, it was delivered through Danny's newly-configured Gmail SMTP, read back out
of his inbox, typed into the app, and it landed on `/today` signed in with his
real targets (2200 / 165P / 220C / 70F) from the database.

Getting there took two fixes on Danny's side and turned up three of mine.

- **SMTP host mixup (his, and partly my fault).** Every send failed with a 500
  and the useless client message "Error sending magic link email". `auth_logs`
  had the truth: `dial tcp: lookup daniel.sheehan03@gmail.com: no such host` —
  his email address was in the **Host** field, so GoTrue was dialling a mail
  server named after his address. I'd handed him the settings as a table without
  flagging that Host is the only field that *isn't* his email. Fixed in
  QUESTIONS.md. **Rule learned: diagnose email failures from `auth_logs`, never
  from the client error.** Useful tell that custom SMTP is actually live —
  auth_logs prints `updating Email limiter from 2/1h to 30` on reload.
- **The OTP is 8 digits here, not 6 — and I'd hardcoded 6.** The first real
  email read `Your SNACK TRACK code is: 18027152`. My input did
  `.slice(0, 6)` and validated `/^\d{6}$/`, so it would have silently truncated
  a valid code to `180271` and rejected it. This is exactly the class of bug
  that only appears when you use the thing. Fixed to accept `\d{6,10}` and
  slice at 10 rather than swapping one hardcoded number for another, since the
  length is a configurable Supabase setting.
- **Search returned rows nobody could identify.** With 399,293 branded products
  now in `foods`, searching "quest bar" returned a row displaying only
  **"APPLE PIE"**. `lib/foods.ts` was selecting `brand` and the modal was
  throwing it away. Now renders `QUEST BAR · 300 cal / 100 g`. Every branded
  row has a brand (399,293/399,293), so this affects all of them.
- **Tab bar rendered as "⏷⏷Today ⏷⏷Week"**. No `tabBarIcon` was set, so React
  Navigation drew a placeholder that reads as a broken asset on web. Suppressed
  the icon slot explicitly rather than installing an icon font for two glyphs.
  Caught myself first "fixing" this by writing a comment explaining the
  behaviour was intentional, which changed nothing — the absent icon *was* the
  bug.
- **Verified working, by eye and by data**: Today (macro bars, water card at
  0/64 oz with the +8oz and custom controls, four meal sections), Week (streak
  empty-state, 7-day chart with the goal line, avg/total/on-target stats, and a
  per-day breakdown), and search across all 407,086 foods returning sensible
  branded matches for quest bar / starbucks / oreo / chobani / chicken breast.
  "starbucks" returned **zero** before the branded load; it returns real
  products now.
- **Tooling note**: the biometric lock correctly does not appear on web —
  `getBiometricKind()` returns `none` there — so the lock UI is still unverified
  by eye and still needs a device.

**Danny used it himself right after this, and found two sign-in bugs.** Both are
written up at the top of QUESTIONS.md and are the first work for the next run:

1. **A session restored without a code being entered.** Diagnosed from
   `auth_logs` rather than guessed, and the evidence *rules out* the obvious
   explanation: there is no `Login` event and no successful `/verify` after the
   agent's own 03:29:01 sign-in, so the still-present magic link in the email
   was not followed — that path always writes a `/verify` + `Login` pair.
   No new authentication happened at all; the app restored a session already in
   the browser. Leading theory is agent litter: **I left a signed-in preview tab
   open on localhost:8081**, and supabase-js refreshes its token on a timer and
   writes it back to the shared `localStorage`, so it could have rewritten the
   session moments after Danny's `signOut()` cleared it. One question to Danny
   (same browser? tab still open?) settles whether it's a real bug.
2. **The 60s resend throttle reads as a failure** — Supabase returns 429 "you
   can only request this after 19 seconds" and the app passes the raw message
   straight through with no countdown and no disabled state. Confirmed in the
   logs at 03:35:40. Straightforward to fix, no decisions needed.

**Next run:** clear those two first. After that the phone is the only thing
between this and Phase 2 being genuinely done, and Phase 3 (onboarding,
Mifflin-St Jeor targets) is the open build work. Google sign-in still needs a
free OAuth client from Danny; Apple still ties to the $99.

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
