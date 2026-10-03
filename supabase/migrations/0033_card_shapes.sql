-- Job B revised — ideas have shapes (Figma 227:5, v3.4 "Creator-first"). Rule 6 becomes "every card gets the right
-- form": Home shows the form each idea needs instead of a generated frame on everything.
--
--   shape         photo | quote | diagram | board | text — classify_v7 picks it; null on cards made before v7
--                 (the app renders those as before: the frame if there is one, else a text card)
--   shape_set_by  'ivy' (the classifier, or the pipeline's fallback when a photo search finds nothing) | 'creator'
--                 (she chose it with Change view; the pipeline never overrides that)
--   visual_query  2–6 plain words for the Unsplash search (photo)
--   quote         {text, speaker}       — text verbatim from the segment; speaker null = her own voice
--   diagram       {title, rows:[{from, to}]}
--   board         {hook, beats:[…]}      — the status pill is the thread's stage, read at render time
--   frame_attribution  {provider:'unsplash', photo_id, photographer, photographer_url, photo_url, download_location}
--                 — credited on the tile and the idea page (Unsplash API guidelines); frame_url hotlinks the photo.
--
-- Job G.1's brief numbered its card_frames table 0033; that table isn't in this job and takes the next number.

alter table cards
  add column shape text check (shape in ('photo', 'quote', 'diagram', 'board', 'text')),
  add column shape_set_by text check (shape_set_by in ('ivy', 'creator')),
  add column visual_query text,
  add column quote jsonb,
  add column diagram jsonb,
  add column board jsonb,
  add column frame_attribution jsonb;

-- A shape needs its payload; the pipeline's invariants already guarantee it, this keeps the app's writes honest too.
alter table cards add constraint cards_shape_has_payload check (
  shape is null
  or shape = 'text'
  or (shape = 'photo')
  or (shape = 'quote' and quote is not null)
  or (shape = 'diagram' and diagram is not null)
  or (shape = 'board' and board is not null)
);
