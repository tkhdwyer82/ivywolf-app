-- Rolled-back test for 0041 (write, test in a rolled-back transaction, dry-run, push). Job B.3: Undo's stamp.
--
--   node scripts/build-sql-test.mjs 0041 && supabase db query --linked -f scripts/test-0041.sql
create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;
