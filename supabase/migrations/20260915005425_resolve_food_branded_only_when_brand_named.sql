-- See add_resolve_food_single_best_match for the full rationale. Two corrections
-- from testing against the 71 terms the eval's parses actually produced:
--
--   * The coverage floor now applies to BRANDED rows only. USDA whole-food names
--     are qualifier-rich ('Egg, whole, raw, fresh' is 1 of 4 words the user said),
--     so a global floor rejected exactly the rows this function exists to find,
--     and 'eggs' resolved to SHURFINE FRESH EGGS instead. Unbranded rows are
--     already constrained by the head-noun rule, which is the stronger guarantee.
--
--   * A branded row is now linked ONLY when the query names the brand. Allowing
--     branded rows whose NAME merely contained the query let supermarket labels
--     outrank whole foods ('apple' -> MERCIER ORCHARDS FRESH APPLES). And the
--     brand test can go back to plain overlap -- the reason it needed a
--     name-contribution check before was CHICKEN OF THE SEA -> SHRIMP, which the
--     head-noun rule now kills on its own, and plain overlap is what lets a
--     single-word brand query like 'chobani' resolve at all.
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
             (g.brand is not null and exists (
                select 1 from unnest(regexp_split_to_array(lower(g.brand), '[^a-z0-9]+')) as b
                where length(b) >= 3 and p.needle ~* ('\y' || b || '\y'))) as brand_named,
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
      -- a branded row must be one the user actually asked for by brand, and must
      -- not be mostly words they never said
      and (c.brand is null or (c.brand_named and c.coverage >= 0.5))
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
