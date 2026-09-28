create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;

do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; c uuid;
begin
  insert into agent_calls (creator_id, tool, params) values (me, 'list_ideas', '{"since":"2026-09-21","limit":20}') returning id into c;
  perform set_config('t.call', c::text, true);
  update agent_calls set ok = true, latency_ms = 42 where id = c;
  insert into r (check_name, ok, detail)
    select 'a call is logged as muse', source = 'muse' and ok and latency_ms = 42, source || ' ' || ok::text from agent_calls where id = c;
end $$;

-- ── She can't read or write the log ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"user_3JfFAEHAdkvURqPjYDQ4BkVd2rb","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from agent_calls;
  insert into r (check_name, ok, detail) values ('she can''t read agent_calls', n = 0, n::text);
  begin
    insert into agent_calls (creator_id, tool) values ('user_3JfFAEHAdkvURqPjYDQ4BkVd2rb', 'list_ideas');
    insert into r (check_name, ok, detail) values ('she can''t write agent_calls', false, 'inserted');
  exception when insufficient_privilege then
    insert into r (check_name, ok, detail) values ('she can''t write agent_calls', true, sqlerrm);
  end;
end $$;
reset role;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
