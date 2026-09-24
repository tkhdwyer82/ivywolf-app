-- Rolled-back test for 0021 (brief: write, test in a rolled-back transaction, dry-run, push).
-- Applies the migration inside the transaction, runs as the creator through RLS, and rolls everything back.
begin;
-- My things (P4): "done yesterday" on a to-do, and Merge on Ivy's "these might be one idea".
--
-- actions.done_at: when she ticked it. Set and cleared by trigger whenever `done` flips, so every writer (the app,
-- Undo, a future Reminders sync) gets it right without sending it. Existing done rows have no time; P4 shows
-- them as "done" with no day.
--
-- accept_merge(suggestion): her Merge. The suggestion pairs two cards in different threads (threading.ts
-- proposes, never merges — CLAUDE.md, CA2). Accepting folds the smaller thread into the larger (ties: the older
-- one survives): its cards and boards move over, return_count adds up, first/last seen widen, the centroid is
-- recomputed from the cards, and the emptied thread is deleted. Any other proposal whose two cards now share a
-- thread is accepted with it. The survivor keeps its title and project. Her own proposals only.

alter table actions add column done_at timestamptz;

create function stamp_action_done() returns trigger
language plpgsql
as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at := now();
  elsif not new.done then
    new.done_at := null;
  end if;
  return new;
end;
$$;

create trigger actions_stamp_done before insert or update of done on actions
  for each row execute function stamp_action_done();

