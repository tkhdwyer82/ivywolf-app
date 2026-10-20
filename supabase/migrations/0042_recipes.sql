-- 0042 — Recipes (Job B.10). A creator's how-to turned into steps another creator applies to her own idea.
-- We keep the steps and the credit (source URL, creator handle), never the video; the transcript is used for
-- extraction and discarded.
--
-- A recipe extracted from someone else's reel is draft_private to whoever extracted it. It is published under the
-- creator's name only once they've accepted an invite (recipe_authors.accepted_at) — enforced by the trigger below,
-- not just the app.
--
-- Writes are service role only (apps/web routes). RLS is for client reads: she sees her own drafts and anything
-- published; an author sees their own earnings.

create table recipe_authors (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram', 'tiktok', 'youtube')),
  handle text not null check (length(btrim(handle)) > 0),
  name text,
  user_id text references creators(id) on delete set null,   -- set when the author joins and accepts
  invited_at timestamptz,
  invited_by text references creators(id) on delete set null,
  accepted_at timestamptz,
  payout_share numeric(4, 3) not null default 0.150 check (payout_share between 0 and 1),
  created_at timestamptz not null default now(),
  check (accepted_at is null or user_id is not null)
);
-- The same handle on two platforms can be two people.
create unique index recipe_authors_platform_handle_idx on recipe_authors (platform, lower(handle));

create table recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  shape text not null default 'playbook' check (shape in ('playbook', 'system', 'lens')),
  author_id uuid references recipe_authors(id) on delete set null,
  author_handle text not null,
  source_url text,
  status text not null default 'draft_private' check (status in ('draft_private', 'invited', 'published', 'retired')),
  uses int not null default 0 check (uses >= 0),
  created_by text not null references creators(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on recipes (created_by, created_at desc);
create index on recipes (status, uses desc) where status = 'published';

-- Never published under a creator's name without their acceptance.
create function recipes_publish_guard() returns trigger language plpgsql as $$
begin
  if new.status = 'published' and not exists (
    select 1 from recipe_authors a where a.id = new.author_id and a.accepted_at is not null
  ) then
    raise exception 'recipe_author_not_accepted';
  end if;
  return new;
end $$;
create trigger recipes_publish_guard before insert or update of status, author_id on recipes
  for each row execute function recipes_publish_guard();

create table recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  ordinal smallint not null check (ordinal between 1 and 8),
  title text not null,
  verb text not null check (length(btrim(verb)) > 0),
  why text not null,
  make_kind text not null check (make_kind in ('write', 'still', 'video', 'cut', 'none')),
  unique (recipe_id, ordinal)
);

create table recipe_applications (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete restrict,
  idea_id uuid references cards(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  user_id text not null references creators(id) on delete cascade,
  credits int not null check (credits >= 0),               -- total charged up front
  author_share_credits int not null default 0 check (author_share_credits >= 0),
  undone_at timestamptz,                                    -- "Remove these n cards"
  created_at timestamptz not null default now()
);
create index on recipe_applications (user_id, created_at desc);

create table recipe_application_cards (
  application_id uuid not null references recipe_applications(id) on delete cascade,
  step_id uuid not null references recipe_steps(id) on delete restrict,
  card_id uuid not null references cards(id) on delete cascade,
  make_prompt text,                                         -- null when make_kind = 'none'
  primary key (application_id, step_id)
);

-- One row per paid application of a published recipe whose author has accepted.
create table recipe_author_earnings (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references recipe_authors(id) on delete restrict,
  application_id uuid not null unique references recipe_applications(id) on delete restrict,
  credits int not null check (credits > 0),
  created_at timestamptz not null default now()
);

-- Step cards are made for her idea, not said, so they have no recording. 0038's source list exactly, plus 'recipe';
-- 0036's recording exemptions exactly, plus 'recipe'.
alter table cards drop constraint cards_source_check;
alter table cards add constraint cards_source_check
  check (source in ('voice', 'import', 'muse', 'youtube', 'tiktok', 'graph', 'direction', 'recipe'));
alter table cards drop constraint cards_recording_unless_pinned;
alter table cards add constraint cards_recording_unless_pinned
  check (recording_id is not null or source in ('youtube', 'tiktok', 'recipe'));

alter table recipe_authors enable row level security;
alter table recipes enable row level security;
alter table recipe_steps enable row level security;
alter table recipe_applications enable row level security;
alter table recipe_application_cards enable row level security;
alter table recipe_author_earnings enable row level security;

create policy "recipes: own or published" on recipes for select
  using (created_by = (auth.jwt() ->> 'sub') or status = 'published');
create policy "recipe steps: with recipe" on recipe_steps for select
  using (exists (select 1 from recipes r where r.id = recipe_id
                 and (r.created_by = (auth.jwt() ->> 'sub') or r.status = 'published')));
create policy "authors: accepted or invited by me" on recipe_authors for select
  using (accepted_at is not null or invited_by = (auth.jwt() ->> 'sub') or user_id = (auth.jwt() ->> 'sub'));
create policy "own applications" on recipe_applications for select using (user_id = (auth.jwt() ->> 'sub'));
create policy "own application cards" on recipe_application_cards for select
  using (exists (select 1 from recipe_applications a where a.id = application_id and a.user_id = (auth.jwt() ->> 'sub')));
create policy "own earnings" on recipe_author_earnings for select
  using (exists (select 1 from recipe_authors a where a.id = author_id and a.user_id = (auth.jwt() ->> 'sub')));
