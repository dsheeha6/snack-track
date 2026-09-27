-- Second tightening, same evening. Two leaks after food_word_brands:
--   - "PISTACHIO" brand: SR files pistachios as "Nuts, pistachio nuts", so the
--     first-segment list missed it. food_head_words now holds every word
--     (4+ letters) in any generic food name, plus each whole first segment.
--   - "TRATTORIA" brand via the 6+ letter single-token exception ("a celsius").
--     Exception removed: a brand now always needs a sentence word in the
--     product name. A bare brand mention falls back to the estimate, which
--     already got Celsius right.
--
-- This is the final product_candidates definition (plpgsql: grams into an
-- array first, then one probe of foods_brand_key_idx; see _indexed).
insert into public.food_head_words
  select distinct w
  from public.foods f,
       unnest(regexp_split_to_array(public.brand_key(f.name), ' ')) as w
  where f.source in ('usda', 'usda_fndds') and length(w) >= 4
on conflict do nothing;

create or replace function public.product_candidates(q text, per_brand int default 6, max_rows int default 24)
returns table (brand text, name text, package_size numeric, package_unit text, package_label text,
               calories numeric, protein numeric, carbs numeric, fat numeric, sugar numeric, fiber numeric)
language plpgsql
stable
set search_path = public, extensions
as $fn$
declare
  v_ws    text[] := array_remove(string_to_array(public.brand_key(q), ' '), '');
  v_grams text[];
begin
  select array_agg(distinct x) into v_grams from (
    select v_ws[i] as x from generate_subscripts(v_ws, 1) as i
    union select v_ws[i] || ' ' || v_ws[i + 1] from generate_subscripts(v_ws, 1) as i where i < cardinality(v_ws)
    union select v_ws[i] || v_ws[i + 1] from generate_subscripts(v_ws, 1) as i where i < cardinality(v_ws)
    union select v_ws[i] || ' ' || v_ws[i + 1] || ' ' || v_ws[i + 2] from generate_subscripts(v_ws, 1) as i where i < cardinality(v_ws) - 1
  ) g
  where length(x) >= 3
    and x <> all (array['the','and','with','for','had','some','ate','got','after','before','was']);

  if v_grams is null then
    return;
  end if;

  return query
  with hit as (
    select f.brand, f.name, f.package_size, f.package_unit, f.package_label,
           f.calories, f.protein, f.carbs, f.fat, f.sugar, f.fiber,
           public.brand_key(f.brand) as bk
    from public.foods f
    where f.source = 'usda_branded'
      and public.brand_key(f.brand) = any (v_grams)
      and f.package_size is not null
  ),
  scored as (
    select h.*,
           exists (select 1 from public.food_head_words fw where fw.word = h.bk) as food_word,
           (select count(*) from unnest(v_ws) as x
             where length(x) >= 3
               and position(x in lower(h.name)) > 0
               and position(x in h.bk) = 0) as overlap
    from hit h
  ),
  kept as (
    select distinct on (s.bk, lower(s.name), s.package_size) s.*
    from scored s
    where s.overlap >= (case when s.food_word then 2 else 1 end)
    order by s.bk, lower(s.name), s.package_size, s.overlap desc
  ),
  ranked as (
    select k.*, row_number() over (partition by k.bk order by k.overlap desc, length(k.name) asc) as rn
    from kept k
  )
  select r.brand, r.name, r.package_size, r.package_unit, r.package_label,
         r.calories, r.protein, r.carbs, r.fat, r.sugar, r.fiber
  from ranked r
  where r.rn <= per_brand
  order by r.overlap desc, r.rn
  limit max_rows;
end;
$fn$;
