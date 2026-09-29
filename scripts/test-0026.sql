-- Rolled-back test for 0026 (write, test in a rolled-back transaction, dry-run, push).
-- Applies the migration inside the transaction and rolls everything back.
--
--   supabase db query --linked -f scripts/test-0026.sql
--
-- A value added to an enum can't be used in the transaction that adds it, so rows here use source 'phone'; that
-- 'muse' is in the type is checked from the catalogue. scripts/test-mcp.ts writes real 'muse' rows once it's pushed.
begin;
-- Ideas that arrive as text (Job F step 4): Muse's capture_idea files a ramble into the same pipeline as ⊕, minus
-- the audio. A text recording has no file — its words are the transcript, written with the row — so it skips
-- Deepgram and goes straight to classify_v6 (packages/pipeline/process.ts, text path).
--
--   recordings.source 'muse'  where it came from; the app shows its cards with a "via Muse" badge
--   recordings.kind   'text'  alongside memo and session (0023)
--   storage_path      null for text only: there is no raw audio to point at, and every other kind still must
--
-- Numbered after 0025 (agent_calls, capture idempotency) though written before it: the job fixed 0024 and 0025,
-- and this one was found to be needed along the way. Nothing here depends on 0025 or the other way round.
--
-- Text recordings are written by the MCP server (service role). The app's column grants (0006, 0023) already cover
-- kind and storage_path, so the app could write one too — only ever into her own graph, under "own recordings" —
-- but nothing in it does today.

alter type recording_source add value if not exists 'muse';

alter table recordings drop constraint recordings_kind_check;
alter table recordings add constraint recordings_kind_check check (kind in ('memo', 'session', 'text'));

alter table recordings alter column storage_path drop not null;
alter table recordings add constraint recordings_storage_path_check check (storage_path is not null or kind = 'text');

create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;

do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; rec uuid;
begin
  insert into r (check_name, ok, detail)
    select 'muse is a recording source', count(*) = 1, string_agg(e.enumlabel, ',')
      from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'recording_source' and e.enumlabel = 'muse';

  insert into recordings (creator_id, source, kind, storage_path, transcript)
    values (me, 'phone', 'text', null, '[{"start_ms":0,"end_ms":400,"speaker":"0","text":"Test."}]')
    returning id into rec;
  insert into r (check_name, ok, detail) values ('a text recording needs no audio', rec is not null, rec::text);

  begin
    insert into recordings (creator_id, source, kind, storage_path) values (me, 'phone', 'memo', null);
    insert into r (check_name, ok, detail) values ('a memo still needs its audio', false, 'inserted');
  exception when check_violation then
    insert into r (check_name, ok, detail) values ('a memo still needs its audio', true, sqlerrm);
  end;

  begin
    insert into recordings (creator_id, source, kind, storage_path) values (me, 'phone', 'session', null);
    insert into r (check_name, ok, detail) values ('a session still needs its audio', false, 'inserted');
  exception when check_violation then
    insert into r (check_name, ok, detail) values ('a session still needs its audio', true, sqlerrm);
  end;

  begin
    insert into recordings (creator_id, source, kind, storage_path) values (me, 'phone', 'fax', 'x');
    insert into r (check_name, ok, detail) values ('kind is still checked', false, 'inserted');
  exception when check_violation then
    insert into r (check_name, ok, detail) values ('kind is still checked', true, sqlerrm);
  end;

  insert into r (check_name, ok, detail)
    select 'existing rows unchanged', count(*) filter (where storage_path is null) = 1, count(*)::text || ' rows'
      from recordings where creator_id = me;
end $$;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
