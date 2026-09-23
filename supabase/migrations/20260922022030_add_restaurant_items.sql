-- Restaurant menu nutrition, per orderable item at a stated size.
--
-- Kept out of public.foods on purpose. foods rows are USDA/branded products
-- whose numbers are mostly per 100 g ("CHICK-FIL-A, chicken sandwich 249" is
-- 100 g of sandwich, not the sandwich), and resolve_food's ranking is built
-- around that. A menu item is a whole portion as the chain serves it, and the
-- parse needs "every item this chain sells" in one read, not a ranked search.
--
-- Loaded by scripts/restaurants/load.py from data/restaurants/*.jsonl, which
-- come from each chain's own published nutrition (or Nutritionix's mirror of
-- it, tagged in source_url). Accuracy is the priority (Danny, 2026-09-21).

create table public.restaurant_chains (
  slug text primary key,
  name text not null,
  -- lowercase spellings people actually type: 'chickfila', 'cfa', 'mcds'
  aliases text[] not null default '{}'
);

create table public.restaurant_items (
  id uuid primary key default gen_random_uuid(),
  chain_slug text not null references public.restaurant_chains (slug) on delete cascade,
  category text not null default '',
  item text not null,
  size text not null default '',
  serving_g numeric(7,1),
  calories numeric(7,1) not null,
  protein numeric(6,1) not null,
  carbs numeric(6,1) not null,
  fat numeric(6,1) not null,
  sugar numeric(6,1),
  fiber numeric(6,1),
  sodium_mg numeric(7,1),
  source_url text not null,
  fetched_on date not null,
  unique (chain_slug, item, size)
);
-- The unique constraint's index leads with chain_slug, which covers both the
-- foreign key and the only read the parse does: every row for one chain.

alter table public.restaurant_chains enable row level security;
alter table public.restaurant_items enable row level security;

-- Same shape as foods: anyone signed in reads, nobody writes from a client.
create policy "read restaurant chains" on public.restaurant_chains
  for select to authenticated using (true);
create policy "read restaurant items" on public.restaurant_items
  for select to authenticated using (true);
