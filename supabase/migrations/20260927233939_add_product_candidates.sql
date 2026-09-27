-- Packaged-product lookup for parse-meal (2026-09-25). Same idea as the chain
-- menus: when a sentence names a brand we hold, offer that brand's matching
-- products with per-PACKAGE label numbers, the model picks a line and a count,
-- and code multiplies. Measured baseline to beat: meals_branded.jsonl 5.5%.
--
-- brand_key: lowercase, letters/digits/spaces only, single spaces. "SIGGI'S"
-- -> "siggis", "CLIF BAR" -> "clif bar". Indexed so matching a sentence's
-- 1-3 word grams against 37.7k brands is an index probe, not a 400k scan.
--
-- The product_candidates body below took 9.7 s (the planner joined instead of
-- probing the index); replaced the same hour by product_candidates_indexed and
-- then twice more. The final definition is in 20260927234951.
create or replace function public.brand_key(b text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(regexp_replace(lower(coalesce(b, '')), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g'))
$$;

create index foods_brand_key_idx on public.foods (public.brand_key(brand))
  where source = 'usda_branded';

create or replace function public.product_candidates(q text, per_brand int default 6, max_rows int default 24)
returns table (brand text, name text, package_size numeric, package_unit text, package_label text,
               calories numeric, protein numeric, carbs numeric, fat numeric, sugar numeric, fiber numeric)
language sql
stable
set search_path = public, extensions
as $fn$
  with w as (
    select array_remove(string_to_array(public.brand_key(q), ' '), '') as ws
  ),
  g as (
    select ws[i] as gram from w, generate_subscripts(ws, 1) as i
    union select ws[i] || ' ' || ws[i + 1] from w, generate_subscripts(ws, 1) as i where i < cardinality(ws)
    union select ws[i] || ws[i + 1] from w, generate_subscripts(ws, 1) as i where i < cardinality(ws)
    union select ws[i] || ' ' || ws[i + 1] || ' ' || ws[i + 2] from w, generate_subscripts(ws, 1) as i where i < cardinality(ws) - 1
  ),
  hit as (
    select f.*, public.brand_key(f.brand) as bk
    from g
    join public.foods f
      on public.brand_key(f.brand) = g.gram
     and f.source = 'usda_branded'
    where length(g.gram) >= 3
      and g.gram <> all (array['the','and','with','for','had','some','ate','got','after','before','was'])
      and f.package_size is not null
  ),
  scored as (
    select h.*,
           (select count(*) from w, unnest(w.ws) as x
             where length(x) >= 3
               and position(x in lower(h.name)) > 0
               and position(x in h.bk) = 0) as overlap
    from hit h
  ),
  kept as (
    select distinct on (s.bk, lower(s.name), s.package_size) s.*
    from scored s
    where s.overlap >= 1 or (length(s.bk) >= 6 and position(' ' in s.bk) = 0)
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
$fn$;

revoke all on function public.product_candidates(text, int, int) from public;
revoke all on function public.product_candidates(text, int, int) from anon;
grant execute on function public.product_candidates(text, int, int) to authenticated;
grant execute on function public.product_candidates(text, int, int) to service_role;
