-- Ranked food search.
--
-- Before ~399k branded products landed, `foods` was 7,793 rows and the client
-- could get away with `ilike '%q%' order by name limit 20`. It can't now: an
-- alphabetical sort over hundreds of thousands of packaged goods buries the
-- clean whole-food row under brand names that merely sort earlier. Searching
-- "chicken breast" has to return chicken breast, not a frozen entree that
-- happens to start with "A".
--
-- Ranking, in order: exact name match, then prefix match, then whole foods
-- (source='usda') ahead of packaged ones for generic terms, then the shortest
-- name -- short names are the generic entries, long ones are marketing copy.
--
-- security invoker (the default) matters: this returns setof public.foods, so
-- the caller's RLS still applies rather than being bypassed.
create or replace function public.search_foods(q text, lim int default 20)
returns setof public.foods
language sql
stable
set search_path = public, extensions
as $$
  select f.*
  from public.foods f
  where length(btrim(q)) >= 2
    and f.name ilike '%' || btrim(q) || '%'
  order by
    (lower(f.name) = lower(btrim(q))) desc,
    (lower(f.name) like lower(btrim(q)) || '%') desc,
    (f.source = 'usda') desc,
    length(f.name) asc,
    f.name asc
  limit greatest(1, least(lim, 50));
$$;

-- Callable by signed-in users only. anon gets nothing, matching the "read
-- foods" policy, and the earlier hardening pass that revoked EXECUTE on the
-- trigger functions from anon/authenticated.
revoke all on function public.search_foods(text, int) from public;
revoke all on function public.search_foods(text, int) from anon;
grant execute on function public.search_foods(text, int) to authenticated;
