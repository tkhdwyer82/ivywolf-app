-- Job B.11: Capture, one screen (Figma v5.7, 2272:2). While the mic keeps recording she can type a note or add a
-- photo; neither pauses it. Each is stamped with the recording's own clock at that moment — at_ms is a position in
-- the audio file (paused time isn't in the file, so it isn't in at_ms either). One capture = one recording, so
-- capture_id is the recording's id. A typed-only capture (no speech) is a text recording (0026) with its notes here.
--
--   capture_notes   (capture_id, at_ms, text)         — what she typed, stamped when she started typing it
--   capture_photos  (capture_id, at_ms, storage_path, poster_path)
--                   storage_path: the original in the private `imports` bucket (<creator>/captures/<id>.<ext>)
--                   poster_path:  its copy in frames/<creator>/imports/ — the card's picture if it's the best one
--
-- Both reuse 0018's bucket policies (her own folder; posters only under <her id>/imports/), so no storage policy
-- changes. The app writes the rows with her own JWT after the recording row and before asking for processing; the
-- pipeline (service role) reads them, merges notes into the transcript by time, and puts the best photo on the card.
-- Rows go with the recording (cascade); deleteRecording removes the files first (packages/schema/deletion.ts).

create table capture_notes (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references recordings(id) on delete cascade,
  creator_id text not null references creators(id) on delete cascade,
  at_ms integer not null check (at_ms >= 0),
  text text not null check (length(btrim(text)) > 0 and length(text) <= 4000),
  created_at timestamptz not null default now()
);
create index capture_notes_capture_idx on capture_notes (capture_id, at_ms);

create table capture_photos (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references recordings(id) on delete cascade,
  creator_id text not null references creators(id) on delete cascade,
  at_ms integer not null check (at_ms >= 0),
  storage_path text not null check (storage_path like creator_id || '/%' and storage_path not like '%..%'),
  poster_path text not null check (poster_path like creator_id || '/imports/%' and poster_path not like '%..%'),
  created_at timestamptz not null default now()
);
create index capture_photos_capture_idx on capture_photos (capture_id, at_ms);

alter table capture_notes enable row level security;
alter table capture_photos enable row level security;

-- Her own rows, and only against her own recording. No update: a note or photo is written once, at Done.
create policy "capture_notes: own" on capture_notes for select using (creator_id = (auth.jwt() ->> 'sub'));
create policy "capture_notes: insert own" on capture_notes for insert with check (
  creator_id = (auth.jwt() ->> 'sub')
  and exists (select 1 from recordings r where r.id = capture_id and r.creator_id = (auth.jwt() ->> 'sub'))
);
create policy "capture_notes: delete own" on capture_notes for delete using (creator_id = (auth.jwt() ->> 'sub'));

create policy "capture_photos: own" on capture_photos for select using (creator_id = (auth.jwt() ->> 'sub'));
create policy "capture_photos: insert own" on capture_photos for insert with check (
  creator_id = (auth.jwt() ->> 'sub')
  and exists (select 1 from recordings r where r.id = capture_id and r.creator_id = (auth.jwt() ->> 'sub'))
);
create policy "capture_photos: delete own" on capture_photos for delete using (creator_id = (auth.jwt() ->> 'sub'));

revoke all on capture_notes, capture_photos from anon;
grant select, insert, delete on capture_notes, capture_photos to authenticated;
