-- The bridge (Job G step 6): every suggestion signal is a style signal, written by the one writer,
-- write_style_signal(kind, payload) (0028) — the same function Job D's take picks call.
--
--   pin       → suggestion_pin        dismiss → suggestion_dismiss     hide → suggestion_hide
--   open      → suggestion_open       play_why → suggestion_play_why
--
-- payload: { field, source, suggestion_id, thread_id, project_id }. field and source are lifted into their columns
-- by the writer. A pinned own-graph suggestion's source stays 'graph' (0031) — here too.
--
-- Signals are only ever hers, written in her session (the pin / act functions, or her own open / play_why insert),
-- so the writer's caller is the signal's creator. Anything else is refused rather than written under someone else.

create function bridge_suggestion_signal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s suggestions%rowtype;
begin
  if coalesce(auth.jwt() ->> 'sub', '') <> new.creator_id then
    raise exception 'suggestion signal for % written outside her session', new.creator_id;
  end if;
  select * into s from suggestions where id = new.suggestion_id;
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

create trigger suggestion_signals_to_style_signals after insert on suggestion_signals
  for each row execute function bridge_suggestion_signal();
