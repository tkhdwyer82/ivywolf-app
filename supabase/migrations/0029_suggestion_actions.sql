-- More ideas (Job G §3.3–3.4): what she does to a suggestion, as one call each — the status change and its
-- suggestion_signals row together, only on her own, only from 'shown' (a dismissed or hidden suggestion never comes
-- back, and a pinned one can't be dismissed after). Style signals are written by the bridge (Job G step 6), not here.
--
--   act_on_suggestion(id, 'hide')     long-press on a tile — a negative signal, no UI
--   act_on_suggestion(id, 'dismiss')  "Not for me" on the open screen
--   pin_suggestion(id)                "+ Pin to <project>" — a later migration: it also makes the card

create function act_on_suggestion(p_suggestion uuid, p_signal text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  me text := auth.jwt() ->> 'sub';
  status_to text := case p_signal when 'hide' then 'hidden' when 'dismiss' then 'dismissed' end;
  n int;
begin
  if me is null then raise exception 'act_on_suggestion: no signed-in creator'; end if;
  if status_to is null then raise exception 'act_on_suggestion: % is not hide or dismiss', p_signal; end if;
  update suggestions set status = status_to, acted_at = now()
   where id = p_suggestion and creator_id = me and status = 'shown';
  get diagnostics n = row_count;
  if n = 0 then return false; end if;  -- not hers, gone, or already acted on: nothing to log
  insert into suggestion_signals (creator_id, suggestion_id, signal) values (me, p_suggestion, p_signal);
  return true;
end;
$$;
revoke execute on function act_on_suggestion(uuid, text) from public, anon;
grant execute on function act_on_suggestion(uuid, text) to authenticated;
