-- Search the brand as well as the name.
--
-- SR Legacy bakes the brand into the name ("Yogurt, Greek, plain, CHOBANI"),
-- so name-only search looked fine on 7,793 rows. Branded USDA data does not:
-- a Quest bar is stored as name "PROTEIN BAR, COOKIES & CREAM" with brand
-- "QUEST BAR" in its own column. Searching "quest protein bar" therefore
-- matched nothing at all, despite ~230 Quest products being loaded.
--
-- A stored generated column keeps name and brand in one indexable string, so
-- the trigram GIN index still does the work. It replaces the name-only index
-- rather than adding to it -- nothing searches name alone any more.
alter table public.foods
  add column search_text text
  generated always as (name || ' ' || coalesce(brand, '')) stored;

create index foods_search_trgm_idx
  on public.foods using gin (search_text extensions.gin_trgm_ops);

drop index if exists public.foods_name_trgm_idx;

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
    and f.search_text ilike '%' || p.first_word || '%'
    and f.search_text ilike all (p.pats)
  order by
    (lower(f.name) = p.needle) desc,
    (lower(f.name) like p.needle || '%') desc,
    (f.source = 'usda') desc,
    length(f.search_text) asc,
    f.name asc
  limit greatest(1, least(lim, 50));
$$;

revoke all on function public.search_foods(text, int) from public;
revoke all on function public.search_foods(text, int) from anon;
grant execute on function public.search_foods(text, int) to authenticated;
