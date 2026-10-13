
-- Fixtures, as the service role: one recording with two ideas and a to-do, another with one idea and a to-do, a
-- link between the first two ideas, both in a thread, the first one shared.
do $$
declare
  me text := 'user_3JfYR4D8eJVCL3yieXStYYoqwaH';
  r1 uuid; r2 uuid; a uuid; b uuid; c uuid; t1 uuid; t2 uuid; th uuid;
begin
  insert into recordings (creator_id, source, storage_path, status) values (me, 'phone', 'test/0040-a.m4a', 'done') returning id into r1;
  insert into recordings (creator_id, source, storage_path, status) values (me, 'phone', 'test/0040-b.m4a', 'done') returning id into r2;
  insert into cards (creator_id, recording_id, title, gist, play_from_ms, confidence) values (me, r1, 'Trash A', 'g', 0, 0.9) returning id into a;
  insert into cards (creator_id, recording_id, title, gist, play_from_ms, confidence) values (me, r1, 'Trash B', 'g', 1000, 0.9) returning id into b;
  insert into cards (creator_id, recording_id, title, gist, play_from_ms, confidence) values (me, r2, 'Trash C', 'g', 0, 0.9) returning id into c;
  insert into actions (creator_id, recording_id, text) values (me, r1, 'To-do from A/B') returning id into t1;
  insert into actions (creator_id, recording_id, text) values (me, r2, 'To-do from C') returning id into t2;
  insert into card_links (card_a, card_b, creator_id) values (least(a, b), greatest(a, b), me);
  insert into threads (creator_id, title) values (me, 'Trash thread') returning id into th;
  insert into thread_cards (thread_id, card_id) values (th, a), (th, b);
  update cards set shared_at = now() where id = a;
  perform set_config('t.r1', r1::text, true); perform set_config('t.r2', r2::text, true);
  perform set_config('t.a', a::text, true); perform set_config('t.b', b::text, true); perform set_config('t.c', c::text, true);
  perform set_config('t.t1', t1::text, true); perform set_config('t.t2', t2::text, true); perform set_config('t.th', th::text, true);

  update recordings set discarded_at = now() where id = r2;
  insert into r values (default, 'recordings.discarded_at takes a time', (select discarded_at is not null from recordings where id = r2), r2::text);
  update recordings set discarded_at = null where id = r2;
end $$;

select set_config('request.jwt.claims', '{"sub":"user_3JfYR4D8eJVCL3yieXStYYoqwaH","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  a uuid := current_setting('t.a')::uuid; b uuid := current_setting('t.b')::uuid; c uuid := current_setting('t.c')::uuid;
  t1 uuid := current_setting('t.t1')::uuid; t2 uuid := current_setting('t.t2')::uuid; th uuid := current_setting('t.th')::uuid;
  res jsonb; n int; ok boolean;
begin
  -- A has a sibling (B): it goes alone; the recording's to-do stays.
  res := trash_card(a);
  insert into r values (default, 'trash_card trashes the idea', res ->> 'card' = a::text, res::text);
  select count(*) into n from cards where id = a;
  insert into r values (default, 'a trashed idea is hidden from her reads', n = 0, n::text);
  select count(*) into n from cards where id = b;
  insert into r values (default, 'its sibling from the same recording stays', n = 1, n::text);
  select count(*) into n from actions where id = t1;
  insert into r values (default, 'with a live sibling, the recording''s to-do stays', n = 1 and (res ->> 'actions')::int = 0, res::text);
  select count(*) into n from card_links where a in (card_a, card_b);
  insert into r values (default, 'links on a trashed idea are hidden', n = 0, n::text);
  select count(*) into n from thread_cards where thread_id = th;
  insert into r values (default, 'thread counts leave the trashed idea out', n = 1, n::text);
  insert into r values (default, 'a trashed idea''s public page stops answering', shared_card(a) is null, coalesce(shared_card(a)::text, 'null'));
  select count(*) into n from trashed_items() where id = a and kind = 'idea' and purge_at = trashed_at + interval '30 days';
  insert into r values (default, 'the trash view lists it, with its purge day', n = 1, n::text);
  res := trash_card(a);
  insert into r values (default, 'trashing twice is a no-op', res is null, coalesce(res::text, 'null'));

  -- C is the last idea of its recording: its to-do goes with it, and comes back with it.
  res := trash_card(c);
  select count(*) into n from actions where id = t2;
  insert into r values (default, 'the last idea of a recording carries its to-dos to the trash', n = 0 and (res ->> 'actions')::int = 1, res::text);
  select count(*) into n from trashed_items() where id = t2 and kind = 'to-do';
  insert into r values (default, 'the carried to-do is in the trash view', n = 1, n::text);
  ok := restore_card(c);
  select count(*) into n from actions where id = t2;
  insert into r values (default, 'restoring the idea brings its carried to-dos back', ok and n = 1 and exists (select 1 from cards where id = c), n::text);

  ok := restore_card(a);
  select count(*) into n from card_links where a in (card_a, card_b);
  insert into r values (default, 'restore puts the links back', ok and n = 1, n::text);
  select count(*) into n from thread_cards where thread_id = th;
  insert into r values (default, 'restore puts the thread membership back', n = 2, n::text);

  -- To-dos on their own.
  ok := trash_action(t1);
  select count(*) into n from actions where id = t1;
  insert into r values (default, 'trash_action hides a to-do', ok and n = 0, n::text);
  ok := restore_action(t1);
  select count(*) into n from actions where id = t1;
  insert into r values (default, 'restore_action brings it back', ok and n = 1, n::text);

  -- A direct update to trashed_at is refused: the new row fails the select policy.
  begin
    update cards set trashed_at = now() where id = b;
    insert into r values (default, 'trashing goes through trash_card, not a direct update', false, 'updated');
  exception when others then
    insert into r values (default, 'trashing goes through trash_card, not a direct update', true, sqlerrm);
  end;
end $$;
reset role;

-- Another creator can't trash or restore her ideas, or see her trash.
select set_config('request.jwt.claims', '{"sub":"user_someone_else","role":"authenticated"}', true);
set local role authenticated;
do $$
declare b uuid := current_setting('t.b')::uuid; res jsonb; n int;
begin
  res := trash_card(b);
  insert into r values (default, 'another creator can''t trash her idea', res is null, coalesce(res::text, 'null'));
  select count(*) into n from trashed_items();
  insert into r values (default, 'another creator sees none of her trash', n = 0, n::text);
end $$;
reset role;

do $$
declare n int;
begin
  select count(*) into n from cards where id = current_setting('t.b')::uuid and trashed_at is null;
  insert into r values (default, 'her idea is untouched by the other creator', n = 1, n::text);
end $$;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
