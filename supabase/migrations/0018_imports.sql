-- Add to ideas (P2): an image or video from her library becomes a card, with one spoken line for what it's for.
--
-- The app uploads the original to the private `imports` bucket and a poster (the image itself, or a still from the
-- video) to frames/<creator>/imports/, then records the line. The recording carries the import in meta; the
-- pipeline turns it into a card with source 'import' whose frame is the poster (packages/pipeline/imports.ts).
-- Originals are never public; the poster is served like any frame (public, pilot — signed URLs in Phase 2).

alter table cards
  add column source text not null default 'voice' check (source in ('voice', 'import')),
  add column media_path text;                 -- imports/<creator>/<id>.<ext>: the original she added

insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

-- Originals: her own folder only, uploaded, read and deleted with her own JWT (as recordings, 0005/0007).
create policy "imports: upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));
create policy "imports: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));
create policy "imports: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));

-- Posters: the one place the app writes to frames, and only under <her id>/imports/.
create policy "frames: upload own import posters"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'frames'
    and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
    and (storage.foldername(name))[2] = 'imports'
  );
