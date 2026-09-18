# What SNACK TRACK is

**A calorie tracker that is simple, easy, and doesn't judge you.**

That's the whole product. Read this before making any decision about features,
copy, or design — if a change doesn't serve one of those three words, it doesn't
go in.

## Who it's for

Anyone who wants to know what they're eating. Losing, gaining, maintaining, or
just curious — all four are equally valid and the app treats them the same. It is
not a weight-loss app. It is not a bodybuilding app. Someone tracking out of plain
curiosity should never feel like a second-class user.

## The three promises, and what they actually mean

### Simple
The core loop is: say what you ate, see where you are. Everything else is
secondary and should stay out of the way until asked for.

- If a feature needs a tutorial, it's too complicated.
- Default screens show calories and the three macros. Nothing else.
- No feature gets added to the main screen without one being considered for removal.
- Micronutrients, glycemic index, food grades, meal timing science — no. Not a
  "later" — a no.

### Easy
Logging has to take seconds, or people stop.

- Typing a sentence is the fastest path and stays the primary one.
- Second fastest is re-logging something you've eaten before. Favourites, recents,
  and "same as yesterday" matter more than any new feature.
- Never make someone hunt through a database when they've already told us what
  they ate.
- Any flow that takes more than three taps for a repeat meal is a bug.

#### The bet: accuracy from vague descriptions
**Danny's direction, 2026-09-17.** The input method is settled — you say what you
ate, in your own words, and it lands. What the product invests in from here is
**how accurate that is when the description is vague, casual, or a real
restaurant meal nobody has a nutrition label for.** That is the thing worth
being best in the world at.

The standard is a sentence like this one, which is a real meal and the working
benchmark:

> dinner at Marcel in Atlanta — their reserve burger, serving of caesar salad,
> steak tartare, pommes aligot, baguette, bread service, brie, gelato, and a
> glass of wine

Eleven items, an independent restaurant with no published nutrition, named
dishes that aren't generic ("pommes aligot" is not "potatoes"), and two items
that are the same food said two ways. Danny ran it and reports it did well.
"Did well" isn't the bar — *measurably better, meal after meal* is.

- **Photo logging is not the priority, and saying so is the point.** A photo is
  easy, but typing or speaking is just as easy, carries what a camera can't
  (the restaurant, the dish name, the size you actually ate), and is a cleaner
  problem for the model. Camera input is not on the "not building" list; it is
  simply not where the effort goes.
- **This is measured, not asserted.** `evals/meals.jsonl` is the instrument, and
  it currently under-represents exactly this case. See ROADMAP.
- **Accuracy work must not cost simplicity.** Anything that makes the sentence
  box slower, chattier, or more interrogative to buy accuracy is the wrong
  trade — that includes follow-up questions.

### No judgement
This is the differentiator and the thing most trackers get wrong.

- **No red states for going over.** Over is information, not failure. Show the
  number plainly and move on.
- **No shaming copy. Ever.** Not in empty states, not in notifications, not in
  streak breaks. Never "you blew it", "oops", "you were over again", or a sad face.
- **No moralised food language.** No "good"/"bad", "clean", "cheat", "guilt-free",
  "earn it", "burn it off". Food is food.
- **No comparison to other users.** No leaderboards, no social feed, no averages
  that imply a norm.
- **Missing a day is fine.** Coming back after a week off gets a normal screen,
  not a guilt trip about the broken streak.
- **Anyone can hide the numbers.** A setting to track habits without seeing
  calories, for people who need distance from the count.
- **The floor is real.** Warn under ~1,200 calories. Don't accept a goal weight
  below a healthy BMI. This isn't legal cover, it's the product working correctly.

Practical test for any string in the app: would it feel bad to read on a day
someone already feels bad? If yes, rewrite it.

## What we are deliberately not building

Saying no is what keeps it simple. Not now, not later, unless the positioning
changes:

- Social features, friends, sharing, feeds
- Food grades, scores, or colour-coded "healthiness"
- Before/after photos or body measurements beyond weight
- Exercise logging as a chore (activity comes from Apple Health, silently)
- Meal plans, recipes as a content library, coaching, "programs"
- Anything that ranks users against each other

## Getting people in, and keeping them

**Danny's direction, 2026-09-17, recorded ahead of the work.** What he's asking
for: design good enough that it draws people in on sight, an onboarding that
sets someone up properly, **creative incentives for using the app**, high
retention and daily usage, low churn — and a lot of inspiration taken from
**Duolingo**.

Duolingo is the right thing to study and the wrong thing to copy wholesale, so
here is the line, because a future decision will turn on it.

