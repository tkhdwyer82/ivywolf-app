-- Recordings bucket: the app uploads raw audio with the creator's own Clerk JWT, so storage RLS does the
-- scoping rather than a service-role route. Objects live at recordings/<clerk user id>/<uuid>.<ext>.
--
-- Insert and read only. There is deliberately no update or delete policy: raw audio is never rewritten
-- (CLAUDE.md: "Never store raw audio outside Supabase storage"; storage.ts: "recordings never change").

create policy "recordings: upload own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  );

create policy "recordings: read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  );
