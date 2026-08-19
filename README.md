# SNACK TRACK

The real app. The working prototype lives next door in `../calorie-tracker` and
stays running — it's the eval harness and the daily driver until this replaces it.

- `PRODUCT.md` — what this is and what it refuses to be. Read first.
- `ROADMAP.md` — the work queue, in order
- `BUILD_LOG.md` — what's actually been done, newest first
- `QUESTIONS.md` — things only Danny can decide or do
- `docs/` — specs: API contract, prompts, screens
- `db/` — schema and migrations
- `evals/` — the accuracy test set and harness

A scheduled agent works on this daily, commits to the `build` branch, and never
touches `main`. Review with `git log build` and merge when you're happy.

Plan: https://claude.ai/code/artifact/098c2efa-faa4-4f9c-a5e4-d4783dc9b4c9
