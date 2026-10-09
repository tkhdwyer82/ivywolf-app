-- 0036 — Pinterest's developer terms in the schema (packages/schema/pinterest.ts, docs/pinterest.md).
--
-- Store nothing but the OAuth token (in Vault): a Pinterest suggestion row is a cached pin, and a Pinterest card is a
-- stored pin, so neither may exist. Pins are never inputs to style_signals. Pinterest suggestions will be fetched live
-- from its API and shown unaltered with a link back; nothing here stores them.
--
-- Data: the two seeded placeholder Pinterest suggestions (test account) are deleted. Their images in
-- frames/<creator>/fixture/ are removed through the storage API, not here (deleting storage.objects rows in SQL leaves
-- the files). Nothing Pinterest-sourced is in cards, style_signals, suggestion_signals or generation_runs (checked
-- 2026-10-09), so the constraints below apply to every existing row.

delete from suggestions where source = 'pinterest';

alter table suggestions drop constraint suggestions_source_check;
alter table suggestions add constraint suggestions_source_check check (source in ('youtube', 'tiktok', 'graph'));

alter table cards drop constraint cards_source_check;
alter table cards add constraint cards_source_check check (source in ('voice', 'import', 'muse', 'youtube', 'tiktok', 'graph'));
alter table cards drop constraint cards_recording_unless_pinned;
alter table cards add constraint cards_recording_unless_pinned check (recording_id is not null or source in ('youtube', 'tiktok'));

-- Her taste is learned from her own work, never from Pinterest.
alter table style_signals add constraint style_signals_not_pinterest check (source is distinct from 'pinterest');

create or replace function write_style_signal(p_kind text, p_payload jsonb default '{}')
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := auth.jwt() ->> 'sub';
  new_id bigint;
begin
  if me is null then raise exception 'write_style_signal: no signed-in creator'; end if;
  if coalesce(trim(p_kind), '') = '' then raise exception 'write_style_signal: kind is required'; end if;
  -- Pinterest terms: pins are never inputs to style_signals.
  if p_payload ->> 'source' = 'pinterest' then raise exception 'write_style_signal: Pinterest pins are never style signals'; end if;
  insert into style_signals (creator_id, kind, field, source, payload)
  values (me, p_kind, p_payload ->> 'field', p_payload ->> 'source', coalesce(p_payload, '{}'))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function bridge_suggestion_signal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s suggestions%rowtype;
begin
  if coalesce(auth.jwt() ->> 'sub', '') <> new.creator_id then
    raise exception 'suggestion signal for % written outside her session', new.creator_id;
  end if;
  select * into s from suggestions where id = new.suggestion_id;
  -- Pinterest terms: never a style signal (and no Pinterest suggestion can be stored any more).
  if s.source = 'pinterest' then return new; end if;
  perform write_style_signal(
    'suggestion_' || new.signal,
    jsonb_build_object(
      'field', s.field,
      'source', s.source,
      'suggestion_id', s.id,
      'thread_id', s.thread_id,
      'project_id', s.project_id
    )
  );
  return new;
end;
$$;

create or replace function pin_suggestion(p_suggestion uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := auth.jwt() ->> 'sub';
  s suggestions%rowtype;
  card uuid;
  rec uuid;
  ms int := 0;
begin
  if me is null then raise exception 'pin_suggestion: no signed-in creator'; end if;
  select * into s from suggestions where id = p_suggestion and creator_id = me for update;
  if not found then raise exception 'pin_suggestion: no such suggestion'; end if;
  -- Pinterest terms: a pin never becomes a card (that would store it).
  if s.source = 'pinterest' then raise exception 'pin_suggestion: Pinterest pins are never stored'; end if;

  if s.status = 'pinned' then
    select id into card from cards where source_suggestion_id = s.id and creator_id = me order by created_at limit 1;
    return card;
  end if;
  if s.status <> 'shown' then raise exception 'pin_suggestion: this suggestion was %', s.status; end if;

  if s.source = 'graph' then
    rec := coalesce(s.why_recording_id, (select recording_id from cards where id = s.near_card_id));
    ms := coalesce(s.why_ms, (select play_from_ms from cards where id = s.near_card_id), 0);
    if rec is null then raise exception 'pin_suggestion: a graph suggestion needs the recording it came from'; end if;
  end if;

  insert into cards (creator_id, recording_id, project_id, title, gist, play_from_ms, confidence,
                     source, source_url, source_suggestion_id, frame_url, frame_status, frame_at)
  values (me, rec, s.project_id, s.title, s.title, ms, 1,
          s.source, s.source_url, s.id,
          s.frame_url, case when s.frame_url is null then 'none' else 'done' end,
          case when s.frame_url is null then null else now() end)
  returning id into card;

  if s.thread_id is not null then
    insert into thread_cards (thread_id, card_id) values (s.thread_id, card) on conflict do nothing;
  end if;
  update suggestions set status = 'pinned', acted_at = now() where id = s.id;
  insert into suggestion_signals (creator_id, suggestion_id, signal) values (me, s.id, 'pin');
  return card;
end;
$$;
