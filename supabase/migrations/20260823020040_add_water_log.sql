-- Hydration tracking. Deliberately separate from `entries`: water is a
-- consistency/hydration feature, not a calorie one, so it never touches the
-- calorie or macro totals and never appears as a row in a meal section.
-- Calorie-bearing drinks (coffee with milk, beer) go through `entries` like
-- any other food. See QUESTIONS.md, "Drinks tracking — answered 2026-08-22".
create table public.water_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  logged_on date not null default current_date,
  ounces numeric(6,1) not null check (ounces > 0),
  created_at timestamptz not null default now()
);

create index water_log_user_date_idx on public.water_log (user_id, logged_on desc);

-- RLS matching public.entries exactly: a signed-in user reaches their own
-- rows and nothing else.
alter table public.water_log enable row level security;

create policy "own water log" on public.water_log
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Editable daily goal. Flat default rather than computed from bodyweight —
-- the formulas disagree with each other and it isn't worth a settings argument.
alter table public.profiles
  add column if not exists target_water_oz numeric(6,1) not null default 64;
