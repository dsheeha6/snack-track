-- Move pg_trgm out of the public schema
create schema if not exists extensions;
drop index if exists public.foods_name_trgm_idx;
alter extension pg_trgm set schema extensions;
create index foods_name_trgm_idx on public.foods using gin (name extensions.gin_trgm_ops);

-- These are trigger functions. Nothing should be able to call them over the REST API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
