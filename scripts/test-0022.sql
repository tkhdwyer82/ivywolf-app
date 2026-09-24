-- Rolled-back test for 0022 (brief: write, test in a rolled-back transaction, dry-run, push).
-- Applies the migration inside the transaction, runs as the creator through RLS, and rolls everything back.
begin;
-- To-do (P17) + Date sheet (P18): Remind me, Add to Reminders, and the heart.
--
-- actions.remind_at: when she asked to be reminded (Remind me). The phone schedules a local notification for it,
-- keyed by the action's id, so the row is the truth and any device can reschedule it. Null = no reminder.
-- actions.synced_reminder_id: the Apple Reminders item Add to Reminders made (EventKit calendarItemIdentifier).
-- It names an item in her phone's Reminders, so only the phone that made it can update or remove it. Null = not
-- synced. routed_to stays the pipeline's routing guess (0001); this is what she actually turned on.

alter table actions add column remind_at timestamptz;
alter table actions add column synced_reminder_id text;

-- The heart on a to-do (P17), as on an idea (0019).
alter table actions add column hearted_at timestamptz;

-- ── Fixtures (her creator row; everything below is rolled back) ──────────────────────────────────────────
create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;
do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; rec uuid; seg uuid; act uuid;
begin
  insert into recordings (creator_id, source, storage_path, title) values (me, 'phone', 'test/0022', 'Test recording') returning id into rec;
  insert into segments (recording_id, creator_id, type, start_ms, end_ms, text, confidence)
    values (rec, me, 'action', 31000, 36000, 'I need to have milk for the office for Thursday.', 0.9) returning id into seg;
  insert into actions (creator_id, recording_id, segment_id, text, scope, priority, due_date)
    values (me, rec, seg, 'Get milk for the office', 'work', 'med', '2026-09-24') returning id into act;
  perform set_config('t.act', act::text, true);
end $$;

-- ── As her, through RLS, the way the app writes ────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"user_3JfFAEHAdkvURqPjYDQ4BkVd2rb","role":"authenticated"}', true);
set local role authenticated;
do $$
declare act uuid := current_setting('t.act')::uuid; n int; t text; ra timestamptz; ha timestamptz; sid text; d date; seg_ms int; rec_title text;
begin
  select count(*) into n from actions where id = act and remind_at is null and synced_reminder_id is null and hearted_at is null;
  insert into r (check_name, ok, detail) values ('new columns start empty', n = 1, n::text);

  update actions set remind_at = '2026-09-24 08:00+10', hearted_at = now(), synced_reminder_id = 'EK-REMINDER-1' where id = act;
  get diagnostics n = row_count;
  select remind_at, hearted_at, synced_reminder_id into ra, ha, sid from actions where id = act;
  insert into r (check_name, ok, detail) values ('she sets remind/heart/sync', n = 1 and ra = '2026-09-24 08:00+10' and ha is not null and sid = 'EK-REMINDER-1', coalesce(ra::text, 'null') || ' ' || coalesce(sid, 'null'));

  update actions set due_date = '2026-09-25' where id = act;
  select due_date into d from actions where id = act;
  insert into r (check_name, ok, detail) values ('she changes the date', d = '2026-09-25', d::text);

  update actions set remind_at = null, synced_reminder_id = null, hearted_at = null where id = act;
  select count(*) into n from actions where id = act and remind_at is null and synced_reminder_id is null and hearted_at is null;
  insert into r (check_name, ok, detail) values ('she turns them off', n = 1, n::text);

  -- P17's read: the to-do with its segment and recording, as PostgREST's embed joins them under RLS
  select s.start_ms, rc.title into seg_ms, rec_title from actions a join segments s on s.id = a.segment_id join recordings rc on rc.id = a.recording_id where a.id = act;
  insert into r (check_name, ok, detail) values ('segment + recording readable', seg_ms = 31000 and rec_title = 'Test recording', coalesce(seg_ms::text, 'null') || ' ' || coalesce(rec_title, 'null'));
  select p.kind::text into t from actions a join projects p on p.id = a.project_id where a.id = act;
  insert into r (check_name, ok, detail) values ('to-do lives in My things', t = 'things', coalesce(t, 'null'));

  update actions set done = true where id = act;
  select count(*) into n from actions where id = act and done and done_at is not null;
  insert into r (check_name, ok, detail) values ('0021 done_at still stamps', n = 1, n::text);
end $$;

-- ── Someone else can't touch it ────────────────────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"user_3JfYR4D8eJVCL3yieXStYYoqwaH","role":"authenticated"}', true);
set local role authenticated;
do $$
declare act uuid := current_setting('t.act')::uuid; n int;
begin
  update actions set remind_at = now(), synced_reminder_id = 'EVIL' where id = act;
  get diagnostics n = row_count;
  insert into r (check_name, ok, detail) values ('another creator updates 0 rows', n = 0, n::text);
  select count(*) into n from actions where id = act;
  insert into r (check_name, ok, detail) values ('another creator can''t see it', n = 0, n::text);
end $$;
reset role;
insert into r (check_name, ok, detail)
  select 'untouched by them', synced_reminder_id is null, coalesce(synced_reminder_id, 'null') from actions where id = current_setting('t.act')::uuid;

select check_name, ok, detail from r order by n;
rollback;
