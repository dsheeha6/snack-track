-- Same rules, split into two branches so the common case stops early.
--
-- The candidate scan is cheap (~35ms, trigram index); the cost was scoring all
-- 2,160 candidates for a term like 'chicken breast'. Two observations remove it:
--
--   * in_name is ALWAYS true for an unbranded row -- search_text is name||brand,
--     so with no brand, every matched word is in the name by definition. It was
--     the first sort key, and it only ever discriminated among branded rows,
--     which now have to satisfy it anyway. Dropped.
--   * With in_name gone, a whole food always outranks a branded row, so the
--     branded branch only needs to run when no whole food matched at all.
--
-- The whole-food branch scans only the 7,793 unbranded rows and needs no brand
-- or coverage work; the branded branch runs second and only for terms the food
-- table has no whole-food answer for.
create or replace function public.resolve_food(q text)
returns setof public.foods
language sql
stable
set search_path = public, extensions
as $$
  with parts as (
    select s,
           lower(btrim(q)) as needle,
           '^' || (select string_agg('(?=.*\y' || w || '(e?s)?\y)', '') from unnest(s) as w) as pat_all,
           '\y' || s[cardinality(s)] || '(e?s)?\y' as pat_head,
           array(select '%' || w || '%' from unnest(s) as w) as pats
    from (
      select array(
        select case when length(w) > 3 and w like '%s' and w not like '%ss'
                    then left(w, length(w) - 1) else w end
        from unnest(regexp_split_to_array(lower(btrim(q)), '[^a-z0-9]+')) as w
        where length(w) >= 2
      ) as s
    ) t
    where cardinality(s) >= 1
  ),
  cand as (
    select g.id, g.name, g.brand, g.source, p.s, p.needle, p.pat_all,
           split_part(g.name, ',', 1) ~* p.pat_head as head_leads,
           (split_part(g.name, ',', 1) !~* p.pat_head
            and (select bool_and(p.needle ~* ('\y' || w || '\y'))
                   from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
                  where length(w) >= 3)) as chain_named
    from parts p
    join public.foods g
      on g.search_text ilike all (select unnest(p.pats))
    where g.search_text ~* p.pat_all
      and (split_part(g.name, ',', 1) ~* p.pat_head or split_part(g.name, ',', 2) ~* p.pat_head)
  ),
  scored as (
    select c.*,
           cardinality(array(
             select w from unnest(regexp_split_to_array(lower(split_part(c.name, ',', 1)), '[^a-z0-9]+')) as w
             where length(w) >= 3)) as head_tokens,
           (select count(*) filter (
              where exists (select 1 from unnest(c.s) as t
                            where w ~* ('\y' || t || '(e?s)?\y') or t ~* ('\y' || w || '\y'))
            )::numeric / greatest(count(*), 1)
            from unnest(regexp_split_to_array(lower(c.name), '[^a-z0-9]+')) as w
            where length(w) >= 3) as coverage,
           (select bool_or(c.name ~* ('\y' || d || '\y') and c.needle !~* ('\y' || d || '\y'))
              from unnest(array['meatless','imitation','substitute','dried','dehydrated',
                                'powdered','babyfood','infant','yolk','leaves']) as d) as is_derivative,
           (c.name ~* '\y(raw|whole|plain|fresh|cooked)\y') as is_canonical
    from cand c
    where (c.head_leads or c.chain_named)
      and c.brand is null
      and c.source = 'usda'
  ),
  branded as (
    select c.*,
           cardinality(array(
             select w from unnest(regexp_split_to_array(lower(split_part(c.name, ',', 1)), '[^a-z0-9]+')) as w
             where length(w) >= 3)) as head_tokens,
           (select count(*) filter (
              where exists (select 1 from unnest(c.s) as t
                            where w ~* ('\y' || t || '(e?s)?\y') or t ~* ('\y' || w || '\y'))
            )::numeric / greatest(count(*), 1)
            from unnest(regexp_split_to_array(lower(c.name), '[^a-z0-9]+')) as w
            where length(w) >= 3) as coverage
    from cand c
    where (c.head_leads or c.chain_named)
      and c.brand is not null
      and c.name ~* c.pat_all
      and exists (select 1 from unnest(regexp_split_to_array(lower(c.brand), '[^a-z0-9]+')) as b
                  where length(b) >= 3 and c.needle ~* ('\y' || b || '\y'))
  )
  select f.*
  from public.foods f
  where f.id = coalesce(
    (select id from scored
      order by head_leads desc, is_derivative asc, head_tokens asc,
               coverage desc, is_canonical desc, length(name) asc
      limit 1),
    (select id from branded
      where coverage >= 0.5
      order by head_leads desc, head_tokens asc, coverage desc, length(name) asc
      limit 1)
  );
$$;
