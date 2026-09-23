-- Deleting a recording removes its frames too ("its transcript and derived cards go with it"). The app deletes
-- them through the Storage API with the creator's own JWT, as it does the audio (0007): a card's frame always, a
-- to-do's shared frame only when no other to-do still uses it (apps/mobile/lib/deleteRecording.ts).
-- Delete (and the read it needs) only under her own folder: frames/<clerk user id>/…. Writes stay service role (0013).

create policy "frames: delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'frames'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  );

-- A DELETE only reaches rows the role can also SELECT (and the Storage API's remove returns what it deleted), so
-- deleting needs a read policy on the same rows. The bucket is public already; this only lets her see her folder.
create policy "frames: read own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'frames'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
  );
