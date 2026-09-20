-- ---------- corrections: the AI path learning from being wrong ----------
-- When someone fixes a number in the "here's what I got" review list, that fix
-- is the most reliable nutrition data this app will ever have about that person:
-- they know what their protein shake is, and we don't. remember_food stores it
-- against the *clean name Claude returned*, not the raw sentence, because that
-- name is what is stable across retellings -- "2 eggz" and "some eggs" both come
-- back as "Eggs", and keying on raw text would learn nothing from the second.
--
-- security invoker (the default): RLS on personal_foods does the access control,
-- exactly as it does for a direct insert from the client. auth.uid() is the only
-- user id this function will ever write.
create or replace function public.remember_food(
  p_phrase text,
  p_name text,
  p_qty text,
  p_calories numeric,
  p_protein numeric,
  p_carbs numeric,
  p_fat numeric
)
returns public.personal_foods
language plpgsql
set search_path = public
as $$
declare
  rec public.personal_foods;
  key text := regexp_replace(btrim(lower(coalesce(p_phrase, ''))), '\s+', ' ', 'g');
begin
  if key = '' then
    raise exception 'remember_food needs a phrase';
  end if;

  insert into public.personal_foods
    (user_id, phrase, name, qty, calories, protein, carbs, fat)
  values
    (auth.uid(), key, p_name, nullif(btrim(coalesce(p_qty, '')), ''),
     p_calories, p_protein, p_carbs, p_fat)
  on conflict (user_id, phrase) do update set
    name = excluded.name,
    qty = excluded.qty,
    calories = excluded.calories,
    protein = excluded.protein,
    carbs = excluded.carbs,
    fat = excluded.fat,
    -- A re-correction is also a use: the person reached for this food again.
    times_used = personal_foods.times_used + 1,
    last_used_at = now()
  returning * into rec;

  return rec;
end;
$$;

revoke all on function public.remember_food(text, text, text, numeric, numeric, numeric, numeric) from public;
revoke all on function public.remember_food(text, text, text, numeric, numeric, numeric, numeric) from anon;
grant execute on function public.remember_food(text, text, text, numeric, numeric, numeric, numeric) to authenticated;

-- Recording that a stored correction got used again. Separate from remember_food
-- because using one changes no values -- and because times_used is what Phase 5's
-- "same as yesterday" and favourites will rank on, so it has to count uses, not
-- just edits. Silently does nothing when the phrase isn't stored, which is the
-- common case and not an error.
create or replace function public.touch_personal_food(p_phrase text)
returns void
language sql
set search_path = public
as $$
  update public.personal_foods
     set times_used = times_used + 1,
         last_used_at = now()
   where user_id = auth.uid()
     and phrase = regexp_replace(btrim(lower(coalesce(p_phrase, ''))), '\s+', ' ', 'g');
$$;

revoke all on function public.touch_personal_food(text) from public;
revoke all on function public.touch_personal_food(text) from anon;
grant execute on function public.touch_personal_food(text) to authenticated;
