-- Launch UI (handover v3.2, Job A): a recording is a memo (the ⊕, a correction, an import's spoken line) or a
-- session (a long recording from the Mini or a DJI mic, imported on the Mini tab). Sessions get the sessions library
-- and the player (L8, P19); memos are what Home is made of. Existing rows are memos.

alter table recordings
  add column kind text not null default 'memo' check (kind in ('memo', 'session'));

grant insert (kind) on recordings to authenticated;
