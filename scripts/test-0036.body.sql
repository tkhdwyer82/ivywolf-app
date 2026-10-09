create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;

do $$
declare me text := 'user_3JfYR4D8eJVCL3yieXStYYoqwaH'; n int;
begin
  select count(*) into n from suggestions where source = 'pinterest';
  insert into r values (default, 'no stored Pinterest suggestion is left', n = 0, format('%s left', n));
  select count(*) into n from suggestions;
  insert into r values (default, 'other suggestions are kept', n > 0, format('%s suggestions', n));

  begin
    insert into suggestions (creator_id, field, source, title, rank) values (me, 'aesthetic', 'pinterest', 'x', 1);
    insert into r values (default, 'a Pinterest suggestion can''t be stored', false, 'inserted');
  exception when check_violation then
    insert into r values (default, 'a Pinterest suggestion can''t be stored', true, sqlerrm);
  end;
  begin
    insert into suggestions (creator_id, field, source, title, rank) values (me, 'format', 'youtube', 'x', 1);
    insert into r values (default, 'a YouTube suggestion still can', true, 'inserted');
  exception when others then
    insert into r values (default, 'a YouTube suggestion still can', false, sqlerrm);
  end;
  begin
    insert into cards (creator_id, title, gist, play_from_ms, confidence, source) values (me, 'x', 'x', 0, 1, 'pinterest');
    insert into r values (default, 'a pin can''t become a card', false, 'inserted');
  exception when check_violation then
    insert into r values (default, 'a pin can''t become a card', true, sqlerrm);
  end;
  begin
    insert into style_signals (creator_id, kind, source) values (me, 'suggestion_pin', 'pinterest');
    insert into r values (default, 'style_signals refuses a Pinterest source', false, 'inserted');
  exception when check_violation then
    insert into r values (default, 'style_signals refuses a Pinterest source', true, sqlerrm);
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"user_3JfYR4D8eJVCL3yieXStYYoqwaH","role":"authenticated"}', true);
set local role authenticated;
do $$
declare id bigint;
begin
  begin
    perform write_style_signal('suggestion_pin', '{"source":"pinterest","field":"aesthetic"}');
    insert into r values (default, 'write_style_signal refuses Pinterest', false, 'written');
  exception when others then
    insert into r values (default, 'write_style_signal refuses Pinterest', sqlerrm like '%Pinterest%', sqlerrm);
  end;
  id := write_style_signal('suggestion_pin', '{"source":"youtube","field":"format"}');
  insert into r values (default, 'write_style_signal still writes other sources', id is not null, id::text);
end $$;
reset role;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
