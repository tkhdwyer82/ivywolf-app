-- My things (P4): "done yesterday" on a to-do, and Merge on Ivy's "these might be one idea".
--
-- actions.done_at: when she ticked it. Set and cleared by trigger whenever `done` flips, so every writer (the app,
-- Undo, a future Reminders sync) gets it right without sending it. Existing done rows have no time; P4 shows
-- them as "done" with no day.
--
-- accept_merge(suggestion): her Merge. The suggestion pairs two cards in different threads (threading.ts
-- proposes, never merges — CLAUDE.md, CA2). Accepting folds the smaller thread into the larger (ties: the older
-- one survives): its cards and boards move over, return_count adds up, first/last seen widen, the centroid is
-- recomputed from the cards, and the emptied thread is deleted. Any other proposal whose two cards now share a
-- thread is accepted with it. The survivor keeps its title and project. Her own proposals only.

alter table actions add column done_at timestamptz;

create function stamp_action_done() returns trigger
language plpgsql
as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at := now();
  elsif not new.done then
    new.done_at := null;
  end if;
  return new;
end;
$$;

create trigger actions_stamp_done before insert or update of done on actions
  for each row execute function stamp_action_done();

create function accept_merge(p_suggestion_id uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s merge_suggestions;
  ta uuid;
  tb uuid;
  keep uuid;
  fold uuid;
begin
  select * into s from merge_suggestions
   where id = p_suggestion_id and creator_id = (auth.jwt() ->> 'sub') and status = 'proposed';
  if not found then
    return null;
  end if;

  select thread_id into ta from thread_cards where card_id = s.a_card_id limit 1;
  select thread_id into tb from thread_cards where card_id = s.b_card_id limit 1;

  if ta is null and tb is null then
    -- Neither card is threaded (shouldn't happen): nothing to fold; she's said they're one idea, so record it.
    update merge_suggestions set status = 'accepted' where id = s.id;
    return null;
  elsif ta is null or tb is null or ta = tb then
    keep := coalesce(ta, tb);
    insert into thread_cards (thread_id, card_id)
      select keep, c from unnest(array[s.a_card_id, s.b_card_id]) c
      on conflict do nothing;
  else
    -- The larger thread survives; on a tie, the older.
    select t.id into keep
      from threads t
     where t.id in (ta, tb)
     order by (select count(*) from thread_cards tc where tc.thread_id = t.id) desc, t.first_seen, t.id
     limit 1;
    fold := case when keep = ta then tb else ta end;

    insert into thread_cards (thread_id, card_id)
      select keep, card_id from thread_cards where thread_id = fold
      on conflict do nothing;
    update boards set thread_id = keep where thread_id = fold;
    update threads k
       set return_count = k.return_count + f.return_count,
           first_seen = least(k.first_seen, f.first_seen),
           last_seen = greatest(k.last_seen, f.last_seen)
      from threads f
     where k.id = keep and f.id = fold;
    delete from threads where id = fold;
  end if;

  update threads
     set embedding = (select avg(c.embedding) from thread_cards tc join cards c on c.id = tc.card_id where tc.thread_id = keep)
   where id = keep;

  update merge_suggestions m
     set status = 'accepted'
   where m.creator_id = s.creator_id
     and m.status = 'proposed'
     and (m.id = s.id or exists (
       select 1 from thread_cards x join thread_cards y on y.thread_id = x.thread_id
        where x.card_id = m.a_card_id and y.card_id = m.b_card_id
     ));
  return keep;
end;
$$;
revoke execute on function accept_merge(uuid) from public, anon;
grant execute on function accept_merge(uuid) to authenticated;
