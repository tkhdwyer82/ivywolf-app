-- Ivy Wolf idea graph — v1 schema
-- Conventions: uuid pks, timestamptz, creator_id is the Clerk user id (text, 'user_...').
-- RLS uses auth.jwt() ->> 'sub' (Clerk JWT). Do not use the native auth uid function: it is null under Clerk.
-- App routes use the user's JWT; only the pipeline worker uses the service role.

create extension if not exists vector;

create type recording_source as enum ('phone','note_taker','mini','dji_import','file_import','reference_clip','interview');
create type segment_type as enum ('idea','action','entity','loose_end','reference','request','junk','retracted','filler');
create type thread_stage as enum ('sparked','developing','ready','shipped');
create type action_scope as enum ('personal','work');
create type request_kind as enum ('life','idea');

create table creators (
  id text primary key,                       -- = Clerk user id (auth.jwt() ->> 'sub')
  handle text unique,
  display_name text,
  niche text,                                -- e.g. 'creator-founder / candles'
  style_pack jsonb not null default '{}',    -- aesthetic memory: palette, tone words, references, hook voice
  created_at timestamptz not null default now()
);

create table recordings (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  source recording_source not null,
  storage_path text not null,                -- supabase storage key, raw file untouched
  duration_ms int,
  recorded_at timestamptz,                   -- device/file timestamp; null if unreliable (DJI test)
  received_at timestamptz not null default now(),
  trigger text,                              -- wake_word | button | pen_out | share_sheet | import
  location_hint text,                        -- car | walk | cafe | null
  title text,                                -- Ivy's title, editable
  is_junk boolean not null default false,
  junk_reason text,                          -- no_speech | too_short | accidental
  transcript jsonb,                          -- provider utterances with speaker + ms offsets
  meta jsonb not null default '{}'
);
create index on recordings (creator_id, recorded_at desc);

create table segments (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references recordings(id) on delete cascade,
  creator_id text not null references creators(id) on delete cascade,
  type segment_type not null,
  start_ms int not null,
  end_ms int not null,
  text text not null,
  speaker text,
  confidence real not null,
  retracted_by uuid references segments(id),  -- for type=retracted: the segment that retracted it
  boundary_marker text,                       -- 'one second' | 'back to the idea' | null
  meta jsonb not null default '{}'
);
create index on segments (recording_id, start_ms);

create table cards (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  recording_id uuid not null references recordings(id) on delete cascade,
  segment_id uuid references segments(id),
  title text not null,
  gist text not null,
  play_from_ms int not null,
  confidence real not null,
  energy real,                                -- 0..1, where the speaker got animated
  is_reference boolean not null default false,-- other creator's content + her take
  reference_url text,
  frame_url text,                             -- generated visual
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index on cards (creator_id, created_at desc);
create index on cards using ivfflat (embedding vector_cosine_ops) with (lists = 50);

create table threads (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  title text not null,
  stage thread_stage not null default 'sparked',
  format_hint text,                           -- restock_day | launch_video | pricing_reveal | site | ...
  return_count int not null default 0,        -- "you've come back to this N times"
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  shipped_url text,                           -- write-back: what shipped
  shipped_metrics jsonb,                      -- write-back: how it did (self-reported first)
  embedding vector(1536)
);
create table thread_cards (
  thread_id uuid references threads(id) on delete cascade,
  card_id uuid references cards(id) on delete cascade,
  primary key (thread_id, card_id)
);

create table merge_suggestions (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  a_card_id uuid not null references cards(id) on delete cascade,
  b_card_id uuid not null references cards(id) on delete cascade,
  similarity real not null,
  rationale text,
  status text not null default 'proposed',    -- proposed | accepted | rejected
  created_at timestamptz not null default now()
);

create table boards (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  thread_id uuid not null references threads(id) on delete cascade,
  format text not null,
  title text not null,
  hooks jsonb not null default '[]',          -- [{text, source_card_id, play_from_ms}]
  beats jsonb not null default '[]',          -- [{n, text, frame_url, source_card_id, play_from_ms, needs}]
  caption text,
  cta text,
  version int not null default 1,
  parent_version uuid references boards(id),  -- voice correction keeps the alt
  created_at timestamptz not null default now()
);

-- Life: the catch-all
create table actions (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  recording_id uuid references recordings(id) on delete set null,
  segment_id uuid references segments(id),
  text text not null,
  scope action_scope not null default 'personal',
  priority text not null default 'low',       -- low | med | high (Ivy's guess)
  thumb_url text,                             -- visuals over text
  done boolean not null default false,
  routed_to text,                             -- apple_reminders | none
  created_at timestamptz not null default now()
);
create table entities (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  kind text not null,                         -- person | place | brand
  canonical_name text not null,
  aliases text[] not null default '{}',       -- transcript drift
  resolved boolean not null default false,    -- "who's Arabella?" answered
  unique (creator_id, canonical_name)
);
create table loose_ends (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  recording_id uuid references recordings(id) on delete set null,
  segment_id uuid references segments(id),
  text text not null,
  needs text,                                 -- link | answer | lookup
  resolved_url text,
  created_at timestamptz not null default now()
);
create table requests (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  recording_id uuid references recordings(id) on delete cascade,
  segment_id uuid references segments(id),
  kind request_kind not null,
  text text not null,
  fulfilled_by uuid,                          -- board id or action id
  created_at timestamptz not null default now()
);

-- Ivy's voice: everything she says is logged with its citation (rule 2)
create table ivy_utterances (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  channel text not null,                      -- car_ack | inbox | board
  text text not null,
  cites jsonb not null,                       -- [{recording_id, ms}] — must be non-empty
  in_reply_to uuid,
  created_at timestamptz not null default now(),
  check (jsonb_array_length(cites) > 0)
);

-- RLS
do $$ declare t text; begin
  for t in select unnest(array['creators','recordings','segments','cards','threads','thread_cards','merge_suggestions','boards','actions','entities','loose_ends','requests','ivy_utterances']) loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
create policy "own creator row" on creators for all using (id = (auth.jwt() ->> 'sub'));
create policy "own recordings" on recordings for all using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own segments" on segments for all using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own cards" on cards for all using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own threads" on threads for all using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own thread_cards" on thread_cards for all using (exists (select 1 from threads t where t.id = thread_id and t.creator_id = (auth.jwt() ->> 'sub')));
create policy "own merges" on merge_suggestions for all using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own boards" on boards for all using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own actions" on actions for all using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own entities" on entities for all using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own loose_ends" on loose_ends for all using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own requests" on requests for all using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own utterances" on ivy_utterances for all using (creator_id = (auth.jwt() ->> 'sub'));
-- Rising (shared) tables come from gamesfield-app's feed migration; keyed by explicit share rows, never by default.