create function accept_merge(p_suggestion_id uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s merge_suggestions;
  ta uuid;
  tb uuid;
  keep uuid;
  fold uuid;
begin
  select * into s from merge_suggestions
   where id = p_suggestion_id and creator_id = (auth.jwt() ->> 'sub') and status = 'proposed';
  if not found then
    return null;
  end if;

  select thread_id into ta from thread_cards where card_id = s.a_card_id limit 1;
  select thread_id into tb from thread_cards where card_id = s.b_card_id limit 1;

  if ta is null and tb is null then
    -- Neither card is threaded (shouldn't happen): nothing to fold; she's said they're one idea, so record it.
    update merge_suggestions set status = 'accepted' where id = s.id;
    return null;
  elsif ta is null or tb is null or ta = tb then
    keep := coalesce(ta, tb);
    insert into thread_cards (thread_id, card_id)
      select keep, c from unnest(array[s.a_card_id, s.b_card_id]) c
      on conflict do nothing;
  else
    -- The larger thread survives; on a tie, the older.
    select t.id into keep
      from threads t
     where t.id in (ta, tb)
     order by (select count(*) from thread_cards tc where tc.thread_id = t.id) desc, t.first_seen, t.id
     limit 1;
    fold := case when keep = ta then tb else ta end;

    insert into thread_cards (thread_id, card_id)
      select keep, card_id from thread_cards where thread_id = fold
      on conflict do nothing;
    update boards set thread_id = keep where thread_id = fold;
    update threads k
       set return_count = k.return_count + f.return_count,
           first_seen = least(k.first_seen, f.first_seen),
           last_seen = greatest(k.last_seen, f.last_seen)
      from threads f
     where k.id = keep and f.id = fold;
    delete from threads where id = fold;
  end if;

  update threads
     set embedding = (select avg(c.embedding) from thread_cards tc join cards c on c.id = tc.card_id where tc.thread_id = keep)
   where id = keep;

  update merge_suggestions m
     set status = 'accepted'
   where m.creator_id = s.creator_id
     and m.status = 'proposed'
     and (m.id = s.id or exists (
       select 1 from thread_cards x join thread_cards y on y.thread_id = x.thread_id
        where x.card_id = m.a_card_id and y.card_id = m.b_card_id
     ));
  return keep;
end;
$$;
revoke execute on function accept_merge(uuid) from public, anon;
grant execute on function accept_merge(uuid) to authenticated;

-- ── Fixtures (her creator row; everything below is rolled back) ──────────────────────────────────────────
create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;
do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; rec uuid; c1 uuid; c2 uuid; c3 uuid; c4 uuid; t1 uuid; t2 uuid; t3 uuid; ms uuid; ms2 uuid; b uuid; act uuid;
begin
  insert into recordings (creator_id, source, storage_path) values (me, 'phone', 'test/0021') returning id into rec;
  insert into cards (creator_id, recording_id, title, gist, play_from_ms, confidence, embedding)
    values (me, rec, 'Rooftop chase', 'g', 0, 0.9, array_fill(0.1, array[1024])::vector) returning id into c1;
  insert into cards (creator_id, recording_id, title, gist, play_from_ms, confidence, embedding)
    values (me, rec, 'Rooftop again', 'g', 0, 0.9, array_fill(0.3, array[1024])::vector) returning id into c2;
  insert into cards (creator_id, recording_id, title, gist, play_from_ms, confidence, embedding)
    values (me, rec, 'Arabella in the car', 'g', 0, 0.9, array_fill(0.5, array[1024])::vector) returning id into c3;
  insert into cards (creator_id, recording_id, title, gist, play_from_ms, confidence, embedding)
    values (me, rec, 'Unthreaded', 'g', 0, 0.9, array_fill(0.7, array[1024])::vector) returning id into c4;
  insert into threads (creator_id, title, return_count, first_seen, last_seen) values (me, 'Big', 2, now() - interval '5 days', now() - interval '1 day') returning id into t1;
  insert into threads (creator_id, title, return_count, first_seen, last_seen) values (me, 'Small', 3, now() - interval '9 days', now()) returning id into t2;
  insert into thread_cards values (t1, c1), (t1, c2), (t2, c3);
  insert into boards (creator_id, thread_id, format, title) values (me, t2, 'launch_video', 'Board on small') returning id into b;
  insert into merge_suggestions (creator_id, a_card_id, b_card_id, similarity) values (me, c3, c1, 0.9) returning id into ms;
  insert into merge_suggestions (creator_id, a_card_id, b_card_id, similarity) values (me, c2, c3, 0.88) returning id into ms2;
  insert into actions (creator_id, text) values (me, 'Get milk') returning id into act;
  perform set_config('t.ids', json_build_object('t1',t1,'t2',t2,'c1',c1,'c3',c3,'c4',c4,'ms',ms,'ms2',ms2,'b',b,'act',act)::text, true);
end $$;

-- ── As her, through RLS, the way the app calls it ─────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"user_3JfFAEHAdkvURqPjYDQ4BkVd2rb","role":"authenticated"}', true);
set local role authenticated;
do $$
declare ids json := current_setting('t.ids')::json; keep uuid; n int; d timestamptz; again uuid;
begin
  -- done_at follows done
  update actions set done = true where id = (ids->>'act')::uuid;
  select done_at into d from actions where id = (ids->>'act')::uuid;
  insert into r (check_name, ok, detail) values ('tick stamps done_at', d is not null, coalesce(d::text, 'null'));
  update actions set done = false where id = (ids->>'act')::uuid;
  select done_at into d from actions where id = (ids->>'act')::uuid;
  insert into r (check_name, ok, detail) values ('undo clears done_at', d is null, coalesce(d::text, 'null'));
  update actions set text = 'Get oat milk' where id = (ids->>'act')::uuid;
  select done_at into d from actions where id = (ids->>'act')::uuid;
  insert into r (check_name, ok, detail) values ('other edits leave done_at alone', d is null, coalesce(d::text, 'null'));

  -- merge: the 2-card thread survives even though the other is older
  keep := accept_merge((ids->>'ms')::uuid);
  insert into r (check_name, ok, detail) values ('larger thread survives', keep = (ids->>'t1')::uuid, keep::text);
  select count(*) into n from thread_cards where thread_id = keep;
  insert into r (check_name, ok, detail) values ('all three cards in it', n = 3, n::text);
  select count(*) into n from threads where id = (ids->>'t2')::uuid;
  insert into r (check_name, ok, detail) values ('folded thread deleted', n = 0, n::text);
  select count(*) into n from boards where id = (ids->>'b')::uuid and thread_id = keep;
  insert into r (check_name, ok, detail) values ('board moved, not cascaded away', n = 1, n::text);
  select return_count into n from threads where id = keep;
  insert into r (check_name, ok, detail) values ('return_count adds up (2+3)', n = 5, n::text);
  select count(*) into n from threads where id = keep and first_seen < now() - interval '8 days' and last_seen > now() - interval '1 minute';
  insert into r (check_name, ok, detail) values ('first/last seen widen', n = 1, n::text);
  select count(*) into n from threads where id = keep and embedding is not null
     and abs((embedding::real[])[1] - 0.3) < 0.001;
  insert into r (check_name, ok, detail) values ('centroid = mean of 0.1/0.3/0.5', n = 1, n::text);
  select count(*) into n from merge_suggestions where id in ((ids->>'ms')::uuid, (ids->>'ms2')::uuid) and status = 'accepted';
  insert into r (check_name, ok, detail) values ('both now-same-thread proposals accepted', n = 2, n::text);
  again := accept_merge((ids->>'ms')::uuid);
  insert into r (check_name, ok, detail) values ('accepting twice is a no-op', again is null, coalesce(again::text, 'null'));
end $$;

-- ── Someone else can't merge her proposals ─────────────────────────────────────────────────────────────────
reset role;
do $$
declare ids json := current_setting('t.ids')::json; me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; t3 uuid; ms3 uuid;
begin
  insert into threads (creator_id, title) values (me, 'Third') returning id into t3;
  insert into thread_cards values (t3, (ids->>'c4')::uuid);
  insert into merge_suggestions (creator_id, a_card_id, b_card_id, similarity) values (me, (ids->>'c4')::uuid, (ids->>'c1')::uuid, 0.9) returning id into ms3;
  perform set_config('t.ms3', ms3::text, true);
end $$;
select set_config('request.jwt.claims', '{"sub":"user_3JfYR4D8eJVCL3yieXStYYoqwaH","role":"authenticated"}', true);
set local role authenticated;
do $$
declare got uuid; n int;
begin
  got := accept_merge(current_setting('t.ms3')::uuid);
  insert into r (check_name, ok, detail) values ('another creator gets null', got is null, coalesce(got::text, 'null'));
end $$;
reset role;
insert into r (check_name, ok, detail)
  select 'her proposal untouched by them', status = 'proposed', status from merge_suggestions where id = current_setting('t.ms3')::uuid;

select check_name, ok, detail from r order by n;
rollback;
