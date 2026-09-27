-- food_candidates plus FNDDS (foods as eaten) and each row's standard portion,
-- for parse-meal's resolve:"fndds" A/B (2026-09-25). A new function rather
-- than a change to food_candidates so the measured resolve:"foods" path stays
-- exactly as it was. Same matching and ranking; differences:
--   - source in ('usda', 'usda_fndds')
--   - returns sugar, fiber, package_size, package_label so the model sees
--     "1 sandwich = 112 g" and code can price sugar/fiber from the row
--   - FNDDS "..., from restaurant" rows are kept (they're portions of real
--     restaurant dishes, per 100 g like everything else); SR's chain-prefixed
--     and "Fast foods"/"Restaurant" rows stay excluded as before.
create or replace function public.food_candidates_fndds(words text[], per_word int default 15, max_rows int default 80)
returns table (id uuid, name text, calories numeric, protein numeric, carbs numeric, fat numeric,
               sugar numeric, fiber numeric, package_size numeric, package_label text)
language sql
stable
set search_path = public, extensions
as $fn$
  with w as (
    select distinct lower(x) as w,
           case when lower(x) ~ '[^aeiou]y$'
                then '\y(' || lower(x) || 's?|' || left(lower(x), length(x) - 1) || 'ies)\y'
                else '\y' || lower(x) || '(s|es)?\y' end as re
    from unnest(words) as x
    where x ~ '^[a-z]{3,}$'
  ),
  hits as (
    select f.id, f.name, f.calories, f.protein, f.carbs, f.fat, f.sugar, f.fiber,
           f.package_size, f.package_label, w.w,
           (select count(*) from w w2 where f.name ~* w2.re) as overlap,
           (split_part(f.name, ',', 1) ~* w.re) as head,
           (f.name ~* '\y(babyfood|baby food|infant|imitation|meatless|dehydrated|powder|powdered|freeze-dried|industrial|commodity|school|mix|unprepared)\y') as odd
    from w
    join public.foods f
      on f.source in ('usda', 'usda_fndds')
     and (split_part(f.name, ',', 1) || ',' || split_part(f.name, ',', 2)) ~* w.re
     and f.name !~ '^[A-Z0-9''&.\- ]{3,},'
     and f.name !~* '^(fast foods|restaurant)\y'
  ),
  ranked as (
    select h.*, row_number() over (partition by h.w
             order by h.overlap desc, h.head desc, h.odd asc, length(h.name) asc) as rn
    from hits h
  ),
  best as (
    select distinct on (r.id) r.*
    from ranked r
    where r.rn <= per_word
    order by r.id, r.rn
  )
  select b.id, b.name, b.calories, b.protein, b.carbs, b.fat, b.sugar, b.fiber, b.package_size, b.package_label
  from best b
  order by b.rn, b.overlap desc, b.name
  limit max_rows;
$fn$;

revoke all on function public.food_candidates_fndds(text[], int, int) from public;
revoke all on function public.food_candidates_fndds(text[], int, int) from anon;
grant execute on function public.food_candidates_fndds(text[], int, int) to authenticated;
grant execute on function public.food_candidates_fndds(text[], int, int) to service_role;
