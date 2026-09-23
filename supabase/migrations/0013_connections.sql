-- Connections: the tools behind a board's verbs (rule 4 — verbs, not tools; the tool is the footnote).
-- A catalogue row per tool, and which creators have connected which. Images are added later with
-- scripts/upload-connection.ts; until a row has a tile_url, the Home module stays hidden (Job 5).

create table connections (
  slug text primary key,
  name text not null,
  verb_line text not null,                    -- the verb, e.g. 'frame → carousel'
  what_it_does text[] not null default '{}',  -- P16 "What it does for you": 'Headline — detail' per entry
  privacy_line text,                          -- what is sent, in one sentence
  sort_weight int not null default 0,         -- higher first
  tile_url text,
  hero_url text,
  example_urls text[] not null default '{}'
);
alter table connections enable row level security;
-- The catalogue is the same for every creator. Writes are service role only (no write policy).
create policy "connections: read" on connections for select to authenticated using (true);

-- Copy from the Figma page Ai Hero · v1 build (P15 module, P16 Higgsfield page). Only Higgsfield has a page
-- drawn; the others carry their module verb until theirs are written.
insert into connections (slug, name, verb_line, what_it_does, privacy_line, sort_weight) values
  ('higgsfield', 'Higgsfield', 'Turns one of your frames into a short video',
   array[
     'Make a video from a frame — 6–8 seconds, in your style, on any idea that has a frame',
     'B-roll for a board — pick the beats, it fills the gaps',
     'Nothing runs unless you tap it — and Ivy tells you the credits before it does'
   ],
   'Only the frame and the beats you choose are sent. Never your other ideas.', 50),
  ('canva',   'Canva',   'frame → carousel',     '{}', null, 40),
  ('figma',   'Figma',   'board → design file',  '{}', null, 30),
  ('clickup', 'ClickUp', 'to-dos → your tasks',  '{}', null, 20),
  ('gamma',   'Gamma',   'thread → brand pitch', '{}', null, 10);

create table creator_connections (
  creator_id text not null references creators(id) on delete cascade,
  slug text not null references connections(slug) on delete cascade,
  connected_at timestamptz not null default now(),
  primary key (creator_id, slug)
);
alter table creator_connections enable row level security;
create policy "own connections" on creator_connections for all
  using (creator_id = (auth.jwt() ->> 'sub'))
  with check (creator_id = (auth.jwt() ->> 'sub'));

-- ── Storage ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Both public: frame and connection images are shown by URL in the app. No insert/update/delete policies, so
-- only the service role (frames.ts, upload-connection.ts) writes. Frames live at frames/<creator_id>/<card_id>.jpg.
insert into storage.buckets (id, name, public)
values ('frames', 'frames', true), ('connections', 'connections', true)
on conflict (id) do update set public = true;
