-- Match every word, in any order, instead of the phrase verbatim.
--
-- The first version required the words to be adjacent, so "quest protein bar"
-- found nothing at all even though "QUEST BAR, PROTEIN" is right there. People
-- type words in whatever order they think of them, so each word now has to
-- appear somewhere in the name, order irrelevant.
--
-- The first word keeps its own plain ilike so the planner can still drive the
-- trigram GIN index off it and filter the rest of the words against the far
-- smaller candidate set, rather than scanning all ~407k rows.
create or replace function public.search_foods(q text, lim int default 20)
returns setof public.foods
language sql
stable
set search_path = public, extensions
as $$
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
    and f.name ilike '%' || p.first_word || '%'
    and f.name ilike all (p.pats)
  order by
    (lower(f.name) = p.needle) desc,
    (lower(f.name) like p.needle || '%') desc,
    (f.source = 'usda') desc,
    length(f.name) asc,
    f.name asc
  limit greatest(1, least(lim, 50));
$$;

revoke all on function public.search_foods(text, int) from public;
revoke all on function public.search_foods(text, int) from anon;
grant execute on function public.search_foods(text, int) to authenticated;
