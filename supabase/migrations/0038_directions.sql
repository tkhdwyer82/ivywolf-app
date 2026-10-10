-- 0038 — More ideas, free (Job H): Ivy's directions for a project, and the form profile they follow.
--
-- A direction is a suggestion of kind 'direction' (suggestions, 0028): something her own cards point to that she hasn't
-- said yet — never a rewording of a card — with one cited line of her own words, a form, and a visual_query for its
-- references (looked up live, never stored: packages/pipeline/references). Written by the pipeline (service role);
-- she reads her own (the 0028 policy) and acts through the functions below. Nothing here spends credits.
--
-- Columns the brief names that 0028 already has are reused, not duplicated:
--   cite_recording_id → why_recording_id   (0028 already forgets it when the recording is deleted)
--   cite_ms           → why_ms
--   the cited line    → why
--   project_id, status (extended with new / saved below)
-- New: kind, gist, cite_card_ids, format, visual_query, payload, generated_at, model_version, hearted_at.
-- payload is what the direction's form needs to stand as a card (0033 cards_shape_has_payload): {"board": {hook,
-- beats}} | {"quote": {text, speaker}} | {"diagram": {title, rows}}; a quote's text is her words, verbatim.
--
-- projects.format_profile — rolling counts of the forms she keeps, hearts, pins and dismisses (last 90 days),
-- recomputed by trigger. projects.directions_stale_at marks that something changed (a card landed, a pin, a heart, a
-- link); generation waits until it has been quiet 5 minutes (the debounce) and runs when the project is next opened,
-- or when the last generation is over 24 h old. projects.directions_at is the last generation.

-- ── suggestions → directions ────────────────────────────────────────────────────────────────────────────────────
alter table suggestions
  add column kind text not null default 'suggestion' check (kind in ('suggestion', 'direction')),
  add column gist text,
  add column cite_card_ids uuid[] not null default '{}',
  add column format text check (format in ('photo', 'quote', 'board', 'diagram', 'text', 'video')),
  add column visual_query text,
  add column payload jsonb not null default '{}',
  add column generated_at timestamptz,
  add column model_version text,
  add column hearted_at timestamptz;

alter table suggestions drop constraint suggestions_status_check;
alter table suggestions add constraint suggestions_status_check
  check (status in ('shown', 'pinned', 'dismissed', 'hidden', 'expired', 'new', 'saved'));

-- A direction always carries what makes it hers: a project, a form, at least one cited card and the cited line.
alter table suggestions add constraint suggestions_direction_complete check (
  kind <> 'direction' or (
    project_id is not null and format is not null and why is not null and cardinality(cite_card_ids) >= 1
    and generated_at is not null and model_version is not null
    and status in ('new', 'saved', 'dismissed', 'expired')
  )
);
create index suggestions_directions_idx on suggestions (project_id, status, generated_at desc) where kind = 'direction';

alter table suggestion_signals drop constraint suggestion_signals_signal_check;
alter table suggestion_signals add constraint suggestion_signals_signal_check
  check (signal in ('pin', 'dismiss', 'hide', 'open', 'play_why', 'save', 'heart', 'unheart'));

-- ── cards: a saved direction becomes a card ─────────────────────────────────────────────────────────────────────
alter table cards drop constraint cards_source_check;
alter table cards add constraint cards_source_check
  check (source in ('voice', 'import', 'muse', 'youtube', 'tiktok', 'graph', 'direction'));

-- ── projects: the form profile and the generation clock ─────────────────────────────────────────────────────────
alter table projects
  add column format_profile jsonb not null default '{}',
  add column directions_stale_at timestamptz,
  add column directions_at timestamptz;

