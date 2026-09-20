-- Last rule. USDA files some foods under a category head rather than their own:
-- almond butter is 'Nuts, almond butter, plain, with salt added', wine is
-- 'Alcoholic beverage, wine, table, red', sriracha is 'Sauce, hot chile,
-- sriracha'. The head-noun rule rejected all of those, and the branded fallback
-- then supplied things like BUTTER ME UP!, WHITE CHOCOLATE ALMOND BUTTER.
--
-- So the head may also sit behind a known category prefix. The list is curated
-- from the data (the distinct first segments of the 7,793 unbranded rows) and
-- contains only words nobody uses as the name of what they ate. 'oil' and 'soup'
-- were candidates and are deliberately excluded -- with 'oil' allowed, 'almonds'
-- resolves to 'Oil, almond' at 884 cal.
--
-- This cannot outrank a direct match, because head_leads is still the first sort
-- key: 'milk' reaches 'Milk, sheep, fluid' before 'Candies, milk chocolate', and
-- 'water' reaches 'Water, bottled, generic' before 'Beverages, water, tap'.
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
  v_cats text[] := array['nuts','seeds','beverages','alcoholic beverage','snacks',
                         'candies','fast foods','restaurant','cereals ready-to-eat',
                         'game meat','spices','mollusks','crustaceans','sauce'];
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
             -- restaurant rows are 'CHAIN, item': allowed when the query named the chain
             or (split_part(g.name, ',', 2) ~* $2
                 and (select bool_and($3 ~* ('\y' || w || '\y'))
                        from unnest(regexp_split_to_array(lower(split_part(g.name, ',', 1)), '[^a-z0-9]+')) as w
                       where length(w) >= 3))
             -- USDA category rows are 'CATEGORY, real food'
             or (lower(split_part(g.name, ',', 1)) = any($5::text[])
                 and substr(g.name, strpos(g.name, ',')) ~* $2))
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

-- 'plain' and 'fresh' join the droppable modifiers: 'plain greek yogurt' was
-- missing 'Yogurt, Greek, plain, lowfat' and falling through to a branded row
-- whose brand merely contained the word yogurt.
create or replace function public.resolve_food(q text)
returns setof public.foods
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_stems  text[];
  v_plain  text[];
  v_needle text := lower(btrim(q));
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

  -- Claude's search_term carries the sentence's modifiers ('grilled chicken
  -- breast', 'medium banana'), and every word is required, so a real food could
  -- miss a link purely because of an adjective. Only PREPARATION and SIZE words
  -- are droppable, and that restriction is the point: general backoff would turn
  -- 'almond milk' into 'milk' and link a dairy row, which is the exact class of
  -- wrong answer this function exists to prevent. 'grilled' cannot change what
  -- the food is; 'almond' can. 'hot' and 'cold' are left out too -- dropping
  -- 'hot' from 'hot dog' leaves 'dog'.
  select array(select w from unnest(v_stems) as w
               where w <> all (array['grilled','roasted','baked','fried','steamed',
                                     'boiled','scrambled','poached','homemade','grated',
                                     'toasted','sliced','chopped','diced','shredded',
                                     'cooked','large','small','medium','plain','fresh']))
    into v_plain;
  if cardinality(v_plain) = 0 or cardinality(v_plain) = cardinality(v_stems) then
    v_plain := null;
  end if;

  v_id := public.resolve_food_once(v_stems, v_needle, 'whole');
  if v_id is null and v_plain is not null then
    v_id := public.resolve_food_once(v_plain, v_needle, 'whole');
  end if;
  if v_id is null then
    v_id := public.resolve_food_once(v_stems, v_needle, 'branded');
  end if;
  if v_id is null and v_plain is not null then
    v_id := public.resolve_food_once(v_plain, v_needle, 'branded');
  end if;

  if v_id is null then
    return;
  end if;

  return query select f.* from public.foods f where f.id = v_id;
end;
$$;

revoke all on function public.resolve_food_once(text[], text, text) from public;
revoke all on function public.resolve_food_once(text[], text, text) from anon;
revoke all on function public.resolve_food(text) from public;
revoke all on function public.resolve_food(text) from anon;
grant execute on function public.resolve_food(text) to authenticated;
grant execute on function public.resolve_food(text) to service_role;
