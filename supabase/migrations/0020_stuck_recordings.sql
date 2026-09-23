-- Nothing spins forever. A recording left in 'processing' — the worker was killed, the route timed out, the process
-- died — is swept to 'failed' once it is clearly past its time, and the creator can retry it (or delete it).
--
-- Timeout: 2 minutes plus the recording's own length (transcription and classification scale with it), capped at
-- 5 minutes, the process route's maxDuration — after that the worker is certainly gone. If a slow run finishes after
-- the sweep, markDone still moves it to 'done'.
--
-- Retry: 0006 made 'failed' terminal because graph writes aren't transactional — a half-written run re-run would
-- duplicate its segments and cards. retry_recording() clears everything the failed run wrote first, then queues it.

create function sweep_stuck_recordings() returns int
language sql
security definer
set search_path = public
as $$
  with swept as (
    update recordings
       set status = 'failed',
           processing_error = 'timed out: still processing after ' ||
             round(extract(epoch from now() - processing_started_at))::int || ' s'
     where status = 'processing'
       and processing_started_at < now() - least(
             interval '5 minutes',
             interval '2 minutes' + make_interval(secs => coalesce(duration_ms, 0) / 1000.0))
    returning id
  )
  select count(*)::int from swept;
$$;
revoke execute on function sweep_stuck_recordings() from public, anon, authenticated;

select cron.schedule('sweep-stuck-recordings', '* * * * *', $$ select sweep_stuck_recordings(); $$);

-- The creator's own failed recording → queued, with the failed run's partial writes removed. The app then asks
-- apps/web to process it (the route's claim still guards against a double run).
create function retry_recording(p_recording_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from recordings
     where id = p_recording_id and creator_id = (auth.jwt() ->> 'sub') and status = 'failed'
  ) then
    return false;
  end if;
  delete from cards      where recording_id = p_recording_id;
  delete from actions    where recording_id = p_recording_id;
  delete from loose_ends where recording_id = p_recording_id;
  delete from requests   where recording_id = p_recording_id;
  delete from segments   where recording_id = p_recording_id;
  update recordings
     set status = 'queued', processing_error = null, processing_started_at = null, is_junk = false, junk_reason = null
   where id = p_recording_id;
  return true;
end;
$$;
revoke execute on function retry_recording(uuid) from public, anon;
grant execute on function retry_recording(uuid) to authenticated;
