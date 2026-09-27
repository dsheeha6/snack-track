-- product_candidates took 9.7 s: the planner joined the gram set against all
-- 400k foods instead of probing foods_brand_key_idx. Build the grams into an
-- array first and match with brand_key(brand) = any(array), which uses the
-- index (91 ms end to end for a long sentence, most of it planning).
--
-- Superseded by 20260927234903 and then 20260927234951 (final definition),
-- which change only the "kept" filter; the array-then-probe shape is theirs too.
-- See that file for the full body.
select 1;
