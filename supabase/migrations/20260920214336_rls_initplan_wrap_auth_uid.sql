-- Wrap auth.uid() in a scalar subquery in every RLS policy.
--
-- Without the (select ...), Postgres treats auth.uid() as volatile per-row and
-- re-evaluates it for every candidate row. Wrapped, it becomes an InitPlan
-- evaluated once per statement. Same access control, same result set - this is
-- purely how often the function runs.
--
-- ALTER POLICY rather than DROP + CREATE on purpose: there is never an instant
-- where the table sits without its policy.
--
-- public.foods is deliberately absent: its "read foods" policy is `using (true)`
-- and calls nothing.

alter policy "own profile" on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy "own targets" on public.target_history
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "own entries" on public.entries
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "own personal foods" on public.personal_foods
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "own weights" on public.weights
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "own suggestion feedback" on public.suggestion_feedback
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "own water log" on public.water_log
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- SELECT-only policies take USING alone; WITH CHECK is not applicable.
-- ai_usage stays read-only to its owner: rows are written by the edge function
-- with the service_role key, which bypasses RLS. That split is Phase 6's
-- unforgeable free-tier count and must not become client-writable here.
alter policy "read own ai usage" on public.ai_usage
  using ((select auth.uid()) = user_id);

alter policy "read own subscription" on public.subscriptions
  using ((select auth.uid()) = user_id);
