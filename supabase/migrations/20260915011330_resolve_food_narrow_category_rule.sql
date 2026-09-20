-- Narrowing the category rule, because the broad version did more harm than good.
--
-- Allowing a long category list, with the head matched anywhere after it, bought
-- 'Nuts, almond butter' and 'Sauce, hot chile, sriracha' -- and cost:
--     almond milk -> Candies, milk chocolate, with almonds   (526 cal)
--     oatmeal     -> Snacks, granola bars, QUAKER OATMEAL TO GO
--     beer        -> Beverages, carbonated, root beer
--     wine        -> Beverages, Wine, non-alcoholic
-- all of which had correctly returned nothing before. 'almond milk' landing on
-- milk chocolate is the precise failure this function exists to prevent, and one
-- wrong link is worth more than several right ones here.
--
-- So: 'nuts' and 'seeds' only -- the two categories that genuinely displace the
-- food's own name, verified to give 'Nuts, almond butter, plain, with salt added'
-- (614 cal) and 'Nuts, almonds' (579 cal) -- and the food must sit in the segment
-- directly after the category, not anywhere later in the name.
create or replace function public.resolve_food_once(stems text[], needle text, mode text)
returns uuid
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_all  text;
  v_head text;
  v_like text;
  v_id   uuid;
  v_cats text[] := array['nuts','seeds'];
begin
  if stems is null or cardinality(stems) = 0 then
    return null;
  end if;

  select '^' || string_agg('(?=.*\y' || w || '(e?s)?\y)', '') from unnest(stems) as w into v_all;
  v_head := '\y' || stems[cardinality(stems)] || '(e?s)?\y';
  -- one ILIKE per word, built as text: the trigram index can only accelerate
  -- this form (ILIKE ALL(array) measured as a 813ms seq scan, this as a 27ms
  -- index scan). Stems come from a split on [^a-z0-9]+ so they are letters and
  -- digits only, and are quote_literal'd regardless.
  select string_agg(format(' and g.search_text ilike %L', '%' || w || '%'), '')
    from unnest(stems) as w into v_like;

  if mode = 'whole' then
    execute format($sql$
      select g.id
      from public.foods g
      where g.brand is null and g.source = 'usda' and g.search_text ~* $1 %s
        and (split_part(g.name, ',', 1) ~* $2
             or (split_part(g.name, ',', 2) ~* $2
                 -- 'CHAIN, item' when the query named the chain, or
                 -- 'CATEGORY, food' for the two categories that hide the food
                 and ((select bool_and($3 ~* ('\y' || w || '\y'))
                         from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
                        where length(w) >= 3)
                      or lower(split_part(g.name, ',', 1)) = any($5::text[]))))
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
    into v_id using v_all, v_head, needle, stems, v_cats;
  else
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
    into v_id using v_all, v_head, needle, stems;
  end if;

  return v_id;
end;
$$;
