-- Supabase's own "auto-enable RLS on new public tables" event trigger function.
-- It is SECURITY DEFINER and was exposed at /rest/v1/rpc/rls_auto_enable. An
-- event-trigger function can't be invoked directly, but nobody needs to call
-- it through the API either; the ensure_rls event trigger still fires.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
