create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;

do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; other text := 'user_3JfYR4D8eJVCL3yieXStYYoqwaH';
        rec uuid; proj uuid; th uuid; near uuid; yt uuid; g uuid; d uuid; o uuid;
begin
  insert into recordings (creator_id, source, storage_path) values (me, 'phone', 'test/0030') returning id into rec;
  insert into projects (creator_id, name) values (me, 'Launch video 0030') returning id into proj;
  insert into threads (creator_id, title, return_count, project_id) values (me, 'Rooftop 0030', 3, proj) returning id into th;
  insert into cards (creator_id, recording_id, project_id, title, gist, play_from_ms, confidence) values (me, rec, proj, 'Rooftop chase', 'g', 31000, 0.9) returning id into near;
  insert into thread_cards values (th, near);
  insert into suggestions (creator_id, project_id, thread_id, near_card_id, field, source, source_url, title, frame_url, rank)
    values (me, proj, th, near, 'format', 'youtube', 'https://example.com/v', 'Open on the box', 'https://example.com/f.jpg', 1) returning id into yt;
  insert into suggestions (creator_id, project_id, thread_id, near_card_id, field, source, title, why, why_recording_id, why_ms, rank)
    values (me, proj, th, near, 'graph', 'graph', 'Told from the ground', 'You keep coming back', rec, 31000, 2) returning id into g;
  insert into suggestions (creator_id, project_id, thread_id, field, source, title, rank, status) values (me, proj, th, 'sound', 'tiktok', 'Gone', 3, 'dismissed') returning id into d;
  insert into suggestions (creator_id, field, source, title, rank) values (other, 'sound', 'tiktok', 'Not hers', 1) returning id into o;
  perform set_config('t.yt', yt::text, true); perform set_config('t.g', g::text, true);
  perform set_config('t.d', d::text, true); perform set_config('t.o', o::text, true);
  perform set_config('t.th', th::text, true); perform set_config('t.proj', proj::text, true); perform set_config('t.rec', rec::text, true);
end $$;

select set_config('request.jwt.claims', '{"sub":"user_3JfFAEHAdkvURqPjYDQ4BkVd2rb","role":"authenticated"}', true);
set local role authenticated;
do $$
declare c1 uuid; c2 uuid; n int; src text; st text; fs text; p uuid; rec uuid; inthread boolean; sig int;
begin
  c1 := pin_suggestion(current_setting('t.yt')::uuid);
  c2 := pin_suggestion(current_setting('t.yt')::uuid);
  select count(*) into n from cards where source_suggestion_id = current_setting('t.yt')::uuid;
  insert into r values (default, 'pin makes exactly one card; pinning again returns it', n = 1 and c1 = c2, format('%s cards, same=%s', n, c1 = c2));

  select source, frame_status, project_id, recording_id into src, fs, p, rec from cards where id = c1;
  insert into r values (default, 'the card: source youtube, frame done, her project, no recording',
    src = 'youtube' and fs = 'done' and p = current_setting('t.proj')::uuid and rec is null, format('%s %s %s', src, fs, rec));
  select exists (select 1 from thread_cards where thread_id = current_setting('t.th')::uuid and card_id = c1) into inthread;
  insert into r values (default, 'the card is in the thread', inthread, inthread::text);
  select status into st from suggestions where id = current_setting('t.yt')::uuid;
  select count(*) into sig from suggestion_signals where suggestion_id = current_setting('t.yt')::uuid and signal = 'pin';
  insert into r values (default, 'the suggestion is pinned, one pin signal', st = 'pinned' and sig = 1, format('%s %s', st, sig));

  c1 := pin_suggestion(current_setting('t.g')::uuid);
  select source, recording_id, play_from_ms::text into src, rec, st from cards where id = c1;
  insert into r values (default, 'a graph suggestion pins as her own card, on its recording and moment',
    src = 'voice' and rec = current_setting('t.rec')::uuid and st = '31000', format('%s %s %s', src, rec, st));

  begin
    perform pin_suggestion(current_setting('t.d')::uuid);
    insert into r values (default, 'a dismissed suggestion can''t be pinned', false, 'pinned');
  exception when raise_exception then
    insert into r values (default, 'a dismissed suggestion can''t be pinned', true, sqlerrm);
  end;
  begin
    perform pin_suggestion(current_setting('t.o')::uuid);
    insert into r values (default, 'another creator''s suggestion can''t be pinned', false, 'pinned');
  exception when raise_exception then
    insert into r values (default, 'another creator''s suggestion can''t be pinned', true, sqlerrm);
  end;
  begin
    perform act_on_suggestion(current_setting('t.yt')::uuid, 'dismiss');
    select status into st from suggestions where id = current_setting('t.yt')::uuid;
    insert into r values (default, 'a pinned suggestion can''t be dismissed after', st = 'pinned', st);
  end;
end $$;
reset role;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
