-- Lets scripts/check_migrations.py see what is actually applied, so the repo's
-- supabase/migrations/ can be checked against reality from a plain shell.
--
-- supabase_migrations is not a PostgREST-exposed schema and we do not have the
-- database password - only the API keys - so without this the check cannot run
-- outside an MCP session.
--
-- Deliberately returns version and name ONLY, never the SQL body, and is
-- revoked from public/anon/authenticated. CREATE FUNCTION grants EXECUTE to
-- PUBLIC by default, so the revoke is the security control, not an extra.
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

comment on function public.applied_migrations() is
  'Migration version/name list for scripts/check_migrations.py. service_role only.';
