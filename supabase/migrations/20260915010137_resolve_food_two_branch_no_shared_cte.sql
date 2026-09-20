-- Final shape. Same rules; the remaining 1.3s was a planner effect, not the rules:
-- a CTE referenced by both branches gets materialised, so the expensive per-row
-- scoring ran for all 2,160 'chicken breast' candidates even though the
-- whole-food branch had already answered from 7. Each branch now does its own
-- scan, which lets `brand is null` push down into the trigram index scan.
--
-- Stems are words of 3+ characters, so 'on'/'of'/'with' in a stray sentence do not
-- become required words; a query made only of short words falls back to 2+.
create or replace function public.resolve_food(q text)
returns setof public.foods
language sql
stable
set search_path = public, extensions
as $$
  with parts as (
    select case when cardinality(long_s) > 0 then long_s else short_s end as s
    from (
      select array(select case when length(w) > 3 and w like '%s' and w not like '%ss'
                               then left(w, length(w) - 1) else w end
                   from unnest(regexp_split_to_array(lower(btrim(q)), '[^a-z0-9]+')) as w
                   where length(w) >= 3) as long_s,
             array(select case when length(w) > 3 and w like '%s' and w not like '%ss'
                               then left(w, length(w) - 1) else w end
                   from unnest(regexp_split_to_array(lower(btrim(q)), '[^a-z0-9]+')) as w
                   where length(w) >= 2) as short_s
    ) t
  ),
  pat as (
    select s,
           lower(btrim(q)) as needle,
           '^' || (select string_agg('(?=.*\y' || w || '(e?s)?\y)', '') from unnest(s) as w) as pat_all,
           '\y' || s[cardinality(s)] || '(e?s)?\y' as pat_head,
           array(select '%' || w || '%' from unnest(s) as w) as pats
    from parts
    where cardinality(s) >= 1
  )
  select f.*
  from public.foods f
  where f.id = coalesce(
    -- whole foods first: an unbranded row always beats a branded one, because
    -- every query word is in its name by definition (search_text is name||brand)
    (select g.id
       from pat p
       join public.foods g on g.search_text ilike all (select unnest(p.pats))
      where g.brand is null
        and g.source = 'usda'
        and g.search_text ~* p.pat_all
        and (split_part(g.name, ',', 1) ~* p.pat_head
             or (split_part(g.name, ',', 2) ~* p.pat_head
                 and (select bool_and(p.needle ~* ('\y' || w || '\y'))
                        from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
                       where length(w) >= 3)))
      order by
        (split_part(g.name, ',', 1) ~* p.pat_head) desc,
        (select bool_or(g.name ~* ('\y' || d || '\y') and p.needle !~* ('\y' || d || '\y'))
           from unnest(array['meatless','imitation','substitute','dried','dehydrated',
                             'powdered','babyfood','infant','yolk','leaves']) as d) asc,
        cardinality(array(select w from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
                          where length(w) >= 3)) asc,
        (select count(*) filter (
           where exists (select 1 from unnest(p.s) as t
                         where w ~* ('\y' || t || '(e?s)?\y') or t ~* ('\y' || w || '\y'))
         )::numeric / greatest(count(*), 1)
         from unnest(regexp_split_to_array(lower(g.name), '[^a-z0-9]+')) as w
         where length(w) >= 3) desc,
        (g.name ~* '\y(raw|whole|plain|fresh|cooked)\y') desc,
        length(g.name) asc
      limit 1),
    -- only if the food table has no whole-food answer: a branded row, and only
    -- one the user actually named the brand of
    (select g.id
       from pat p
       join public.foods g on g.search_text ilike all (select unnest(p.pats))
      where g.brand is not null
        and g.name ~* p.pat_all
        and split_part(g.name, ',', 1) ~* p.pat_head
        and exists (select 1 from unnest(regexp_split_to_array(lower(g.brand), '[^a-z0-9]+')) as b
                    where length(b) >= 3 and p.needle ~* ('\y' || b || '\y'))
        and (select count(*) filter (
               where exists (select 1 from unnest(p.s) as t
                             where w ~* ('\y' || t || '(e?s)?\y') or t ~* ('\y' || w || '\y'))
             )::numeric / greatest(count(*), 1)
             from unnest(regexp_split_to_array(lower(g.name), '[^a-z0-9]+')) as w
             where length(w) >= 3) >= 0.5
      order by
        cardinality(array(select w from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
                          where length(w) >= 3)) asc,
        length(g.name) asc
      limit 1)
  );
$$;
