-- SNACK TRACK initial schema
create extension if not exists pg_trgm;

create type meal_slot as enum ('breakfast','lunch','dinner','snacks');
create type goal_type as enum ('cut','recomp','bulk','track');
create type entry_source as enum ('manual','ai','database','history','suggestion');

-- who the person is and what they're aiming at
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
  target_calories int not null default 2200,
  target_protein int not null default 165,
  target_carbs int not null default 220,
  target_fat int not null default 70,
  hide_calorie_numbers boolean not null default false,
  food_preferences jsonb not null default '{}'::jsonb,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- every target change, so adaptive TDEE has a history to reason over
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

-- the food log
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
  created_at timestamptz not null default now()
);
create index entries_user_date_idx on public.entries (user_id, eaten_on desc);

-- shared food database (USDA / Open Food Facts). Read-only to clients.
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
create index foods_name_trgm_idx on public.foods using gin (name gin_trgm_ops);

-- the moat: what each person's own words resolve to
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

-- daily weigh-ins, for the trend line and adaptive TDEE
create table public.weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  measured_on date not null default current_date,
  weight_lb numeric(6,2) not null,
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

-- what people accept and skip, so suggestions learn
create table public.suggestion_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  suggestion_name text not null,
  action text not null check (action in ('shown','skipped','rejected','logged')),
  created_at timestamptz not null default now()
);
create index suggestion_feedback_user_idx on public.suggestion_feedback (user_id, created_at desc);

-- entitlements, written by the RevenueCat webhook (service role only)
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

-- metering, so unlimited never means unmetered
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

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.target_history enable row level security;
alter table public.entries enable row level security;
alter table public.foods enable row level security;
alter table public.personal_foods enable row level security;
alter table public.weights enable row level security;
alter table public.suggestion_feedback enable row level security;
alter table public.subscriptions enable row level security;
alter table public.ai_usage enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "own targets" on public.target_history
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own entries" on public.entries
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own personal foods" on public.personal_foods
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own weights" on public.weights
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own suggestion feedback" on public.suggestion_feedback
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- shared food table: anyone signed in can read, nobody can write from a client
create policy "read foods" on public.foods
  for select to authenticated using (true);

-- entitlements and usage are readable by their owner, written only by the server
create policy "read own subscription" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);

create policy "read own ai usage" on public.ai_usage
  for select to authenticated using (auth.uid() = user_id);

-- ---------- new signups get a profile row ----------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

-- ---------- keep updated_at honest ----------
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();
