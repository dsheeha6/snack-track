-- SNACK TRACK schema. Applied to Supabase project `snack-track` (grltvenoqmzhgkfasvlb)
-- as migrations `initial_schema` and `harden_extensions_and_functions`.
--
-- Supabase holds the authoritative migration history; this file is the readable
-- copy that lives in git. If you change the database, apply a migration AND
-- update this file in the same commit.

create extension if not exists pg_trgm with schema extensions;

create type meal_slot as enum ('breakfast','lunch','dinner','snacks');
create type goal_type as enum ('cut','recomp','bulk','track');
create type entry_source as enum ('manual','ai','database','history','suggestion');

-- Who the person is and what they're aiming at. One row per auth user,
-- created automatically by the on_auth_user_created trigger.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  sex text check (sex in ('male','female','other')),
  birth_date date,
  height_cm numeric(5,1),
  daily_steps int,
  lifting_days_per_week int,
  cardio_minutes_per_week int,
  goal goal_type not null default 'recomp',
  -- Only asked when the goal is cut or bulk, and skippable even then. The
  -- healthy-BMI floor is enforced in the app before this is ever written.
  goal_weight_lb numeric(6,2),
  target_calories int not null default 2200,
  target_protein int not null default 165,
  target_carbs int not null default 220,
  target_fat int not null default 70,
  -- Flat default rather than computed from bodyweight — the formulas disagree
  -- with each other and it isn't worth a settings argument.
  target_water_oz numeric(6,1) not null default 64,
  hide_calorie_numbers boolean not null default false,
  food_preferences jsonb not null default '{}'::jsonb,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every target change, so adaptive TDEE has a history to reason over.
create table public.target_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  effective_on date not null default current_date,
  calories int not null,
  protein int not null,
  carbs int not null,
  fat int not null,
  reason text,
  created_at timestamptz not null default now()
);
-- Covers the user_id foreign key (an unindexed FK makes every auth.users
-- delete scan this table) and matches the only read there is: the latest
-- target for a user.
create index target_history_user_date_idx on public.target_history (user_id, effective_on desc);

-- The food log.
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  eaten_on date not null default current_date,
  meal meal_slot not null default 'snacks',
  name text not null,
  qty text,
  calories numeric(7,1) not null default 0,
  protein numeric(6,1) not null default 0,
  carbs numeric(6,1) not null default 0,
  fat numeric(6,1) not null default 0,
  source entry_source not null default 'manual',
  note text,
  -- food_id is added after `foods` is created, below.
  created_at timestamptz not null default now()
);
create index entries_user_date_idx on public.entries (user_id, eaten_on desc);
-- Covers the entries.food_id foreign key added with the resolve_food link.
-- Without it, `on delete set null` has to scan entries on every foods delete,
-- which the sugar/fiber re-seed of 407k rows would do in bulk.
create index entries_food_id_idx on public.entries (food_id);

-- Shared food database (USDA / Open Food Facts). Read-only to clients.
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  barcode text unique,
  serving_label text,
  serving_grams numeric(8,2),
  calories numeric(7,1) not null,
  protein numeric(6,1) not null default 0,
  carbs numeric(6,1) not null default 0,
  fat numeric(6,1) not null default 0,
  high_variance boolean not null default false,
  source text not null default 'usda',
  created_at timestamptz not null default now()
);
-- Name and brand together, because branded USDA rows keep the brand out of the
-- name: a Quest bar is name "PROTEIN BAR, COOKIES & CREAM" + brand "QUEST BAR",
-- so a name-only search finds nothing for "quest protein bar".
alter table public.foods
  add column search_text text
  generated always as (name || ' ' || coalesce(brand, '')) stored;
create index foods_search_trgm_idx
  on public.foods using gin (search_text extensions.gin_trgm_ops);

