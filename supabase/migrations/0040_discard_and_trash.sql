-- Job B.3: discard and trash.
--
-- recordings.discarded_at — a take she threw away before it became cards: Undo on Home's "Writing it up" pill. It is
--   the pipeline's stop signal (checked between stages) and the purge job's to-do if the delete that follows it
--   didn't finish. Discarding before upload (× on the listening screen) never reaches the database.
-- cards.trashed_at, actions.trashed_at — Move to trash. Trashed rows are hidden from every read made with her own
--   token by restrictive select policies, so no screen (app or web) has to remember a filter. The trash view reads
--   them through trashed_items(); trash and restore go through functions too, because an UPDATE whose new row fails a
--   select policy is refused. The service role (pipeline, MCP, purge) bypasses RLS and filters explicitly.
-- Links on a trashed card and its thread membership are hidden, not deleted, so restoring puts them back; thread
--   counts read through thread_cards and so leave trashed cards out.
-- The purge job (apps/web/app/api/cron/purge-trash) deletes trashed rows after 30 days, and a recording's audio once
--   it is discarded or every card and action from it has been in the trash for 30 days.

alter table recordings add column discarded_at timestamptz;
create index recordings_discarded_idx on recordings (discarded_at) where discarded_at is not null;

alter table cards add column trashed_at timestamptz;
create index cards_trashed_idx on cards (creator_id, trashed_at) where trashed_at is not null;

alter table actions add column trashed_at timestamptz;
create index actions_trashed_idx on actions (creator_id, trashed_at) where trashed_at is not null;

create policy "cards: not trashed" on cards as restrictive for select using (trashed_at is null);
create policy "actions: not trashed" on actions as restrictive for select using (trashed_at is null);
-- Through her own token a trashed card isn't visible, so "both cards visible" is "neither end is trashed".
create policy "card_links: both ends live" on card_links as restrictive for select
  using (exists (select 1 from cards where id = card_a) and exists (select 1 from cards where id = card_b));
create policy "thread_cards: card live" on thread_cards as restrictive for select
  using (exists (select 1 from cards where id = card_id));

-- Move an idea to the trash. Other ideas from the same recording stay. If it was the recording's last live idea,
-- the recording's to-dos go with it, stamped with the same time so restore_card brings back exactly those.
create function trash_card(p_card uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := auth.jwt() ->> 'sub';
  rec uuid;
  at timestamptz := now();
  carried int := 0;
begin
  update cards set trashed_at = at
   where id = p_card and creator_id = me and trashed_at is null
  returning recording_id into rec;
  if not found then return null; end if;
  if rec is not null and not exists (select 1 from cards where recording_id = rec and trashed_at is null) then
    update actions set trashed_at = at where recording_id = rec and creator_id = me and trashed_at is null;
    get diagnostics carried = row_count;
  end if;
  return jsonb_build_object('card', p_card, 'actions', carried, 'trashed_at', at);
end $$;

create function restore_card(p_card uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := auth.jwt() ->> 'sub';
  rec uuid;
  was timestamptz;
begin
  select recording_id, trashed_at into rec, was from cards where id = p_card and creator_id = me and trashed_at is not null;
  if not found then return false; end if;
  update cards set trashed_at = null where id = p_card;
  if rec is not null then
    update actions set trashed_at = null where recording_id = rec and creator_id = me and trashed_at = was;
  end if;
  return true;
end $$;

create function trash_action(p_action uuid) returns boolean
language sql
security definer
set search_path = public
as $$
  with t as (
    update actions set trashed_at = now()
     where id = p_action and creator_id = (auth.jwt() ->> 'sub') and trashed_at is null
    returning 1
  ) select exists (select 1 from t);
$$;

create function restore_action(p_action uuid) returns boolean
language sql
security definer
set search_path = public
as $$
  with t as (
    update actions set trashed_at = null
     where id = p_action and creator_id = (auth.jwt() ->> 'sub') and trashed_at is not null
    returning 1
  ) select exists (select 1 from t);
$$;

-- The trash view: her trashed ideas and to-dos, newest first, with the day each is purged. Deleting a recording from
-- Voice notes reads it too, for the files of trashed rows her own select can't see (frames, an import's original).
create function trashed_items()
returns table (kind text, id uuid, title text, recording_id uuid, project_id uuid, frame_url text, media_path text,
               trashed_at timestamptz, purge_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select 'idea'::text, c.id, c.title, c.recording_id, c.project_id, c.frame_url, c.media_path, c.trashed_at, c.trashed_at + interval '30 days'
      from cards c where c.creator_id = (auth.jwt() ->> 'sub') and c.trashed_at is not null
    union all
    select 'to-do'::text, a.id, a.text, a.recording_id, a.project_id, a.frame_url, null::text, a.trashed_at, a.trashed_at + interval '30 days'
      from actions a where a.creator_id = (auth.jwt() ->> 'sub') and a.trashed_at is not null
  ) t order by 8 desc;
$$;

revoke execute on function trash_card(uuid), restore_card(uuid), trash_action(uuid), restore_action(uuid), trashed_items() from public, anon;
grant execute on function trash_card(uuid), restore_card(uuid), trash_action(uuid), restore_action(uuid), trashed_items() to authenticated;
-- The service role sees every row already; this only keeps the shared deletion code (one call for both) from failing.
grant execute on function trashed_items() to service_role;

-- The public page stops answering for a card in the trash (0034's body, plus the last line).
create or replace function shared_card(p_card_id uuid) returns jsonb
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
     and c.shared_at is not null
     and c.trashed_at is null;
$$;
