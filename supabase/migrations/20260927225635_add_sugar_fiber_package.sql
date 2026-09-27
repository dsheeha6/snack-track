-- Sugar + fiber (Danny, 2026-08-22: together, one migration) and the package
-- size branded products are sold in (2026-09-25: a lookup needs "1 bar (52g)",
-- and foods only held per-100 g).
--
-- All nullable: NULL is "unknown", never 0. Nutrient values are per 100 g
-- (per 100 ml for drinks), the same basis as calories. Adding nullable
-- columns does not rewrite the table.

alter table public.foods
  add column sugar numeric(6,1),
  add column fiber numeric(6,1),
  add column package_size numeric(7,1),
  add column package_unit text check (package_unit in ('g', 'ml')),
  add column package_label text;

comment on column public.foods.package_size is
  'Amount in one package/labelled serving, in package_unit. Branded rows only.';

alter table public.entries
  add column sugar numeric(6,1),
  add column fiber numeric(6,1);

alter table public.personal_foods
  add column sugar numeric(6,1),
  add column fiber numeric(6,1);

-- Scratch table for scripts/add_sugar_fiber.py. Filled over REST with the
-- service_role key, joined into foods, then dropped (next migration). RLS on
-- with no policies and no grants: nothing but service_role can see it.
create table public.foods_nutrient_load (
  source text not null,
  brand text,
  name text not null,
  barcode text,
  sugar numeric(6,1),
  fiber numeric(6,1),
  package_size numeric(7,1),
  package_unit text,
  package_label text
);
alter table public.foods_nutrient_load enable row level security;
revoke all on public.foods_nutrient_load from anon, authenticated;
