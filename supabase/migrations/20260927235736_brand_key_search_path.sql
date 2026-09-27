-- Security advisor (function_search_path_mutable) on brand_key. It only calls
-- pg_catalog functions, so pin that. Doesn't change the indexed expression.
-- Measured after: product_candidates 55 ms warm.
alter function public.brand_key(text) set search_path = pg_catalog;
