-- Candidate generic foods for a sentence, for parse-meal's database-first path.
--
-- resolve_food answers "which single row IS this" and is right to be picky, but
-- its single best guess is often the wrong variant for numbers ('white rice' ->
-- glutinous, 'chicken breast' -> deli roll). So instead of trusting one row, the
-- parse gets a short numbered list per food word and the model picks the row
-- that is the food as eaten, or none. SR Legacy only (7,793 generic foods, per
-- 100 g); branded rows are a later step.
--
-- Recovered from supabase_migrations.schema_migrations on 2026-09-25: applied
-- 2026-09-23 but never committed. Superseded by 20260923014621_food_candidates_tighten.
create or replace function public.food_candidates(words text[], per_word int default 10, max_rows int default 60)
returns table (id uuid, name text, calories numeric, protein numeric, carbs numeric, fat numeric)
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
    select f.id, f.name, f.calories, f.protein, f.carbs, f.fat, w.w,
           (select count(*) from w w2 where f.name ~* w2.re) as overlap,
           (split_part(f.name, ',', 1) ~* w.re) as head,
           (f.name ~* '\y(babyfood|infant|imitation|dehydrated|powder|powdered|freeze-dried|industrial|commodity|school)\y') as odd
    from w
    join public.foods f
      on f.source = 'usda'
     and (split_part(f.name, ',', 1) || ',' || split_part(f.name, ',', 2)) ~* w.re
  ),
  ranked as (
    select h.*, row_number() over (partition by h.w
             order by h.overlap desc, h.head desc, h.odd asc, length(h.name) asc) as rn
    from hits h
  )
  select distinct on (r.id) r.id, r.name, r.calories, r.protein, r.carbs, r.fat
  from ranked r
  where r.rn <= per_word
  order by r.id
  limit max_rows;
$fn$;

revoke all on function public.food_candidates(text[], int, int) from public;
revoke all on function public.food_candidates(text[], int, int) from anon;
grant execute on function public.food_candidates(text[], int, int) to authenticated;
grant execute on function public.food_candidates(text[], int, int) to service_role;
