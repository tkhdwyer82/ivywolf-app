-- A pinned own-graph suggestion keeps source 'graph' (Job G decision, 29 Sep): it still sits on the recording and
-- moment its why line cites, but the provenance is the signal — a card that came from a suggestion must never look
-- like one she rambled. 0030 made it 'voice'; nothing was pinned from the graph before this ran.
--
--   cards.source  + 'graph'. A graph card must still have its recording (0028's rule names only youtube / tiktok /
--                 pinterest as recording-less).
--   pin_suggestion  the card's source is the suggestion's, always.

alter table cards drop constraint cards_source_check;
alter table cards add constraint cards_source_check
  check (source in ('voice', 'import', 'muse', 'youtube', 'tiktok', 'pinterest', 'graph'));

create or replace function pin_suggestion(p_suggestion uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
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
