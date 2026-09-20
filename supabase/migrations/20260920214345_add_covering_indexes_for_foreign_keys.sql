-- Two foreign keys had no covering index.
--
-- entries.food_id arrived 2026-09-14 with the resolve_food link and never got
-- one. Without it, every delete or update of a public.foods row has to
-- sequential-scan entries to enforce `on delete set null` - cheap today at 31
-- rows, not cheap after a re-seed of the 407k-row foods table, which is exactly
-- what the sugar/fiber work will do.
--
-- target_history.user_id gets a composite rather than a bare FK index: it
-- covers the constraint and also matches the only read the table has, which is
-- "the latest target for this user". Same shape as entries_user_date_idx.

create index if not exists entries_food_id_idx
  on public.entries (food_id);

create index if not exists target_history_user_date_idx
  on public.target_history (user_id, effective_on desc);
