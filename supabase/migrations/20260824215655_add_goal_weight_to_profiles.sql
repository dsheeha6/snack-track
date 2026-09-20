-- Phase 3 onboarding asks for a goal weight when the goal is cut or bulk.
-- Nullable: recomp/track users are never asked, and skipping it is allowed.
-- The healthy-BMI floor (PRODUCT.md) is enforced in the app before this is written.
alter table public.profiles add column if not exists goal_weight_lb numeric(6,2);
