-- Asynchronous processing. The app inserts a recording (status 'queued'), asks apps/web to process it, and polls
-- this column. Only the pipeline worker (service role) moves a recording out of 'queued'.
--
--   queued → processing → done | junk | failed
--
-- Duplicate submits are locked out by claim_recording(): a single conditional UPDATE, so exactly one caller can
-- move a row from 'queued' to 'processing'. 'failed' is terminal for now — the graph writes are not transactional,
-- so re-running a half-written recording would duplicate its segments.

create type recording_status as enum ('queued', 'processing', 'done', 'junk', 'failed');

alter table recordings
  add column status recording_status not null default 'queued',
  add column processing_started_at timestamptz,   -- for finding stuck 'processing' rows
  add column processing_error text;

-- Backfill rows that existed before this column.
update recordings set status = case
  when is_junk then 'junk'::recording_status
  when transcript is not null then 'done'::recording_status
  else 'queued'::recording_status
end;

-- The app may create recordings and edit what the creator owns (title, location hint), never the pipeline's
-- columns. Without this, the "own recordings" policy would let a creator reset status to 'queued' and re-run.
revoke insert, update on recordings from anon, authenticated;
grant insert (id, creator_id, source, storage_path, duration_ms, recorded_at, trigger, location_hint, meta)
  on recordings to authenticated;
grant update (title, location_hint) on recordings to authenticated;

-- Worker-side claim. Returns true only for the caller that moved the row from 'queued' to 'processing'.
create function claim_recording(p_recording_id uuid) returns boolean
language sql
security invoker
as $$
  with claimed as (
    update recordings
       set status = 'processing', processing_started_at = now(), processing_error = null
     where id = p_recording_id and status = 'queued'
    returning id
  )
  select exists (select 1 from claimed);
$$;
revoke execute on function claim_recording(uuid) from public, anon, authenticated;
