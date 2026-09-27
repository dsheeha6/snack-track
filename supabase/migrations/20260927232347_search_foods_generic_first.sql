-- Generic foods first (SR Legacy + FNDDS), then how well the name fits.
--
-- Before: a branded row whose name exactly equals the query won outright, so
-- "lasagna" -> "IGA LASAGNA", "banana" -> a product called "BANANA" ahead of
-- raw bananas. With FNDDS loaded there is now a generic answer for everyday
-- meals, and a generic query deserves it. Brand queries ("quest bar",
-- "chobani") are unaffected: no generic row contains the brand word, or the
-- SR row that does is the brand's own product.
--
-- "Fewest extra words in the name's first comma segment" puts "Rice, white,
-- cooked" ahead of "Beans and white rice" for "white rice". Measured 281 ms
-- for "chicken" (16.7k matches); the subquery only runs on the rows left after
-- the cheap sort keys.
--
-- Known gap: plurals. "eggs" doesn't match "Egg, whole, ..." at all.
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
    (f.source in ('usda', 'usda_fndds')) desc,
    (lower(f.name) = p.needle) desc,
    (lower(f.name) like p.needle || '%') desc,
    (select count(*)
       from unnest(regexp_split_to_array(lower(split_part(f.name, ',', 1)), '[^a-z0-9]+')) as w
      where length(w) >= 2 and position(w in p.needle) = 0) asc,
    length(f.search_text) asc,
    f.name asc
  limit greatest(1, least(lim, 50));
$function$;
