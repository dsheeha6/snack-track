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

## The look

Hand-drawn, bright, slightly off. It should feel like a good food brand — Graza,
the oat milk cartons, the Australian peanut butter — not like a medical device or
a fitness app. Warm, a bit silly, clearly made by a person.

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