-- Which catalogue row an entry was matched to, when resolve_food was confident.
-- Declared here rather than on `entries` above only because `foods` has to exist
-- first. Nullable forever: manual entries have no food row at all, resolve_food
-- returns nothing whenever it is unsure, and an entry's own calories and macros
-- never depend on this column — it is provenance, not arithmetic.
-- on delete set null, not cascade: re-seeding `foods` must never delete a day of
-- someone's food log.
alter table public.entries
  add column food_id uuid references public.foods (id) on delete set null;

-- The moat: what each person's own words resolve to.
create table public.personal_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  phrase text not null,
  name text not null,
  qty text,
  calories numeric(7,1) not null default 0,
  protein numeric(6,1) not null default 0,
  carbs numeric(6,1) not null default 0,
  fat numeric(6,1) not null default 0,
  times_used int not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, phrase)
);

-- Daily weigh-ins, for the trend line and adaptive TDEE.
create table public.weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  measured_on date not null default current_date,
  weight_lb numeric(6,2) not null,
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

-- What people accept and skip, so suggestions learn.
create table public.suggestion_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  suggestion_name text not null,
  action text not null check (action in ('shown','skipped','rejected','logged')),
  created_at timestamptz not null default now()
);
create index suggestion_feedback_user_idx on public.suggestion_feedback (user_id, created_at desc);

-- Entitlements, written by the RevenueCat webhook (service role only).
create table public.subscriptions (
  user_id uuid primary key references auth.users on delete cascade,
  revenuecat_customer_id text,
  product_id text,
  status text not null default 'free',
  is_active boolean not null default false,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- Metering, so "unlimited" never means unmetered.
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('parse','suggest','review','photo')),
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at desc);

-- ---------- water ----------
-- Hydration tracking, deliberately separate from `entries`: water is a
-- consistency feature, not a calorie one, so it never touches calorie or macro
-- totals and never shows up as a row in a meal section. Calorie-bearing drinks
-- (coffee with milk, beer) go through `entries` like any other food.
-- See QUESTIONS.md, "Drinks tracking — answered 2026-08-22".
create table public.water_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  logged_on date not null default current_date,
  ounces numeric(6,1) not null check (ounces > 0),
  created_at timestamptz not null default now()
);
create index water_log_user_date_idx on public.water_log (user_id, logged_on desc);

-- ---------- row level security ----------
-- Every table is locked down. A signed-in user reaches their own rows and
-- nothing else. Verify with a second test account before trusting it.
alter table public.profiles enable row level security;
alter table public.target_history enable row level security;
alter table public.entries enable row level security;
alter table public.foods enable row level security;
alter table public.personal_foods enable row level security;
alter table public.weights enable row level security;
alter table public.suggestion_feedback enable row level security;
alter table public.subscriptions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.water_log enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "own targets" on public.target_history
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own entries" on public.entries
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own personal foods" on public.personal_foods
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own water log" on public.water_log
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own weights" on public.weights
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own suggestion feedback" on public.suggestion_feedback
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------- ranked food search ----------
-- Ranking lives here, not in the client. With ~407k rows an alphabetical
-- "order by name limit 20" buries the row you asked for under whichever brand
-- happens to sort first. Matches every word in any order (people type
-- "quest protein bar", the row is "PROTEIN BAR" / brand "QUEST BAR"), then
-- ranks: exact name, prefix, whole foods over packaged, shortest first.
-- security invoker, so the caller's RLS on public.foods still applies.
create or replace function public.search_foods(q text, lim int default 20)
returns setof public.foods
language sql
stable
set search_path = public, extensions
as $$
  with parsed as (
    select btrim(lower(q)) as needle,
           (array_remove(string_to_array(btrim(lower(q)), ' '), ''))[1] as first_word,
           array(select '%' || w || '%'
                 from unnest(string_to_array(btrim(lower(q)), ' ')) as w
                 where w <> '') as pats
  )
  select f.*
  from public.foods f, parsed p
  where length(p.needle) >= 2
    and f.search_text ilike '%' || p.first_word || '%'
    and f.search_text ilike all (p.pats)
  order by
    (lower(f.name) = p.needle) desc,
    (lower(f.name) like p.needle || '%') desc,
    (f.source = 'usda') desc,
    length(f.search_text) asc,
    f.name asc
  limit greatest(1, least(lim, 50));
