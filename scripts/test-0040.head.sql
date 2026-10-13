-- Rolled-back test for 0040 (write, test in a rolled-back transaction, dry-run, push). Job B.3: discard and trash.
--
--   node scripts/build-sql-test.mjs 0040 && supabase db query --linked -f scripts/test-0040.sql
create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;
