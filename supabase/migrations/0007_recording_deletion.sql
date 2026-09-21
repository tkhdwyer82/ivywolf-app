-- Privacy promises (ivywolf.com.au/privacy):
--   "Delete a recording at any time in the app; its transcript and derived cards go with it."
--   "Junk recordings (accidental taps, no speech): deleted automatically within 30 days."
--
-- 1. Deleting a recording removes everything derived from it. Before this migration, actions and loose_ends only
--    had recording_id SET NULL, and every segment_id foreign key was NO ACTION — so deleting a recording that had
--    a to-do or loose end failed outright, and even if it hadn't, the derived text would have survived.
-- 2. Threads left with no cards are deleted with them (a thread's title is derived from its cards).
-- 3. The creator may delete their own audio object; the app deletes the object, then the row (RLS: "own
--    recordings" is FOR ALL, and 0006 revoked only INSERT/UPDATE, so DELETE on own rows already stands).
-- 4. A daily pg_cron job calls the cleanup-junk Edge Function, which deletes junk recordings older than 30 days
--    through the Storage API (a SQL delete on storage.objects would leave the file behind).

-- ── 1. Cascades ──────────────────────────────────────────────────────────────────────────────────────────────
alter table actions
  drop constraint actions_recording_id_fkey,
  add constraint actions_recording_id_fkey foreign key (recording_id) references recordings(id) on delete cascade,
  drop constraint actions_segment_id_fkey,
  add constraint actions_segment_id_fkey foreign key (segment_id) references segments(id) on delete cascade;

alter table loose_ends
  drop constraint loose_ends_recording_id_fkey,
  add constraint loose_ends_recording_id_fkey foreign key (recording_id) references recordings(id) on delete cascade,
  drop constraint loose_ends_segment_id_fkey,
  add constraint loose_ends_segment_id_fkey foreign key (segment_id) references segments(id) on delete cascade;

alter table requests
  drop constraint requests_segment_id_fkey,
  add constraint requests_segment_id_fkey foreign key (segment_id) references segments(id) on delete cascade;

alter table cards
  drop constraint cards_segment_id_fkey,
  add constraint cards_segment_id_fkey foreign key (segment_id) references segments(id) on delete cascade;

alter table segments
  drop constraint segments_retracted_by_fkey,
  add constraint segments_retracted_by_fkey foreign key (retracted_by) references segments(id) on delete set null;

-- ── 2. Empty threads go with their last card ─────────────────────────────────────────────────────────────────
create function delete_emptied_threads() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from threads t
   where t.id in (select distinct thread_id from removed)
     and not exists (select 1 from thread_cards tc where tc.thread_id = t.id);
  return null;
end;
$$;
revoke execute on function delete_emptied_threads() from public, anon, authenticated;

create trigger thread_cards_delete_emptied_threads
  after delete on thread_cards
  referencing old table as removed
  for each statement execute function delete_emptied_threads();

-- ── 3. The creator may delete their own audio ────────────────────────────────────────────────────────────────
-- Delete is not rewrite: 0005's "no update/delete" was about never altering raw audio. Removing it on request is
-- the promise. Still no UPDATE policy.
create policy "recordings: delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  );

-- ── 4. Daily junk cleanup ────────────────────────────────────────────────────────────────────────────────────
-- Needs two Vault secrets, set out of band (never in git):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service role JWT>', 'service_role_key');
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'cleanup-junk-recordings',
  '17 3 * * *',  -- daily, 03:17 UTC
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/cleanup-junk',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('older_than_days', 30),
    timeout_milliseconds := 60000
  );
  $$
);
