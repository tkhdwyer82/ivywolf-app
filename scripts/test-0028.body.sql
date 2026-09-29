create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;

-- Fixtures, as the service role: a recording, a project and a thread for "me", one suggestion each for me and other.
do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; other text := 'user_3JfYR4D8eJVCL3yieXStYYoqwaH';
        rec uuid; proj uuid; th uuid; s_me uuid; s_other uuid;
begin
  insert into recordings (creator_id, source, storage_path) values (me, 'phone', 'test/0028') returning id into rec;
  insert into projects (creator_id, name) values (me, 'Launch video 0028') returning id into proj;
  insert into threads (creator_id, title, return_count, project_id) values (me, 'Rooftop chase 0028', 3, proj) returning id into th;
  insert into suggestions (creator_id, project_id, thread_id, field, source, title, why, why_recording_id, why_ms, rank)
    values (me, proj, th, 'format', 'youtube', 'Open on the box', 'you said "box tips over first" on Thu 0:31', rec, 31000, 1)
    returning id into s_me;
  insert into suggestions (creator_id, field, source, title, rank) values (other, 'sound', 'tiktok', 'Not hers', 1) returning id into s_other;
  perform set_config('t.rec', rec::text, true);
  perform set_config('t.me', s_me::text, true);
  perform set_config('t.other', s_other::text, true);

  insert into r (check_name, ok, detail)
    select 'RLS is on for the three new tables', count(*) = 3, string_agg(relname, ', ')
      from pg_class where relname in ('suggestions', 'suggestion_signals', 'style_signals') and relrowsecurity;

  -- cards.source widened; a pinned card may have no recording, a voice card may not.
  begin
    insert into cards (creator_id, title, gist, play_from_ms, confidence, source, source_url, source_suggestion_id)
      values (me, 'Open on the box', 'Open on the box', 0, 1, 'youtube', 'https://youtube.com/watch?v=x', s_me);
    insert into r (check_name, ok, detail) values ('a youtube card needs no recording', true, 'inserted');
  exception when others then
    insert into r (check_name, ok, detail) values ('a youtube card needs no recording', false, sqlerrm);
  end;
  begin
    insert into cards (creator_id, title, gist, play_from_ms, confidence, source) values (me, 'x', 'x', 0, 1, 'voice');
    insert into r (check_name, ok, detail) values ('a voice card still needs its recording', false, 'inserted');
  exception when check_violation then
    insert into r (check_name, ok, detail) values ('a voice card still needs its recording', true, sqlerrm);
  end;
  begin
    insert into cards (creator_id, recording_id, title, gist, play_from_ms, confidence, source) values (me, rec, 'x', 'x', 0, 1, 'myspace');
    insert into r (check_name, ok, detail) values ('an unknown source is refused', false, 'inserted');
  exception when check_violation then
    insert into r (check_name, ok, detail) values ('an unknown source is refused', true, sqlerrm);
  end;
  begin
    insert into cards (creator_id, recording_id, title, gist, play_from_ms, confidence, source) values (me, rec, 'x', 'x', 0, 1, 'muse');
    insert into r (check_name, ok, detail) values ('muse is a card source', true, 'inserted');
  exception when others then
    insert into r (check_name, ok, detail) values ('muse is a card source', false, sqlerrm);
  end;
end $$;

-- As her.
select set_config('request.jwt.claims', '{"sub":"user_3JfFAEHAdkvURqPjYDQ4BkVd2rb","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int; sid bigint; f text; src text;
begin
  select count(*) into n from suggestions;
  insert into r (check_name, ok, detail) values ('she sees her suggestions, not another creator''s', n = 1 and exists (select 1 from suggestions where id = current_setting('t.me')::uuid), n::text);

  begin
    update suggestions set status = 'pinned' where id = current_setting('t.me')::uuid;
    get diagnostics n = row_count;
    insert into r (check_name, ok, detail) values ('she can''t change a suggestion''s status directly', n = 0, n::text || ' updated');
  end;

  insert into suggestion_signals (creator_id, suggestion_id, signal) values ('user_3JfFAEHAdkvURqPjYDQ4BkVd2rb', current_setting('t.me')::uuid, 'open');
  insert into r (check_name, ok, detail) values ('she logs an open on her own suggestion', true, 'inserted');
  begin
    insert into suggestion_signals (creator_id, suggestion_id, signal) values ('user_3JfFAEHAdkvURqPjYDQ4BkVd2rb', current_setting('t.me')::uuid, 'pin');
    insert into r (check_name, ok, detail) values ('a pin can''t be logged without pinning', false, 'inserted');
  exception when insufficient_privilege then
    insert into r (check_name, ok, detail) values ('a pin can''t be logged without pinning', true, sqlerrm);
  end;
  begin
    insert into suggestion_signals (creator_id, suggestion_id, signal) values ('user_3JfFAEHAdkvURqPjYDQ4BkVd2rb', current_setting('t.other')::uuid, 'open');
    insert into r (check_name, ok, detail) values ('she can''t log on another creator''s suggestion', false, 'inserted');
  exception when insufficient_privilege then
    insert into r (check_name, ok, detail) values ('she can''t log on another creator''s suggestion', true, sqlerrm);
  end;

  sid := write_style_signal('suggestion_pin', '{"field":"format","source":"youtube","suggestion_id":"x"}');
  select field, source into f, src from style_signals where id = sid;
  insert into r (check_name, ok, detail) values ('write_style_signal writes hers, field and source lifted', f = 'format' and src = 'youtube', coalesce(f, '∅') || ' ' || coalesce(src, '∅'));
  begin
    insert into style_signals (creator_id, kind) values ('user_3JfFAEHAdkvURqPjYDQ4BkVd2rb', 'take_pick');
    insert into r (check_name, ok, detail) values ('style_signals are written only through write_style_signal', false, 'inserted');
  exception when insufficient_privilege then
    insert into r (check_name, ok, detail) values ('style_signals are written only through write_style_signal', true, sqlerrm);
  end;
end $$;
reset role;

-- Deleting the recording forgets the quote; the suggestion stays.
do $$
declare w text; still boolean;
begin
  delete from recordings where id = current_setting('t.rec')::uuid;
  select why, true into w, still from suggestions where id = current_setting('t.me')::uuid;
  insert into r (check_name, ok, detail) values ('deleting her recording removes the why that quotes it', still and w is null, coalesce(w, '∅'));
end $$;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
