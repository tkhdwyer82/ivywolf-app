create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;

do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; rec uuid; g uuid; yt uuid;
begin
  insert into recordings (creator_id, source, storage_path) values (me, 'phone', 'test/0031') returning id into rec;
  insert into suggestions (creator_id, field, source, title, why, why_recording_id, why_ms, rank)
    values (me, 'graph', 'graph', 'Told from the ground', 'You keep coming back', rec, 31000, 1) returning id into g;
  insert into suggestions (creator_id, field, source, source_url, title, rank)
    values (me, 'format', 'youtube', 'https://example.com/v', 'Open on the box', 2) returning id into yt;
  perform set_config('t.g', g::text, true); perform set_config('t.yt', yt::text, true); perform set_config('t.rec', rec::text, true);
  begin
    insert into cards (creator_id, title, gist, play_from_ms, confidence, source) values (me, 'x', 'x', 0, 1, 'graph');
    insert into r values (default, 'a graph card still needs its recording', false, 'inserted');
  exception when check_violation then
    insert into r values (default, 'a graph card still needs its recording', true, sqlerrm);
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"user_3JfFAEHAdkvURqPjYDQ4BkVd2rb","role":"authenticated"}', true);
set local role authenticated;
do $$
declare c uuid; src text; rec uuid; ms int;
begin
  c := pin_suggestion(current_setting('t.g')::uuid);
  select source, recording_id, play_from_ms into src, rec, ms from cards where id = c;
  insert into r values (default, 'an own-graph pin keeps source graph, on its recording and moment',
    src = 'graph' and rec = current_setting('t.rec')::uuid and ms = 31000, format('%s %s %s', src, rec, ms));
  c := pin_suggestion(current_setting('t.yt')::uuid);
  select source into src from cards where id = c;
  insert into r values (default, 'a youtube pin is still youtube', src = 'youtube', src);
end $$;
reset role;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
