-- Third and final pass on resolve_food. Three corrections, all found by running
-- the 71 search terms the eval's own parses produced:
--
--   * 'raw/whole/plain/cooked' was ranked ABOVE "how many words head the food",
--     so 'water' resolved to 'Water convolvulus, raw' (a vegetable) over
--     'Water, bottled, generic', and 'salmon' to 'Salmon nuggets, cooked'. It is
--     a last-resort tiebreak, not a primary key, and now sorts last.
--
--   * The derivative penalty fired even when the user asked for the derivative.
--     It now only penalises a word the query did NOT contain -- so 'eggs' avoids
--     'Egg, yolk, raw, fresh' while 'egg yolk' can still reach it.
--
--   * A branded row must now carry the food word in its OWN name, not borrow it
--     from the brand. Without this, ALMOND JOY made 'almond milk' resolve to
--     MILK CHOCOLATE (489 cal). The cost is real and accepted: 'quest protein bar'
--     no longer reaches a QUEST-branded row whose name is just 'PROTEIN BAR'.
--     Precision is the point of this function -- the numbers are Claude's either
--     way, so a missing link costs nothing and a wrong one is a lie.
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
             -- a part or a substitute is not the food someone said they ate -- unless
             -- they said so themselves
             (select bool_or(g.name ~* ('\y' || d || '\y') and p.needle !~* ('\y' || d || '\y'))
                from unnest(array['meatless','imitation','substitute','dried','dehydrated',
                                  'powdered','babyfood','infant','yolk','leaves']) as d) as is_derivative,
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
      and (c.brand is null or (c.in_name and c.brand_named and c.coverage >= 0.5))
    order by
      c.in_name desc,
      (c.brand is null and c.source = 'usda') desc,
      c.head_leads desc,
      c.is_derivative asc,
      c.head_tokens asc,
      c.coverage desc,
      c.is_canonical desc,
      length(c.name) asc
    limit 1
  );
$$;