$$;

revoke all on function public.search_foods(text, int) from public;
revoke all on function public.search_foods(text, int) from anon;
grant execute on function public.search_foods(text, int) to authenticated;

-- ---------- single-best resolution, for the AI logging path ----------
-- Deliberately NOT search_foods. That one is the app's search box, where recall
-- is the point and a human picks from the list. This answers "which single row
-- IS this food", and its answer gets stamped on the user's entry as food_id, so
-- a wrong answer is worse than no answer. Taking search_foods' top hit was
-- measurably unsafe (2026-09-14): 'apple' -> LAURA BETH'S MEDIUM PINEAPPLE
-- SALSA, 'chicken' -> Fat, chicken (900 cal), 'banana' -> banana pepper,
-- 'green beans' -> Soybeans, 'wine' -> red wine vinegar.
--
-- The rules, and the failure each one prevents:
--   1. Word boundaries, not substrings. ILIKE '%apple%' matches inside
--      'pineapple' and '%beans%' inside 'soybeans'.
--   2. The head noun (last word of the query) must head the FOOD. USDA names are
--      'Head, qualifier, qualifier', so 'chicken' must not reach 'Fat, chicken'.
--      Two exceptions: restaurant rows are 'CHAIN, item' (allowed when the query
--      named the chain), and 'Nuts,'/'Seeds,' genuinely hide the food's own name
--      ('Nuts, almond butter').
--   3. Whole foods are tried before branded ones, across both attempts.
--   4. A branded row is only ever linked when its own name contains everything
--      the user said AND a brand word appears in the query. Testing brand overlap
--      alone fails badly, because brands are full of food words: CHICKEN OF THE
--      SEA made 'chicken' resolve to SHRIMP, TURKEY HILL made 'turkey' resolve to
--      MILK, WATER MAGIC made 'water' resolve to PINA COLADA.
--
-- Returning zero rows is a valid, intended answer. The app runs resolve:'estimate',
-- where the numbers are Claude's either way, so a missing link costs nothing and
-- a wrong link is a lie. 'almond milk', 'oatmeal', 'wine' and 'beer' all
-- deliberately resolve to nothing rather than to something close-but-wrong.
create or replace function public.resolve_food_once(stems text[], needle text, mode text)
returns uuid
language plpgsql
stable
set search_path = public, extensions
as $fn$
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
  -- One ILIKE per word, built as text. This is the only form the trigram index
  -- accelerates: ILIKE ALL(array) measured as an 813ms parallel seq scan over all
  -- 407k rows, this as a 27ms index scan. Stems come from a split on [^a-z0-9]+,
  -- so they are letters and digits only, and are quote_literal'd regardless.
  select string_agg(format(' and g.search_text ilike %L', '%' || w || '%'), '')
    from unnest(stems) as w into v_like;

  if mode = 'whole' then
    execute format($sql$
      select g.id
      from public.foods g
      where g.brand is null and g.source = 'usda' and g.search_text ~* $1 %s
        and (split_part(g.name, ',', 1) ~* $2
             or (split_part(g.name, ',', 2) ~* $2
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
$fn$;

create or replace function public.resolve_food(q text)
returns setof public.foods
language plpgsql
stable
set search_path = public, extensions
as $fn$
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
  -- breast', 'medium banana', 'large eggs'), and every word is required, so a
  -- real food could miss its link purely because of an adjective. Only
  -- PREPARATION and SIZE words are droppable, and that restriction is the whole
  -- point: general backoff would turn 'almond milk' into 'milk' and link a dairy
  -- row, which is the exact class of wrong answer this function exists to
  -- prevent. 'grilled' cannot change what the food is; 'almond' can. 'hot' and
  -- 'cold' are left out too -- dropping 'hot' from 'hot dog' leaves 'dog'.
  select array(select w from unnest(v_stems) as w
               where w <> all (array['grilled','roasted','baked','fried','steamed',
                                     'boiled','scrambled','poached','homemade','grated',
                                     'toasted','sliced','chopped','diced','shredded',
                                     'cooked','large','small','medium','plain','fresh']))
    into v_plain;
  if cardinality(v_plain) = 0 or cardinality(v_plain) = cardinality(v_stems) then
    v_plain := null;
  end if;

  -- whole foods win over branded ones across BOTH attempts, not within each
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
$fn$;

revoke all on function public.resolve_food_once(text[], text, text) from public;
revoke all on function public.resolve_food_once(text[], text, text) from anon;
revoke all on function public.resolve_food(text) from public;
revoke all on function public.resolve_food(text) from anon;
grant execute on function public.resolve_food(text) to authenticated;
grant execute on function public.resolve_food(text) to service_role;

-- Candidate generic foods for a sentence, for parse-meal's resolve:"foods" path.
--
-- resolve_food answers "which single row IS this" and is right to be picky, but
-- its single best guess is often the wrong variant for numbers ('white rice' ->
-- glutinous, 'chicken breast' -> deli roll). So instead of trusting one row, the
-- parse gets a short numbered list per food word and the model picks the row
-- that is the food as eaten, or none. SR Legacy only (7,793 generic foods, per
-- 100 g); branded rows are a later step. SR Legacy's restaurant rows (all-caps
-- chain prefix, "Fast foods") are excluded: they are per 100 g of a dish and
-- would read as a portion. Chains come from restaurant_items instead.
create or replace function public.food_candidates(words text[], per_word int default 15, max_rows int default 80)
returns table (id uuid, name text, calories numeric, protein numeric, carbs numeric, fat numeric)
language sql
stable
set search_path = public, extensions
as $fn$
  with w as (
    select distinct lower(x) as w,
           case when lower(x) ~ '[^aeiou]y$'
                then '\y(' || lower(x) || 's?|' || left(lower(x), length(x) - 1) || 'ies)\y'
                else '\y' || lower(x) || '(s|es)?\y' end as re
    from unnest(words) as x
    where x ~ '^[a-z]{3,}$'
  ),
  hits as (
    select f.id, f.name, f.calories, f.protein, f.carbs, f.fat, w.w,
           (select count(*) from w w2 where f.name ~* w2.re) as overlap,
           (split_part(f.name, ',', 1) ~* w.re) as head,
           (f.name ~* '\y(babyfood|infant|imitation|meatless|dehydrated|powder|powdered|freeze-dried|industrial|commodity|school|mix|unprepared)\y') as odd
    from w
    join public.foods f
      on f.source = 'usda'
     and (split_part(f.name, ',', 1) || ',' || split_part(f.name, ',', 2)) ~* w.re
     and f.name !~ '^[A-Z0-9''&.\- ]{3,},'
     and f.name !~* '^(fast foods|restaurant)\y'
  ),
  ranked as (
    select h.*, row_number() over (partition by h.w
             order by h.overlap desc, h.head desc, h.odd asc, length(h.name) asc) as rn
    from hits h
  ),
  best as (
    select distinct on (r.id) r.id, r.name, r.calories, r.protein, r.carbs, r.fat, r.rn, r.overlap
    from ranked r
    where r.rn <= per_word
    order by r.id, r.rn
  )
  select b.id, b.name, b.calories, b.protein, b.carbs, b.fat
  from best b
  order by b.rn, b.overlap desc, b.name
  limit max_rows;
$fn$;

revoke all on function public.food_candidates(text[], int, int) from public;
revoke all on function public.food_candidates(text[], int, int) from anon;
grant execute on function public.food_candidates(text[], int, int) to authenticated;
grant execute on function public.food_candidates(text[], int, int) to service_role;

-- Shared food table: anyone signed in can read, nobody writes from a client.
create policy "read foods" on public.foods
  for select to authenticated using (true);

-- Entitlements and usage are readable by their owner, written only by the server.
create policy "read own subscription" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own ai usage" on public.ai_usage
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------- restaurant menus (2026-09-21) ----------
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

-- ---------- new signups get a profile row ----------
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  insert into public.subscriptions (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- Trigger functions must not be callable over the REST API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- ---------- corrections: the AI path learning from being wrong ----------
-- Applied 2026-09-17 as migration add_personal_food_corrections.
--
-- When someone fixes a number in the "here's what I got" review list, that fix
-- is the most reliable nutrition data this app will ever have about that person:
-- they know what their protein shake is, and we don't. remember_food stores it
-- against the *clean name Claude returned*, not the raw sentence, because that
-- name is what is stable across retellings -- "2 eggz" and "some eggs" both come
-- back as "Eggs", and keying on raw text would learn nothing from the second.
--
-- security invoker (the default): RLS on personal_foods does the access control,
-- exactly as it does for a direct insert from the client. auth.uid() is the only
-- user id this function will ever write.
create or replace function public.remember_food(
  p_phrase text,
  p_name text,
  p_qty text,
  p_calories numeric,
  p_protein numeric,
  p_carbs numeric,
  p_fat numeric
)
returns public.personal_foods
language plpgsql
set search_path = public
as $$
declare
  rec public.personal_foods;
  key text := regexp_replace(btrim(lower(coalesce(p_phrase, ''))), '\s+', ' ', 'g');
begin
  if key = '' then
    raise exception 'remember_food needs a phrase';
  end if;

  insert into public.personal_foods
    (user_id, phrase, name, qty, calories, protein, carbs, fat)
  values
    (auth.uid(), key, p_name, nullif(btrim(coalesce(p_qty, '')), ''),
     p_calories, p_protein, p_carbs, p_fat)
  on conflict (user_id, phrase) do update set
    name = excluded.name,
    qty = excluded.qty,
    calories = excluded.calories,
    protein = excluded.protein,
    carbs = excluded.carbs,
    fat = excluded.fat,
    -- A re-correction is also a use: the person reached for this food again.
    times_used = personal_foods.times_used + 1,
    last_used_at = now()
  returning * into rec;

  return rec;
end;
$$;

revoke all on function public.remember_food(text, text, text, numeric, numeric, numeric, numeric) from public;
revoke all on function public.remember_food(text, text, text, numeric, numeric, numeric, numeric) from anon;
grant execute on function public.remember_food(text, text, text, numeric, numeric, numeric, numeric) to authenticated;

-- Recording that a stored correction got used again. Separate from remember_food
-- because using one changes no values -- and because times_used is what Phase 5's
-- "same as yesterday" and favourites will rank on, so it has to count uses, not
-- just edits. Silently does nothing when the phrase isn't stored, which is the
-- common case and not an error.
create or replace function public.touch_personal_food(p_phrase text)
returns void
language sql
set search_path = public
as $$
  update public.personal_foods
     set times_used = times_used + 1,
         last_used_at = now()
   where user_id = auth.uid()
     and phrase = regexp_replace(btrim(lower(coalesce(p_phrase, ''))), '\s+', ' ', 'g');
$$;

revoke all on function public.touch_personal_food(text) from public;
revoke all on function public.touch_personal_food(text) from anon;
grant execute on function public.touch_personal_food(text) to authenticated;

-- Migration version/name list, for scripts/check_migrations.py. The
-- supabase_migrations schema is not exposed through PostgREST and we hold only
-- the API keys, not the database password, so without this the repo cannot
-- check itself against what is actually applied.
--
-- Returns version and name only, never the SQL body. CREATE FUNCTION grants
-- EXECUTE to PUBLIC by default, so the revokes below are the access control.
create or replace function public.applied_migrations()
returns table(version text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.version, m.name
  from supabase_migrations.schema_migrations m
  order by m.version
$$;

revoke all on function public.applied_migrations() from public, anon, authenticated;
grant execute on function public.applied_migrations() to service_role;