**Take the craft.** Duolingo is the best in the world at several things this app
genuinely needs: an onboarding that reaches the first real moment of value in
under a minute; a loop so short and legible you always know what "done for
today" means; a visual identity with a character and a sense of humour that
makes a chore feel like a place you want to be; and celebration that lands —
real, specific, generous acknowledgement when someone does the thing.

**Refuse the coercion.** A large part of Duolingo's engagement machine runs on
guilt: streak anxiety, loss-framed notifications, leaderboards and demotion,
a mascot that performs disappointment. Every one of those is already forbidden
here, not as a stylistic preference but as the product's whole differentiator —
see No judgement above, and the "not building" list, which rules out ranking
users against each other. **A calorie tracker that makes you feel bad is the
default product on the App Store. That's what we're not.**

The practical test for any retention idea, and it's a strict one: **does it work
on someone who has just come back after two weeks off?** If the mechanic needs
them to feel bad about the gap to function, it's out. If it makes coming back
feel easy and worth it, it's in. Streaks are already built and stay — a streak
that counts up quietly is fine; a streak that guilts you when it breaks is not.

Incentives specifically are unscoped and Danny's call. Two notes for whoever
scopes them: the honest ones here reward *logging*, not weight change or eating
"well", because the app doesn't rank food or people. And anything with a
referral or challenge shape overlaps `marketing/MARKETING.md`, so scope the two
together rather than inventing a second version of the same idea.

## The look

Hand-drawn, bright, slightly off. It should feel like a good food brand — Graza,
the oat milk cartons, the Australian peanut butter — not like a medical device or
a fitness app. Warm, a bit silly, clearly made by a person.

**Danny's fuller reference set, 2026-09-17.** Same direction, said with more
precision, and worth having in the room when the design pass finally happens.
Graza, the Australian peanut butter, and **Doodle Jump** — that last one matters
because it's a *product* doing this, not a package, so it shows how the look
behaves when it has to be tapped rather than picked up off a shelf. Plus five
named currents, all of which are the same instinct from different angles:

- **Analogue / handcrafted** — real mark-making. Charcoal, visible texture, raw
  imperfection left in rather than cleaned up.
- **Doodle art / conceptual sketch** — spontaneous lines, naive freeform shapes,
  unpolished energy. Childlike, not childish.
- **"Toasty" logos** — soft edges, hand-touched quirks, rounded type, earthy
  comforting colour. The stated goal is that it feels like a warm handshake,
  which is a good test for a calorie tracker specifically.
- **Elemental folk** — hand-drawn flora and fauna, folk iconography, rustic
  artisanal typography.
- **Illustrative branding** — custom icons, characters and lettering woven into
  one identity that tells a story, rather than decoration applied on top.

The through-line, and the thing to hold onto when picking between them: **the
imperfection has to be real, not a filter.** A wobble applied uniformly by code
reads as a texture; a wobble that's different every time reads as a hand. And
none of it is allowed to make a number harder to read — this is an app someone
checks at a restaurant table.

Taken from the working prototype (`../calorie-tracker/index.html`), which is the
reference implementation:

| Token | Value | Used for |
|---|---|---|
| cream | `#FFF3D6` | page background |
| paper | `#FFFCF2` | cards |
| ink | `#1E1B16` | text, all borders |
| green | `#12A150` | primary actions, on-target |
| lime | `#C9E870` | highlights, accept buttons |
| yellow | `#FFC53D` | breakfast, questions, callouts |
| coral | `#FF6B4A` | over target, delete — **never as a scold** |
| pink | `#FF9EC4` | snacks, week section |
| teal | `#2BB5AF` | dinner, fat macro |
| blue | `#4C7DFF` | quick add |
| purple | `#9B6BFF` | suggestions |
| clay | `#E8663C` | logo accent |

Type: `"Ink Free", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive` for
display and numbers; a plain system sans for body text.

The hand-drawn language: 3px ink borders, irregular border-radius so edges wobble,
hard offset shadows, cards rotated half a degree, dashed dividers, tape labels on
section corners.

**Porting note:** the wobble comes from CSS `border-radius` with four different
values per corner, which React Native does not support. Recreating this in the app
will need SVG borders or nine-slice images. Budget real time for it — the look is
the brand, and a flat rounded-rectangle version of this app is a different product.
Design changes are fine later, as long as the core loop works first.

## How to settle an argument

In this order:

1. Does it make logging faster or simpler? Ship it.
2. Could it make someone feel judged? Don't ship it.
3. Is it in the "not building" list? Don't ship it.
4. Does it work before it's pretty? Ship it, make it pretty later.
