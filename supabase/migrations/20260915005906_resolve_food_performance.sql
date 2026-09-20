-- Same rules as before, restructured for speed. The first version took ~1s on
-- 'chicken breast', which the edge function pays once per item in the sentence.
-- Two changes, no change in behaviour:
--
--   * The per-word bool_and(... ~* ...) subqueries became ONE regex of lookaheads
--     ('^(?=.*\ychicken(e?s)?\y)(?=.*\ybreast(e?s)?\y)'), built once per call
--     instead of re-evaluated per candidate row.
--   * The head-noun test moved into the WHERE clause, where it is cheap and very
--     selective, so the expensive scoring columns are only computed for rows that
--     already cleared it -- thousands of rows down to dozens.
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
      select s,
             s[cardinality(s)] as head,
             lower(btrim(q)) as needle,
             '^' || (select string_agg('(?=.*\y' || w || '(e?s)?\y)', '') from unnest(s) as w) as pat_all,
             '\y' || s[cardinality(s)] || '(e?s)?\y' as pat_head
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
      select g.id, g.name, g.brand, g.source, p.s, p.needle, p.pat_all, p.pat_head,
             split_part(g.name, ',', 1) ~* p.pat_head as head_leads
      from parts p
      join public.foods g
        on g.search_text ilike all (select '%' || w || '%' from unnest(p.s) as w)
      where g.search_text ~* p.pat_all
        and (split_part(g.name, ',', 1) ~* p.pat_head or split_part(g.name, ',', 2) ~* p.pat_head)
    )
    select c.id
    from (
      select c.*,
             c.name ~* c.pat_all as in_name,
             (c.brand is not null and exists (
                select 1 from unnest(regexp_split_to_array(lower(c.brand), '[^a-z0-9]+')) as b
                where length(b) >= 3 and c.needle ~* ('\y' || b || '\y'))) as brand_named,
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
             (c.name ~* '\y(raw|whole|plain|fresh|cooked)\y') as is_canonical,
             (not c.head_leads
              and (select bool_and(c.needle ~* ('\y' || w || '\y'))
                     from unnest(regexp_split_to_array(lower(split_part(c.name, ',', 1)), '[^a-z0-9]+')) as w
                    where length(w) >= 3)) as chain_named
      from cand c
    ) c
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
