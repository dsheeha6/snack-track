-- Same rules, as PL/pgSQL. The SQL version could not be made fast: the match
-- patterns were computed in a CTE, so they were join columns rather than plan-time
-- values, and the planner could not push them into the trigram index (a literal
-- version of the same scan ran in 27ms; the CTE version took 1.3-5.6s).
-- As local variables they become query parameters, and pg_trgm accelerates the
-- regex match itself, so the ILIKE prefilter is redundant and is gone.
--
-- The rules, unchanged, and why each exists:
--   1. Word-boundary matching -- search_foods' ILIKE '%apple%' matched inside
--      words ('apple' -> PINEAPPLE SALSA, 'green beans' -> SOYBEANS).
--   2. The head noun must head the food. USDA names are 'Head, qualifier',
--      so 'chicken' must not reach 'Fat, chicken' (900 cal) nor 'wine'
--      'Vinegar, red wine'. Restaurant rows are 'CHAIN, item', so the head may
--      sit in the second segment when the query named the chain.
--   3. Whole foods are tried first and always win; a branded row is only ever
--      linked when the query named its brand and the name is not mostly words
--      the user never said.
-- Returning nothing is a valid answer: in 'estimate' mode the numbers are
-- Claude's either way, so a missing food_id costs nothing and a wrong one lies.
create or replace function public.resolve_food(q text)
returns setof public.foods
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_stems   text[];
  v_needle  text := lower(btrim(q));
  v_all     text;
  v_head    text;
  v_id      uuid;
begin
  select array(select case when length(w) > 3 and w like '%s' and w not like '%ss'
                           then left(w, length(w) - 1) else w end
               from unnest(regexp_split_to_array(v_needle, '[^a-z0-9]+')) as w
               where length(w) >= 3)
    into v_stems;

  if cardinality(v_stems) = 0 then
    select array(select w from unnest(regexp_split_to_array(v_needle, '[^a-z0-9]+')) as w
                 where length(w) >= 2)
      into v_stems;
  end if;

  if cardinality(v_stems) = 0 then
    return;
  end if;

  select '^' || string_agg('(?=.*\y' || w || '(e?s)?\y)', '') from unnest(v_stems) as w into v_all;
  v_head := '\y' || v_stems[cardinality(v_stems)] || '(e?s)?\y';

  -- whole foods first
  select g.id into v_id
  from public.foods g
  where g.search_text ~* v_all
    and g.brand is null
    and g.source = 'usda'
    and (split_part(g.name, ',', 1) ~* v_head
         or (split_part(g.name, ',', 2) ~* v_head
             and (select bool_and(v_needle ~* ('\y' || w || '\y'))
                    from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
                   where length(w) >= 3)))
  order by
    (split_part(g.name, ',', 1) ~* v_head) desc,
    (select bool_or(g.name ~* ('\y' || d || '\y') and v_needle !~* ('\y' || d || '\y'))
       from unnest(array['meatless','imitation','substitute','dried','dehydrated',
                         'powdered','babyfood','infant','yolk','leaves']) as d) asc,
    cardinality(array(select w from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
                      where length(w) >= 3)) asc,
    (select count(*) filter (
       where exists (select 1 from unnest(v_stems) as t
                     where w ~* ('\y' || t || '(e?s)?\y') or t ~* ('\y' || w || '\y'))
     )::numeric / greatest(count(*), 1)
     from unnest(regexp_split_to_array(lower(g.name), '[^a-z0-9]+')) as w
     where length(w) >= 3) desc,
    (g.name ~* '\y(raw|whole|plain|fresh|cooked)\y') desc,
    length(g.name) asc
  limit 1;

  -- only if no whole food matched: a branded row whose brand the user named
  if v_id is null then
    select g.id into v_id
    from public.foods g
    where g.search_text ~* v_all
      and g.brand is not null
      and g.name ~* v_all
      and split_part(g.name, ',', 1) ~* v_head
      and exists (select 1 from unnest(regexp_split_to_array(lower(g.brand), '[^a-z0-9]+')) as b
                  where length(b) >= 3 and v_needle ~* ('\y' || b || '\y'))
      and (select count(*) filter (
             where exists (select 1 from unnest(v_stems) as t
                           where w ~* ('\y' || t || '(e?s)?\y') or t ~* ('\y' || w || '\y'))
           )::numeric / greatest(count(*), 1)
           from unnest(regexp_split_to_array(lower(g.name), '[^a-z0-9]+')) as w
           where length(w) >= 3) >= 0.5
    order by
      cardinality(array(select w from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
                        where length(w) >= 3)) asc,
      length(g.name) asc
    limit 1;
  end if;

  if v_id is null then
    return;
  end if;

  return query select f.* from public.foods f where f.id = v_id;
end;
$$;

revoke all on function public.resolve_food(text) from public;
revoke all on function public.resolve_food(text) from anon;
grant execute on function public.resolve_food(text) to authenticated;
grant execute on function public.resolve_food(text) to service_role;
