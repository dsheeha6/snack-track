-- FNDDS (source='usda_fndds', foods as eaten: "Peanut butter and jelly
-- sandwich") ranks with SR Legacy whole foods, ahead of packaged products.
-- Before this, "grilled cheese" would sort a generic sandwich among 399k
-- branded rows by name length. Same body otherwise.
-- Superseded within the hour by 20260927232347_search_foods_generic_first.
create or replace function public.search_foods(q text, lim integer default 20)
returns setof foods
language sql
stable
set search_path = public, extensions
as $function$
  with parsed as (
    select btrim(lower(q)) as needle,
           (array_remove(string_to_array(btrim(lower(q)), ' '), ''))[1] as first_word,
           array(select '%' || w || '%'
                 from unnest(string_to_array(btrim(lower(q)), ' ')) as w
                 where w <> '') as pats
  )
  select f.*
  from public.foods f, parsed p
  where length(p.needle) >= 2
    and f.search_text ilike '%' || p.first_word || '%'
    and f.search_text ilike all (p.pats)
  order by
    (lower(f.name) = p.needle) desc,
    (lower(f.name) like p.needle || '%') desc,
    (f.source in ('usda', 'usda_fndds')) desc,
    length(f.search_text) asc,
    f.name asc
  limit greatest(1, least(lim, 50));
$function$;
