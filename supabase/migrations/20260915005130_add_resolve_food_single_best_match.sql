-- Single-best food resolution for the AI logging path.
--
-- Deliberately separate from search_foods(): that one is the app's search box,
-- where recall is the point and a human picks from the list. This one answers
-- "which single row IS this food", and a wrong answer is worse than no answer,
-- because the id it returns gets stamped on the user's entry.
--
-- Four rules, in order of how much damage they prevent:
--   1. Word-boundary matching. search_foods uses ILIKE '%apple%', which matches
--      inside words: 'apple' hit PINEAPPLE SALSA and 'green beans' hit SOYBEANS.
--   2. The head noun (last word of the query) must head the FOOD, not qualify
--      something else. USDA names are 'Head, qualifier, qualifier', so 'chicken'
--      must not resolve to 'Fat, chicken' (900 cal) and 'wine' must not resolve
--      to 'Vinegar, red wine'. Restaurant rows are 'CHAIN, item', so the head may
--      also sit in the second segment -- but only when the query named the chain
--      ('chick-fil-a chicken sandwich'), which is what keeps qualifiers out.
--   3. The name may not be mostly words the user never said (coverage >= 0.5),
--      which is what stops 'big mac' landing on MAC & CHICKEN SAUSAGE BIG BOWL.
--   4. A branded row may only win when the query actually named the brand -- and
--      "named the brand" means the brand supplied a word the NAME did not. Testing
--      brand overlap alone fails badly, because brands contain food words:
--      CHICKEN OF THE SEA made 'chicken' resolve to SHRIMP, TURKEY HILL made
--      'turkey' resolve to MILK, and WATER MAGIC made 'water' resolve to PINA COLADA.
--
-- Returns zero rows when nothing clears the bar. That is the intended outcome,
-- not a failure: in the shipping 'estimate' mode the numbers are Claude's either
-- way, so a missing food_id costs nothing and a wrong one is a lie.
create or replace function public.resolve_food(q text)
returns setof public.foods
language sql
stable
set search_path = public, extensions
as $$
  select f.*
  from public.foods f
  where f.id = (
    with parts as (
      select s, s[cardinality(s)] as head, lower(btrim(q)) as needle
      from (
        select array(
          select case when length(w) > 3 and w like '%s' and w not like '%ss'
                      then left(w, length(w) - 1) else w end
          from unnest(regexp_split_to_array(lower(btrim(q)), '[^a-z0-9]+')) as w
          where length(w) >= 2
        ) as s
      ) t
      where cardinality(s) >= 1
    )
    select c.id
    from parts p
    join lateral (
      select g.id, g.name, g.brand, g.source,
             (select bool_and(g.name ~* ('\y' || w || '(e?s)?\y')) from unnest(p.s) as w) as in_name,
             (select bool_or(coalesce(g.brand, '') ~* ('\y' || w || '(e?s)?\y')
                             and g.name !~* ('\y' || w || '(e?s)?\y')) from unnest(p.s) as w) as brand_named,
             split_part(g.name, ',', 1) ~* ('\y' || p.head || '(e?s)?\y') as head_leads,
             cardinality(array(
               select w from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
               where length(w) >= 3)) as head_tokens,
             (select count(*) filter (
                where exists (select 1 from unnest(p.s) as t
                              where w ~* ('\y' || t || '(e?s)?\y') or t ~* ('\y' || w || '\y'))
              )::numeric / greatest(count(*), 1)
              from unnest(regexp_split_to_array(lower(g.name), '[^a-z0-9]+')) as w
              where length(w) >= 3) as coverage,
             (g.name ~* '\y(meatless|imitation|substitute|dried|dehydrated|powdered|babyfood|infant)\y') as is_derivative,
             (g.name ~* '\y(raw|whole|plain|fresh|cooked)\y') as is_canonical,
             (split_part(g.name, ',', 2) ~* ('\y' || p.head || '(e?s)?\y')
              and (select bool_and(p.needle ~* ('\y' || w || '\y'))
                     from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
                    where length(w) >= 3)) as chain_named
      from public.foods g
      where g.search_text ilike all (select '%' || w || '%' from unnest(p.s) as w)
        and (select bool_and(g.search_text ~* ('\y' || w || '(e?s)?\y')) from unnest(p.s) as w)
    ) c on true
    where (c.head_leads or c.chain_named)
      and c.coverage >= 0.5
      and (c.brand is null or c.in_name or c.brand_named)
    order by
      c.in_name desc,
      (c.brand is null and c.source = 'usda') desc,
      c.head_leads desc,
      c.is_derivative asc,
      c.is_canonical desc,
      c.head_tokens asc,
      c.coverage desc,
      length(c.name) asc
    limit 1
  );
$$;

revoke all on function public.resolve_food(text) from public;
revoke all on function public.resolve_food(text) from anon;
grant execute on function public.resolve_food(text) to authenticated;
grant execute on function public.resolve_food(text) to service_role;
