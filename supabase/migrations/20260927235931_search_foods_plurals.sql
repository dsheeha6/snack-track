-- Plurals (2026-09-25): every query word had to appear as typed, so "eggs"
-- never matched "Egg, whole" and "apples" missed "Apple, raw". Words are now
-- matched on a light stem: -ies/-oes/-s trimmed (not -ss/-us/-is: "hummus",
-- "glass"), with length guards so short words survive ("fries" -> "frie").
-- A new rank key prefers rows whose first word IS the stem, so "chips" no
-- longer returns "Chipotle dip" ahead of chips. Otherwise as generic_first.
create or replace function public.search_foods(q text, lim integer default 20)
returns setof foods
language sql
stable
set search_path = public, extensions
as $function$
  with parsed as (
    select btrim(lower(q)) as needle,
           array(select case
                          when length(w) > 5 and w ~ 'ies$' then left(w, -3)
                          when length(w) > 4 and w ~ 'oes$' then left(w, -2)
                          when length(w) > 3 and w ~ 's$' and w !~ '(ss|us|is)$' then left(w, -1)
                          else w end
                 from unnest(string_to_array(btrim(lower(q)), ' ')) as w
                 where w <> '') as stems
  )
  select f.*
  from public.foods f, parsed p
  where length(p.needle) >= 2
    and f.search_text ilike '%' || p.stems[1] || '%'
    and f.search_text ilike all (array(select '%' || s || '%' from unnest(p.stems) as s))
  order by
    (f.source in ('usda', 'usda_fndds')) desc,
    (lower(f.name) = p.needle) desc,
    (lower(f.name) like p.needle || '%') desc,
    (lower(f.name) ~ ('^' || p.stems[1] || '(s|es|ies|y|ie)?\y')) desc,
    (select count(*)
       from unnest(regexp_split_to_array(lower(split_part(f.name, ',', 1)), '[^a-z0-9]+')) as w
      where length(w) >= 2 and position(w in p.needle) = 0) asc,
    length(f.search_text) asc,
    f.name asc
  limit greatest(1, least(lim, 50));
$function$;