-- {"kept": {"board": 3, …}, "hearted": {…}, "pinned": {…}, "dismissed": {…}, "updated_at": "…"} over the last 90 days.
-- kept = cards in the project by form; dismissed = directions she ✕'d, by form.
create or replace function recompute_format_profile(p_project uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update projects p set format_profile = jsonb_build_object(
    'kept',      coalesce((select jsonb_object_agg(f, n) from (select coalesce(shape, 'text') f, count(*) n from cards
                   where project_id = p_project and created_at > now() - interval '90 days' group by 1) x), '{}'),
    'hearted',   coalesce((select jsonb_object_agg(f, n) from (select coalesce(shape, 'text') f, count(*) n from cards
                   where project_id = p_project and hearted_at > now() - interval '90 days' group by 1) x), '{}'),
    'pinned',    coalesce((select jsonb_object_agg(f, n) from (select coalesce(shape, 'text') f, count(*) n from cards
                   where project_id = p_project and pinned_at > now() - interval '90 days' group by 1) x), '{}'),
    'dismissed', coalesce((select jsonb_object_agg(f, n) from (select format f, count(*) n from suggestions
                   where project_id = p_project and kind = 'direction' and status = 'dismissed'
                     and acted_at > now() - interval '90 days' group by 1) x), '{}'),
    'updated_at', now()
  )
  where p.id = p_project;
$$;

-- Cards: a new card, a changed form, a pin or a heart → the profile moves and directions are due.
create or replace function cards_directions_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.project_id is not null then perform recompute_format_profile(old.project_id); end if;
    return old;
  end if;
  if new.project_id is not null then
    perform recompute_format_profile(new.project_id);
    if tg_op = 'INSERT' or new.pinned_at is distinct from old.pinned_at or new.hearted_at is distinct from old.hearted_at
       or new.project_id is distinct from old.project_id then
      update projects set directions_stale_at = now() where id = new.project_id;
    end if;
  end if;
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id and old.project_id is not null then
    perform recompute_format_profile(old.project_id);
  end if;
  return new;
end;
$$;

create trigger cards_directions_changed after insert or delete or update of shape, hearted_at, pinned_at, project_id on cards
  for each row execute function cards_directions_changed();

-- Directions: a dismiss feeds the profile.
create or replace function directions_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'direction' and new.status is distinct from old.status and new.project_id is not null then
    perform recompute_format_profile(new.project_id);
  end if;
  return new;
end;
$$;

create trigger directions_status_changed after update of status on suggestions
  for each row execute function directions_status_changed();

-- Link ideas → both cards' projects are due.
create or replace function card_links_directions_due()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update projects set directions_stale_at = now()
   where id in (select project_id from cards where id in (new.card_a, new.card_b) and project_id is not null);
  return new;
end;
$$;
create trigger card_links_directions_due after insert on card_links
  for each row execute function card_links_directions_due();

-- ── What she does to a direction: one call each, her own only ───────────────────────────────────────────────────

-- Save (+): a real card in the project — her cite carried over (the recording and moment she said it), the form kept
-- with its payload, references dropped (they were never stored). 'video' has no card form yet, so it is kept as a
-- board. A form whose payload is missing stands as text rather than failing (0033 cards_shape_has_payload).
create or replace function save_direction(p_suggestion uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := auth.jwt() ->> 'sub';
  s suggestions%rowtype;
  card uuid;
  form text;
begin
  if me is null then raise exception 'save_direction: no signed-in creator'; end if;
  select * into s from suggestions where id = p_suggestion and creator_id = me and kind = 'direction' for update;
  if not found then raise exception 'save_direction: no such direction'; end if;
  if s.status = 'saved' then
    select id into card from cards where source_suggestion_id = s.id and creator_id = me order by created_at limit 1;
    return card;
  end if;
  if s.status <> 'new' then raise exception 'save_direction: this direction was %', s.status; end if;
  if s.why_recording_id is null then raise exception 'save_direction: a direction needs the recording it cites'; end if;

  form := case when s.format = 'video' then 'board' else s.format end;
  if (form = 'board' and s.payload -> 'board' is null) or (form = 'quote' and s.payload -> 'quote' is null)
     or (form = 'diagram' and s.payload -> 'diagram' is null) then
    form := 'text';
  end if;
  insert into cards (creator_id, recording_id, project_id, title, gist, play_from_ms, confidence, source,
                     source_suggestion_id, shape, shape_set_by, visual_query, quote, diagram, board, frame_status)
  values (me, s.why_recording_id, s.project_id, s.title, coalesce(s.gist, s.title), coalesce(s.why_ms, 0), 1, 'direction',
          s.id, form, 'ivy', s.visual_query,
          case when form = 'quote' then s.payload -> 'quote' end,
          case when form = 'diagram' then s.payload -> 'diagram' end,
          case when form = 'board' then s.payload -> 'board' end,
          'none')
  returning id into card;

  update suggestions set status = 'saved', acted_at = now() where id = s.id;
  insert into suggestion_signals (creator_id, suggestion_id, signal) values (me, s.id, 'save');
  return card;
end;
$$;

-- ✕: dismissed for good; feeds the profile (trigger above) and the avoid-list of the next generation.
create or replace function dismiss_direction(p_suggestion uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me text := auth.jwt() ->> 'sub';
begin
  if me is null then raise exception 'dismiss_direction: no signed-in creator'; end if;
  update suggestions set status = 'dismissed', acted_at = now()
   where id = p_suggestion and creator_id = me and kind = 'direction' and status = 'new';
  if not found then raise exception 'dismiss_direction: no such new direction'; end if;
  insert into suggestion_signals (creator_id, suggestion_id, signal) values (me, p_suggestion, 'dismiss');
end;
$$;

-- ♥: a favourite, on or off. A positive signal; nothing else changes.
create or replace function heart_direction(p_suggestion uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me text := auth.jwt() ->> 'sub';
begin
  if me is null then raise exception 'heart_direction: no signed-in creator'; end if;
  update suggestions set hearted_at = case when p_on then coalesce(hearted_at, now()) end
   where id = p_suggestion and creator_id = me and kind = 'direction';
  if not found then raise exception 'heart_direction: no such direction'; end if;
  insert into suggestion_signals (creator_id, suggestion_id, signal) values (me, p_suggestion, case when p_on then 'heart' else 'unheart' end);
end;
$$;

grant execute on function save_direction(uuid), dismiss_direction(uuid), heart_direction(uuid, boolean) to authenticated;

-- Every existing project starts with its profile.
select recompute_format_profile(id) from projects;
