create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;

do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; rec uuid; c uuid;
begin
  insert into recordings (creator_id, source, storage_path) values (me, 'phone', 'test/0033') returning id into rec;
  insert into cards (creator_id, recording_id, title, gist, play_from_ms, confidence, shape, shape_set_by, quote)
    values (me, rec, 'We scaled the apology', 'x', 760000, 0.9, 'quote', 'ivy', '{"text":"We scaled the apology.","speaker":null}')
    returning id into c;
  perform set_config('t.c', c::text, true);
  insert into r values (default, 'a quote card with its quote is accepted', true, c::text);

  begin
    insert into cards (creator_id, recording_id, title, gist, play_from_ms, confidence, shape) values (me, rec, 'x', 'x', 0, 0.9, 'diagram');
    insert into r values (default, 'a diagram card needs its diagram', false, 'inserted');
  exception when check_violation then
    insert into r values (default, 'a diagram card needs its diagram', true, sqlerrm);
  end;
  begin
    insert into cards (creator_id, recording_id, title, gist, play_from_ms, confidence, shape) values (me, rec, 'x', 'x', 0, 0.9, 'sticker');
    insert into r values (default, 'an unknown shape is refused', false, 'inserted');
  exception when check_violation then
    insert into r values (default, 'an unknown shape is refused', true, sqlerrm);
  end;
  insert into cards (creator_id, recording_id, title, gist, play_from_ms, confidence) values (me, rec, 'old', 'x', 0, 0.9) returning id into c;
  insert into r values (default, 'a card with no shape (made before 0033) is still accepted', (select shape is null from cards where id = c), c::text);
end $$;

-- As her: Change view writes the shape and the signal (lib/idea.ts setShape).
select set_config('request.jwt.claims', '{"sub":"user_3JfFAEHAdkvURqPjYDQ4BkVd2rb","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int; s text; by_ text;
begin
  update cards set shape = 'text', shape_set_by = 'creator' where id = current_setting('t.c')::uuid;
  get diagnostics n = row_count;
  select shape, shape_set_by into s, by_ from cards where id = current_setting('t.c')::uuid;
  insert into r values (default, 'she can change her card''s view', n = 1 and s = 'text' and by_ = 'creator', format('%s rows, %s by %s', n, s, by_));
  begin
    update cards set shape = 'board' where id = current_setting('t.c')::uuid;
    insert into r values (default, 'she can''t pick a view the card has no words for', false, 'updated');
  exception when check_violation then
    insert into r values (default, 'she can''t pick a view the card has no words for', true, sqlerrm);
  end;
  perform write_style_signal('shape_change', jsonb_build_object('field', 'shape', 'card_id', current_setting('t.c'), 'from', 'quote', 'to', 'text'));
  select count(*) into n from style_signals where kind = 'shape_change' and payload ->> 'card_id' = current_setting('t.c');
  insert into r values (default, 'Change view is a style signal', n = 1, format('%s signal(s)', n));
end $$;
reset role;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
