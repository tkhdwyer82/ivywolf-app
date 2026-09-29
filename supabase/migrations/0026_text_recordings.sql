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
