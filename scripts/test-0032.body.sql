create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;

do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; rec uuid; proj uuid; th uuid; a uuid; b uuid; c uuid; g uuid;
begin
  insert into recordings (creator_id, source, storage_path) values (me, 'phone', 'test/0032') returning id into rec;
  insert into projects (creator_id, name) values (me, 'Launch video 0032') returning id into proj;
  insert into threads (creator_id, title, return_count, project_id) values (me, 'Rooftop 0032', 3, proj) returning id into th;
  insert into suggestions (creator_id, project_id, thread_id, field, source, title, rank) values (me, proj, th, 'format', 'youtube', 'A', 1) returning id into a;
  insert into suggestions (creator_id, project_id, thread_id, field, source, title, rank) values (me, proj, th, 'sound', 'tiktok', 'B', 2) returning id into b;
  insert into suggestions (creator_id, project_id, thread_id, field, source, title, rank) values (me, proj, th, 'aesthetic', 'pinterest', 'C', 3) returning id into c;
  insert into suggestions (creator_id, project_id, thread_id, field, source, title, why_recording_id, why_ms, rank) values (me, proj, th, 'graph', 'graph', 'G', rec, 31000, 4) returning id into g;
  perform set_config('t.a', a::text, true); perform set_config('t.b', b::text, true); perform set_config('t.c', c::text, true);
  perform set_config('t.g', g::text, true); perform set_config('t.th', th::text, true);

  begin
    insert into suggestion_signals (creator_id, suggestion_id, signal) values (me, a, 'open');
    insert into r values (default, 'a signal written outside her session is refused', false, 'inserted');
  exception when raise_exception then
    insert into r values (default, 'a signal written outside her session is refused', true, sqlerrm);
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"user_3JfFAEHAdkvURqPjYDQ4BkVd2rb","role":"authenticated"}', true);
set local role authenticated;
do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; t0 timestamptz := clock_timestamp(); got text; n int;
begin
  perform pin_suggestion(current_setting('t.a')::uuid);
  perform act_on_suggestion(current_setting('t.b')::uuid, 'dismiss');
  perform act_on_suggestion(current_setting('t.c')::uuid, 'hide');
  insert into suggestion_signals (creator_id, suggestion_id, signal) values (me, current_setting('t.g')::uuid, 'open');
  insert into suggestion_signals (creator_id, suggestion_id, signal) values (me, current_setting('t.g')::uuid, 'play_why');
  perform pin_suggestion(current_setting('t.g')::uuid);

  select string_agg(format('%s:%s/%s', kind, field, source), ' ' order by id) into got
    from style_signals where creator_id = me and payload ->> 'thread_id' = current_setting('t.th');
  insert into r values (default, 'each signal writes exactly one style signal, kind / field / source right',
    got = 'suggestion_pin:format/youtube suggestion_dismiss:sound/tiktok suggestion_hide:aesthetic/pinterest '
          'suggestion_open:graph/graph suggestion_play_why:graph/graph suggestion_pin:graph/graph', got);

  select count(*) into n from style_signals where creator_id = me and payload ->> 'suggestion_id' = current_setting('t.a')
    and payload ->> 'project_id' is not null and payload ->> 'thread_id' is not null;
  insert into r values (default, 'the payload carries the suggestion, thread and project', n = 1, n::text);

  perform pin_suggestion(current_setting('t.a')::uuid);
  select count(*) into n from style_signals where creator_id = me and kind = 'suggestion_pin' and payload ->> 'suggestion_id' = current_setting('t.a');
  insert into r values (default, 'pinning again writes no second signal', n = 1, n::text);

  -- A dismissed suggestion never returns: not in the app's query (lib/suggestions.ts loadMoreIdeas) …
  select count(*) into n from suggestions where thread_id = current_setting('t.th')::uuid and status = 'shown' and id = current_setting('t.b')::uuid;
  insert into r values (default, 'dismissed: not in More ideas', n = 0, n::text);
end $$;
reset role;

-- … nor after a reseed (scripts/seed-suggestions.ts: expire what's shown, insert the new five).
do $$
declare st text; n int;
begin
  update suggestions set status = 'expired' where thread_id = current_setting('t.th')::uuid and status = 'shown';
  insert into suggestions (creator_id, thread_id, field, source, title, rank)
    select 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb', current_setting('t.th')::uuid, 'topic', 'youtube', 'New ' || i, i from generate_series(1, 5) i;
  select status into st from suggestions where id = current_setting('t.b')::uuid;
  select count(*) into n from suggestions where thread_id = current_setting('t.th')::uuid and status = 'shown' and id = current_setting('t.b')::uuid;
  insert into r values (default, 'dismissed: still dismissed and not shown after a reseed', st = 'dismissed' and n = 0, st);
end $$;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
