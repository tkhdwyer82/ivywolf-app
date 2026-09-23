-- When a card's or to-do's frame arrived. Ivy on open (Home, P1) says "…has a frame now" for frames that landed
-- since creators.last_opened_at; created_at can't tell that, because frames arrive after the card (and backfills
-- frame old cards). Set by packages/pipeline/frames.ts; existing frames count from now.

alter table cards   add column frame_at timestamptz;
alter table actions add column frame_at timestamptz;
update cards   set frame_at = now() where frame_status = 'done';
update actions set frame_at = now() where frame_status = 'done';
