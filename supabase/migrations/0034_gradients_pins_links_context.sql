-- Job C+ (Figma 227:2 v3.4, rows 2–4): gradient tiles, Pin to top, the hold arc's Link ideas / Add context / Share.
--
--   projects.gradient   one of the ten card gradients (1462:4), round-robin per creator as projects are made;
--                       backfilled in creation order. Non-photo cards render their project's gradient.
--   cards.pinned_at     Pin to top (1461:133): the Pinned row above Today on Home, and the top of the project.
--   cards.shared_at     Copy link: the card's public page (app.ivywolf.com.au/idea/<id>) exists only while this is
--                       set. Null by default — nothing is public until she shares it.
--   card_links          Link ideas (1459:4/109). The brief calls it `connections`, but 0013 already has a
--                       `connections` table (the tools behind a board's verbs), so links take this name. Two-way:
--                       one row per pair, stored with card_a < card_b, so "linked to X" reads either column.
--   card_context        Add context (1461:2): voice note, text, link, file or image, kept on the idea with its cite.
--                       Context never rewrites the card — nothing here touches cards.
--   storage 'context'   Private bucket for context files (PDF and images ≤ 20 MB, and voice notes), her folder only.

-- ── Gradients ───────────────────────────────────────────────────────────────────────────────────────────────────

create function card_gradients() returns text[]
language sql
immutable
as $$
  select array['ember', 'peach', 'lagoon', 'dusk', 'sky', 'orchid', 'meadow', 'honey', 'blaze', 'ice'];
$$;

alter table projects add column gradient text check (gradient = any (card_gradients()));

-- The next gradient for a creator: how many projects she already has, round the ten. A multi-row insert (the two
-- defaults seeded by 0011) sees the rows before it in the same statement, so they get consecutive gradients.
create function assign_project_gradient() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.gradient is null then
    new.gradient := (card_gradients())[
      (select count(*) from projects where creator_id = new.creator_id) % array_length(card_gradients(), 1) + 1
    ];
  end if;
  return new;
end;
$$;
revoke execute on function assign_project_gradient() from public, anon, authenticated;

create trigger projects_assign_gradient before insert on projects
  for each row execute function assign_project_gradient();

-- Backfill: each creator's projects in the order she made them (defaults first, as they were seeded first).
update projects p
   set gradient = (card_gradients())[((o.n - 1) % array_length(card_gradients(), 1)) + 1]
  from (
    select id, row_number() over (partition by creator_id order by created_at, is_default desc, id) as n
      from projects
  ) o
 where o.id = p.id;

alter table projects alter column gradient set not null;

-- ── Pin to top, and the opt-in public link ──────────────────────────────────────────────────────────────────────

alter table cards
  add column pinned_at timestamptz,
  add column shared_at timestamptz;
create index cards_pinned_idx on cards (creator_id, pinned_at desc) where pinned_at is not null;

-- The public page's one read. Anyone (signed out included) can call it, and it answers only for a card she has
-- shared, with only what the card shows: its title, its form and the photo credit. Never the recording, transcript,
-- context, links, project or thread. Signing her name is left out too: the card speaks for itself.
create function shared_card(p_card_id uuid) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'title', c.title,
    -- The text form is the title and gist; every other form carries its own words below.
    'gist', case when coalesce(c.shape, 'text') = 'text' then c.gist end,
    'shape', c.shape,
    'quote', c.quote,
    'diagram', c.diagram,
    'board', case when c.board is not null then jsonb_build_object('hook', c.board -> 'hook', 'beats', c.board -> 'beats') end,
    'frame_url', case when c.frame_status = 'done' then c.frame_url end,
    'credit', case when c.frame_attribution ->> 'provider' = 'unsplash' then jsonb_build_object(
      'photographer', c.frame_attribution ->> 'photographer',
      'photographer_url', c.frame_attribution ->> 'photographer_url',
      'photo_url', c.frame_attribution ->> 'photo_url'
    ) end,
    'gradient', p.gradient
  )
    from cards c
    join projects p on p.id = c.project_id
   where c.id = p_card_id
     and c.shared_at is not null;
$$;
revoke execute on function shared_card(uuid) from public;
grant execute on function shared_card(uuid) to anon, authenticated;

-- ── Link ideas ──────────────────────────────────────────────────────────────────────────────────────────────────

create table card_links (
  card_a uuid not null references cards(id) on delete cascade,
  card_b uuid not null references cards(id) on delete cascade,
  creator_id text not null references creators(id) on delete cascade,
  created_by text not null default 'creator' check (created_by in ('creator', 'ivy')),
  created_at timestamptz not null default now(),
  primary key (card_a, card_b),
  check (card_a < card_b)
);
create index on card_links (card_b);
create index on card_links (creator_id);

alter table card_links enable row level security;
create policy "own card_links: read" on card_links for select using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own card_links: create" on card_links for insert with check (creator_id = (auth.jwt() ->> 'sub'));
create policy "own card_links: delete" on card_links for delete using (creator_id = (auth.jwt() ->> 'sub'));

-- Both cards must be hers: RLS on the link doesn't check the cards its foreign keys point at.
create function check_card_pair() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from cards where id in (new.card_a, new.card_b) and creator_id = new.creator_id) <> 2 then
    raise exception 'cards % and % do not both belong to creator %', new.card_a, new.card_b, new.creator_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function check_card_pair() from public, anon, authenticated;

create trigger card_links_check_pair before insert or update on card_links
  for each row execute function check_card_pair();

-- ── Add context ─────────────────────────────────────────────────────────────────────────────────────────────────
--   kind   content                          url                             meta
--   voice  the transcript (once written)    context/<creator>/<id>.m4a       {status, duration_ms}
--   text   what she typed                   —                                {}
--   link   the page's title                 the link                         {thumbnail_url, host}
--   file   the file's name                  context/<creator>/<id>.pdf|…     {mime, bytes}
--   image  the file's name                  context/<creator>/<id>.jpg|…     {mime, bytes, role: idea|style|both}
--   cite   where it came from, for the line under it: {at, source} — e.g. {source: 'camera roll'}.

create table card_context (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  card_id uuid not null references cards(id) on delete cascade,
  kind text not null check (kind in ('voice', 'text', 'link', 'file', 'image')),
  content text,
  url text,
  meta jsonb not null default '{}',
  cite jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on card_context (card_id, created_at desc);

alter table card_context enable row level security;
create policy "own card_context: read" on card_context for select using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own card_context: create" on card_context for insert with check (creator_id = (auth.jwt() ->> 'sub'));
create policy "own card_context: edit" on card_context for update
  using (creator_id = (auth.jwt() ->> 'sub'))
  with check (creator_id = (auth.jwt() ->> 'sub'));
create policy "own card_context: delete" on card_context for delete using (creator_id = (auth.jwt() ->> 'sub'));

create function check_context_card() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from cards where id = new.card_id and creator_id = new.creator_id) then
    raise exception 'card % does not belong to creator %', new.card_id, new.creator_id using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function check_context_card() from public, anon, authenticated;

create trigger card_context_check_card before insert or update of card_id, creator_id on card_context
  for each row execute function check_context_card();

-- Private. 20 MB a file; PDFs, images, and the voice notes recorded on the sheet.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('context', 'context', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/gif', 'audio/mp4', 'audio/m4a', 'audio/x-m4a'])
on conflict (id) do nothing;

create policy "context: upload own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'context' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));
create policy "context: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'context' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));
create policy "context: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'context' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));
