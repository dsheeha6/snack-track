-- Where a resolved match actually goes. Until now parse-meal could return a
-- food_id and the app had nowhere to put it, which is why the client asked for
-- resolve:'none' -- the lookup was a round trip that bought nothing.
--
-- Nullable on purpose and forever: resolve_food returns nothing whenever it is
-- not confident, manual entries have no food row at all, and the calorie and
-- macro numbers on the entry never depend on this column. It records which
-- catalogue row this entry was matched to, nothing more.
--
-- on delete set null, not cascade: re-seeding `foods` must never delete a day
-- of someone's food log.
alter table public.entries
  add column food_id uuid references public.foods (id) on delete set null;

comment on column public.entries.food_id is
  'Catalogue row this entry was matched to, when resolve_food was confident. Never affects the entry''s own macros.';
