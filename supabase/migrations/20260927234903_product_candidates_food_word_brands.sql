-- A brand that is also a food's name ("GELATO", "HUMMUS", "BREAD") matched
-- "gelato" at a restaurant and priced it as a 118 ml pint (hard set h01,
-- 2026-09-25 A/B). food_head_words holds the first comma segment of every
-- generic food (SR Legacy + FNDDS, 2,409 of them); 20260927234951 widens it to
-- every 4+ letter word. Rebuild this table if the generic sources are reloaded.
--
-- This migration also replaced product_candidates' body (food-word brands need
-- two matching words); 20260927234951 replaced it again the same hour and holds
-- the final definition.
create table public.food_head_words (word text primary key);
insert into public.food_head_words
  select distinct public.brand_key(split_part(name, ',', 1))
  from public.foods
  where source in ('usda', 'usda_fndds')
    and public.brand_key(split_part(name, ',', 1)) <> '';
alter table public.food_head_words enable row level security;
create policy "food_head_words readable when signed in"
  on public.food_head_words for select to authenticated using (true);
revoke all on public.food_head_words from anon;
