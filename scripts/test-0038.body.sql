create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;

do $$
declare
  me text := 'user_3JfYR4D8eJVCL3yieXStYYoqwaH';
  proj uuid := 'ede3b0af-ae8c-4c53-a6e2-b126d92015dd'; -- Launch video
  c record; d uuid; v uuid; w uuid; n int; prof jsonb;
begin
  select id, recording_id, play_from_ms into c from cards where project_id = proj order by created_at limit 1;
  select format_profile into prof from projects where id = proj;
  insert into r values (default, 'existing projects get a profile', prof ? 'kept' and prof ? 'dismissed', prof::text);

  insert into suggestions (creator_id, project_id, field, source, title, gist, why, why_recording_id, why_ms, rank, kind,
                           cite_card_ids, format, visual_query, status, generated_at, model_version)
  values (me, proj, 'graph', 'graph', 'Test direction', 'gist', 'from Thu 0:31: “x”', c.recording_id, c.play_from_ms, 1,
          'direction', array[c.id], 'board', 'dusk rooftops', 'new', now(), 'direction_v1') returning id into d;
  update suggestions set payload = '{"board": {"hook": "Open on the drop", "beats": ["Run", "Leap", "Hold it up"]}}' where id = d;
  insert into suggestions (creator_id, project_id, field, source, title, why, why_recording_id, rank, kind, cite_card_ids,
                           format, status, generated_at, model_version)
  values (me, proj, 'graph', 'graph', 'Video direction', 'from Thu 0:31: “y”', c.recording_id, 2, 'direction', array[c.id],
          'video', 'new', now(), 'direction_v1') returning id into v;
  insert into r values (default, 'a complete direction is accepted', true, d::text);
  begin
    insert into suggestions (creator_id, project_id, field, source, title, rank, kind, format, status, generated_at, model_version)
    values (me, proj, 'graph', 'graph', 'No cite', 3, 'direction', 'text', 'new', now(), 'direction_v1');
    insert into r values (default, 'a direction without a cited line and card is refused', false, 'inserted');
  exception when check_violation then
    insert into r values (default, 'a direction without a cited line and card is refused', true, sqlerrm);
  end;
  insert into suggestions (creator_id, project_id, field, source, title, why, why_recording_id, rank, kind, cite_card_ids,
                           format, status, generated_at, model_version)
  values (me, proj, 'graph', 'graph', 'Bare video', 'from Thu 0:31: “z”', c.recording_id, 4, 'direction', array[c.id],
          'video', 'new', now(), 'direction_v1') returning id into w;
  perform set_config('t.w', w::text, true);
  perform set_config('t.d', d::text, true);
  perform set_config('t.v', v::text, true);
  perform set_config('t.c', c.id::text, true);
end $$;

select set_config('request.jwt.claims', '{"sub":"user_3JfYR4D8eJVCL3yieXStYYoqwaH","role":"authenticated"}', true);
set local role authenticated;
do $$
declare card uuid; card2 uuid; n int; s text; src text; shp text; rec uuid; prof jsonb; stale timestamptz;
begin
  card := save_direction(current_setting('t.d')::uuid);
  select source, shape, recording_id into src, shp, rec from cards where id = card;
  insert into r values (default, 'Save makes a card: source direction, form and payload kept, cite carried', src = 'direction' and shp = 'board' and rec is not null
    and (select board ->> 'hook' from cards where id = card) = 'Open on the drop', format('%s %s', src, shp));
  select status into s from suggestions where id = current_setting('t.d')::uuid;
  insert into r values (default, 'the direction is saved', s = 'saved', s);
  card2 := save_direction(current_setting('t.d')::uuid);
  insert into r values (default, 'saving twice returns the same card', card2 = card, card2::text);

  card2 := save_direction(current_setting('t.w')::uuid);
  select shape into shp from cards where id = card2;
  insert into r values (default, 'a video with no board payload saves as text, not a failure', shp = 'text', shp);
  perform heart_direction(current_setting('t.v')::uuid, true);
  select count(*) into n from suggestions where id = current_setting('t.v')::uuid and hearted_at is not null;
  insert into r values (default, '♥ marks a favourite', n = 1, n::text);
  perform dismiss_direction(current_setting('t.v')::uuid);
  select status into s from suggestions where id = current_setting('t.v')::uuid;
  insert into r values (default, '✕ dismisses', s = 'dismissed', s);
  begin
    perform save_direction(current_setting('t.v')::uuid);
    insert into r values (default, 'a dismissed direction can''t be saved', false, 'saved');
  exception when others then
    insert into r values (default, 'a dismissed direction can''t be saved', true, sqlerrm);
  end;
end $$;
reset role;

do $$
declare prof jsonb; stale timestamptz; before timestamptz; video_card uuid;
begin
  select format_profile, directions_stale_at into prof, stale from projects where id = 'ede3b0af-ae8c-4c53-a6e2-b126d92015dd';
  insert into r values (default, 'a ✕ feeds the profile (dismissed: video)', (prof -> 'dismissed' ->> 'video')::int >= 1, prof -> 'dismissed' ->> 'video');
  insert into r values (default, 'a saved direction lands as a kept board', (prof -> 'kept' ->> 'board')::int >= 1, prof -> 'kept' ->> 'board');
  insert into r values (default, 'a new card marks directions due', stale > now() - interval '1 minute', stale::text);
  update projects set directions_stale_at = null where id = 'ede3b0af-ae8c-4c53-a6e2-b126d92015dd';
  update cards set hearted_at = now() where id = current_setting('t.c')::uuid;
  select directions_stale_at into stale from projects where id = 'ede3b0af-ae8c-4c53-a6e2-b126d92015dd';
  insert into r values (default, 'a heart marks directions due', stale is not null, coalesce(stale::text, 'null'));
end $$;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
