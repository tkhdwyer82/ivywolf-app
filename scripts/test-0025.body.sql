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

-- ── Rate limits ───────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; other text := 'user_3JfYR4D8eJVCL3yieXStYYoqwaH';
        ok_to_run boolean; allowed_n int := 0; i int; n int;
begin
  delete from agent_calls where creator_id in (me, other);  -- a clean minute (rolled back)
  for i in 1..10 loop
    select allowed into ok_to_run from start_agent_call(me, null, 'capture_idea', '{}');
    allowed_n := allowed_n + ok_to_run::int;
  end loop;
  select allowed into ok_to_run from start_agent_call(me, null, 'capture_idea', '{}');
  insert into r (check_name, ok, detail) values ('10 captures a minute, the 11th refused', allowed_n = 10 and not ok_to_run, allowed_n::text || ' then ' || ok_to_run::text);

  select allowed into ok_to_run from start_agent_call(me, null, 'list_ideas', '{}');
  insert into r (check_name, ok, detail) values ('reads still allowed after the capture limit', ok_to_run, ok_to_run::text);

  allowed_n := 0;
  for i in 1..60 loop
    select allowed into ok_to_run from start_agent_call(me, null, 'list_ideas', '{}');
    allowed_n := allowed_n + ok_to_run::int;
  end loop;
  -- 11 allowed so far (10 captures + 1 read), so 49 more fit in the 60.
  insert into r (check_name, ok, detail) values ('60 calls a minute in all', allowed_n = 49, allowed_n::text || ' of 60 allowed');

  select count(*) into n from agent_calls where creator_id = me and error = 'rate_limited' and ok = false;
  insert into r (check_name, ok, detail) values ('refusals are logged, closed', n = 12, n::text);

  select allowed into ok_to_run from start_agent_call(other, null, 'list_ideas', '{}');
  insert into r (check_name, ok, detail) values ('another creator has her own minute', ok_to_run, ok_to_run::text);

  update agent_calls set created_at = now() - interval '61 seconds' where creator_id = me;
  select allowed into ok_to_run from start_agent_call(me, null, 'capture_idea', '{}');
  insert into r (check_name, ok, detail) values ('a minute later she can go again (refusals didn''t count)', ok_to_run, ok_to_run::text);
end $$;

-- ── capture_idempotency ───────────────────────────────────────────────────────────────────────────────────────
do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; rec uuid; n int;
begin
  insert into recordings (creator_id, source, storage_path) values (me, 'phone', 'test/0025') returning id into rec;
  insert into capture_idempotency (creator_id, key, text_hash, recording_id) values (me, 'key-0025-a', 'h', rec);
  perform set_config('t.rec', rec::text, true);
  begin
    insert into capture_idempotency (creator_id, key, text_hash) values (me, 'key-0025-a', 'h2');
    insert into r (check_name, ok, detail) values ('a key is claimed once', false, 'inserted twice');
  exception when unique_violation then
    insert into r (check_name, ok, detail) values ('a key is claimed once', true, sqlerrm);
  end;
  insert into capture_idempotency (creator_id, key, text_hash) values ('user_3JfYR4D8eJVCL3yieXStYYoqwaH', 'key-0025-a', 'h');
  insert into r (check_name, ok, detail) values ('keys are per creator', true, 'same key, other creator: ok');

  delete from recordings where id = rec;
  select count(*) into n from capture_idempotency where creator_id = me and key = 'key-0025-a';
  insert into r (check_name, ok, detail) values ('the key goes with its recording', n = 0, n::text);
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
  select count(*) into n from capture_idempotency;
  insert into r (check_name, ok, detail) values ('she can''t read capture_idempotency', n = 0, n::text);
  begin
    perform start_agent_call('user_3JfFAEHAdkvURqPjYDQ4BkVd2rb', null, 'list_ideas', '{}');
    insert into r (check_name, ok, detail) values ('she can''t call start_agent_call', false, 'called');
  exception when insufficient_privilege then
    insert into r (check_name, ok, detail) values ('she can''t call start_agent_call', true, sqlerrm);
  end;
end $$;
reset role;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
