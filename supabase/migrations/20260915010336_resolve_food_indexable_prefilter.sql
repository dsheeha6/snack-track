-- Same rules. Last performance fix, and the reason for the dynamic SQL:
--
-- The trigram index can only accelerate this if each word is its own ILIKE
-- predicate. `search_text ILIKE ALL (array)` is not indexable (measured: parallel
-- seq scan over all 407k rows, 813ms), and neither is the lookahead regex on its
-- own -- pg_trgm cannot extract trigrams through '(?=...)'. With one ILIKE per
-- word the same scan is an index scan over ~2k rows in 27ms, and the regex then
-- rides along as a recheck, which is what enforces word boundaries.
--
-- A variable number of predicates means building the fragment as text. The words
-- are already sanitised -- regexp_split_to_array on '[^a-z0-9]+' means a stem can
-- only ever be letters and digits -- and every one is quote_literal'd on the way
-- in regardless.
create or replace function public.resolve_food(q text)
returns setof public.foods
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_stems  text[];
  v_needle text := lower(btrim(q));
  v_all    text;
  v_head   text;
  v_like   text;
  v_id     uuid;
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
  select string_agg(format(' and g.search_text ilike %L', '%' || w || '%'), '')
    from unnest(v_stems) as w into v_like;

  -- whole foods first: an unbranded row always beats a branded one, because with
  -- no brand every matched word is in the name by definition
  execute format($sql$
    select g.id
    from public.foods g
    where g.brand is null and g.source = 'usda' and g.search_text ~* $1 %s
      and (split_part(g.name, ',', 1) ~* $2
           or (split_part(g.name, ',', 2) ~* $2
               and (select bool_and($3 ~* ('\y' || w || '\y'))
                      from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
                     where length(w) >= 3)))
    order by
      (split_part(g.name, ',', 1) ~* $2) desc,
      (select bool_or(g.name ~* ('\y' || d || '\y') and $3 !~* ('\y' || d || '\y'))
         from unnest(array['meatless','imitation','substitute','dried','dehydrated',
                           'powdered','babyfood','infant','yolk','leaves']) as d) asc,
      cardinality(array(select w from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
                        where length(w) >= 3)) asc,
      (select count(*) filter (
         where exists (select 1 from unnest($4::text[]) as t
                       where w ~* ('\y' || t || '(e?s)?\y') or t ~* ('\y' || w || '\y'))
       )::numeric / greatest(count(*), 1)
       from unnest(regexp_split_to_array(lower(g.name), '[^a-z0-9]+')) as w
       where length(w) >= 3) desc,
      (g.name ~* '\y(raw|whole|plain|fresh|cooked)\y') desc,
      length(g.name) asc
    limit 1
  $sql$, v_like)
  into v_id using v_all, v_head, v_needle, v_stems;

  -- only if the table has no whole-food answer: a branded row, and only one whose
  -- brand the user actually named and whose name is not mostly words they never said
  if v_id is null then
    execute format($sql$
      select g.id
      from public.foods g
      where g.brand is not null and g.search_text ~* $1 %s
        and g.name ~* $1
        and split_part(g.name, ',', 1) ~* $2
        and exists (select 1 from unnest(regexp_split_to_array(lower(g.brand), '[^a-z0-9]+')) as b
                    where length(b) >= 3 and $3 ~* ('\y' || b || '\y'))
        and (select count(*) filter (
               where exists (select 1 from unnest($4::text[]) as t
                             where w ~* ('\y' || t || '(e?s)?\y') or t ~* ('\y' || w || '\y'))
             )::numeric / greatest(count(*), 1)
             from unnest(regexp_split_to_array(lower(g.name), '[^a-z0-9]+')) as w
             where length(w) >= 3) >= 0.5
      order by
        cardinality(array(select w from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
                          where length(w) >= 3)) asc,
        length(g.name) asc
      limit 1
    $sql$, v_like)
    into v_id using v_all, v_head, v_needle, v_stems;
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
