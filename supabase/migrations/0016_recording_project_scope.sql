-- "Talk to this project" (P11) opens Record with a project. The recording carries it, and the pipeline scopes to it:
-- the classifier sees that project's recent threads, and a card lands in that project unless the classifier names
-- another of her projects. To-dos still go to My things (0011 trigger) — errands aren't project work.

alter table recordings add column project_id uuid references projects(id) on delete set null;
-- 0006 limits what the app may insert on recordings to named columns.
grant insert (project_id) on recordings to authenticated;

-- Recordings join threads in having no default project (null = not scoped); the ownership check still applies.
create or replace function place_in_project() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is null then
    if tg_table_name not in ('threads', 'recordings') then
      new.project_id := my_things_project(new.creator_id);
    end if;
  elsif not exists (select 1 from projects where id = new.project_id and creator_id = new.creator_id) then
    raise exception 'project % does not belong to creator %', new.project_id, new.creator_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger recordings_place_in_project before insert or update of project_id on recordings
  for each row execute function place_in_project();

-- The resolver gains the scope: a named project if it matches, else the recording's project, else My things.
drop function resolve_project(text, text);
create function resolve_project(p_creator_id text, p_candidate text, p_scope uuid default null) returns uuid
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
    (select id from projects where id = p_scope and creator_id = p_creator_id),
    my_things_project(p_creator_id)
  );
$$;
revoke execute on function resolve_project(text, text, uuid) from public, anon, authenticated;
