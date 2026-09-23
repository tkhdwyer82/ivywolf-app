-- Frames and the style pack. Every card and action gets a frame (rule 3): frames.ts draws frame_brief in the
-- creator's style pack, or — when the brief is empty — the app renders the title typographically in the palette.
--
--   none → queued → done | typographic | failed
--
-- 'failed' never blocks the card; the app falls back to typographic.

alter table cards
  add column frame_brief text,
  add column if not exists frame_url text,   -- reserved in 0001, never written until now
  add column frame_status text not null default 'none'
    check (frame_status in ('none', 'queued', 'done', 'typographic', 'failed'));

alter table actions
  add column frame_brief text,
  add column frame_url text,
  add column frame_status text not null default 'none'
    check (frame_status in ('none', 'queued', 'done', 'typographic', 'failed'));

-- One style pack per creator. Replaces creators.style_pack (jsonb, 0001), which nothing has written; it stays
-- until a later migration drops it.
create table style_packs (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null unique references creators(id) on delete cascade,
  tone_words text[] not null default '{}',
  palette text[] not null default '{}',        -- hex, e.g. '#1D1D1F'
  reference_urls text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table style_packs enable row level security;
-- Read and edit own; created only by the seed below (one per creator), never deleted by the app.
create policy "own style pack: read" on style_packs for select using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own style pack: edit" on style_packs for update
  using (creator_id = (auth.jwt() ->> 'sub'))
  with check (creator_id = (auth.jwt() ->> 'sub'));

create function touch_style_pack() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger style_packs_touch before update on style_packs
  for each row execute function touch_style_pack();

-- Seed: warm, film grain, soft daylight; ink / paper / lime from the Ai Hero v1 build frames.
create function seed_creator_style_pack() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into style_packs (creator_id, tone_words, palette)
  values (new.id, '{warm,film grain,soft daylight}', '{#1D1D1F,#FFFFFF,#D8F27A}')
  on conflict (creator_id) do nothing;
  return null;
end;
$$;
revoke execute on function seed_creator_style_pack() from public, anon, authenticated;

create trigger creators_seed_style_pack
  after insert on creators
  for each row execute function seed_creator_style_pack();

insert into style_packs (creator_id, tone_words, palette)
select id, '{warm,film grain,soft daylight}', '{#1D1D1F,#FFFFFF,#D8F27A}' from creators
on conflict (creator_id) do nothing;

-- For Ivy on open: what's new since the creator last looked at Home.
alter table creators add column last_opened_at timestamptz;
