-- Projects: where an idea lives. Every creator has two default projects — My things (kind 'things', the catch-all
-- for to-dos and anything unplaced) and Ivy Mini (kind 'mini', recordings from the Mini) — plus any they make.
-- Cards and actions always land in a project; threads may carry one.
--
-- Resolver: the pipeline passes the classifier's candidate project name (classify_v6); resolve_project() returns
-- the creator's project with that name (case- and whitespace-insensitive), else My things. A card or action
-- inserted with no project_id gets My things from the trigger, so nothing is ever unplaced.

create table projects (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  is_default boolean not null default false,
  kind text not null default 'user' check (kind in ('things', 'mini', 'user')),
  created_at timestamptz not null default now(),
  check (is_default = (kind in ('things', 'mini')))
);
create unique index projects_creator_name_idx on projects (creator_id, lower(btrim(name)));
-- One My things and one Ivy Mini per creator.
create unique index projects_creator_default_kind_idx on projects (creator_id, kind) where kind <> 'user';

alter table projects enable row level security;
create policy "own projects: read" on projects for select using (creator_id = (auth.jwt() ->> 'sub'));
-- A creator makes and renames 'user' projects only; the two defaults are seeded here and never deleted.
create policy "own projects: create" on projects for insert
  with check (creator_id = (auth.jwt() ->> 'sub') and kind = 'user');
create policy "own projects: rename" on projects for update
  using (creator_id = (auth.jwt() ->> 'sub') and kind = 'user')
  with check (creator_id = (auth.jwt() ->> 'sub') and kind = 'user');
create policy "own projects: delete" on projects for delete
  using (creator_id = (auth.jwt() ->> 'sub') and kind = 'user');

-- ── Seed the defaults on creator-row creation (the app upserts the row on first record: lib/record.ts) ───────
create function seed_creator_projects() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into projects (creator_id, name, is_default, kind)
  values (new.id, 'My things', true, 'things'), (new.id, 'Ivy Mini', true, 'mini')
  on conflict do nothing;
  return null;
end;
$$;
revoke execute on function seed_creator_projects() from public, anon, authenticated;

create trigger creators_seed_projects
  after insert on creators
  for each row execute function seed_creator_projects();

insert into projects (creator_id, name, is_default, kind)
select c.id, v.name, true, v.kind
  from creators c
 cross join (values ('My things', 'things'), ('Ivy Mini', 'mini')) as v(name, kind)
on conflict do nothing;

-- ── Placement ───────────────────────────────────────────────────────────────────────────────────────────────
-- Cards and actions reference their project with NO ACTION: deleting a user project first sends them home to
-- My things (reassign_deleted_project, below); the defaults can't be deleted while anything is in them. Deleting
-- the creator still works — the check runs at the end of the statement, after the cascade has taken the cards.
alter table cards   add column project_id uuid references projects(id);
alter table threads add column project_id uuid references projects(id) on delete set null;
alter table actions add column project_id uuid references projects(id);
create index on cards (project_id, created_at desc);
create index on actions (project_id, created_at desc);
create index on threads (project_id);

create function my_things_project(p_creator_id text) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from projects where creator_id = p_creator_id and kind = 'things';
$$;
revoke execute on function my_things_project(text) from public, anon, authenticated;

-- The resolver. Service role only: the pipeline calls it with the classifier's candidate name.
create function resolve_project(p_creator_id text, p_candidate text) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select id from projects
      where creator_id = p_creator_id
        and p_candidate is not null
        and lower(btrim(name)) = lower(btrim(p_candidate))),
    my_things_project(p_creator_id)
  );
$$;
revoke execute on function resolve_project(text, text) from public, anon, authenticated;

-- Null → My things (cards, actions). A project_id must belong to the same creator: RLS on the row being written
-- doesn't check the target of a foreign key, so without this a creator could file a card under someone else's
-- project id.
create function place_in_project() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is null then
    if tg_table_name <> 'threads' then
      new.project_id := my_things_project(new.creator_id);
    end if;
  elsif not exists (select 1 from projects where id = new.project_id and creator_id = new.creator_id) then
    raise exception 'project % does not belong to creator %', new.project_id, new.creator_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function place_in_project() from public, anon, authenticated;

create trigger cards_place_in_project before insert or update of project_id on cards
  for each row execute function place_in_project();
create trigger actions_place_in_project before insert or update of project_id on actions
  for each row execute function place_in_project();
create trigger threads_place_in_project before insert or update of project_id on threads
  for each row execute function place_in_project();

-- Deleting a user project sends its cards and actions home to My things; its threads become unplaced.
create function reassign_deleted_project() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare home uuid := my_things_project(old.creator_id);
begin
  if home is null then return old; end if;  -- the creator is being deleted; the cascade takes everything
  update cards   set project_id = home where project_id = old.id;
  update actions set project_id = home where project_id = old.id;
  return old;
end;
$$;
revoke execute on function reassign_deleted_project() from public, anon, authenticated;

create trigger projects_reassign_on_delete before delete on projects
  for each row when (old.kind = 'user') execute function reassign_deleted_project();

-- Backfill: everything before projects existed is in My things.
update cards   c set project_id = my_things_project(c.creator_id) where project_id is null;
update actions a set project_id = my_things_project(a.creator_id) where project_id is null;

alter table cards   alter column project_id set not null;
alter table actions alter column project_id set not null;
