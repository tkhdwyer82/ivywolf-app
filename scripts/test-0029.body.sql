create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;

do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; other text := 'user_3JfYR4D8eJVCL3yieXStYYoqwaH'; a uuid; b uuid; o uuid;
begin
  insert into suggestions (creator_id, field, source, title, rank) values (me, 'format', 'youtube', 'A', 1) returning id into a;
  insert into suggestions (creator_id, field, source, title, rank) values (me, 'sound', 'tiktok', 'B', 2) returning id into b;
  insert into suggestions (creator_id, field, source, title, rank) values (other, 'sound', 'tiktok', 'O', 1) returning id into o;
  perform set_config('t.a', a::text, true); perform set_config('t.b', b::text, true); perform set_config('t.o', o::text, true);
end $$;

select set_config('request.jwt.claims', '{"sub":"user_3JfFAEHAdkvURqPjYDQ4BkVd2rb","role":"authenticated"}', true);
set local role authenticated;
do $$
declare ok1 boolean; ok2 boolean; st text; n int;
begin
  ok1 := act_on_suggestion(current_setting('t.a')::uuid, 'hide');
  ok2 := act_on_suggestion(current_setting('t.a')::uuid, 'hide');
  select status into st from suggestions where id = current_setting('t.a')::uuid;
  select count(*) into n from suggestion_signals where suggestion_id = current_setting('t.a')::uuid and signal = 'hide';
  insert into r values (default, 'hide: hidden, one signal; a second hide does nothing', ok1 and not ok2 and st = 'hidden' and n = 1, format('%s %s %s %s', ok1, ok2, st, n));

  ok1 := act_on_suggestion(current_setting('t.b')::uuid, 'dismiss');
  select status into st from suggestions where id = current_setting('t.b')::uuid;
  insert into r values (default, 'dismiss: dismissed', ok1 and st = 'dismissed', st);
  ok1 := act_on_suggestion(current_setting('t.b')::uuid, 'hide');
  insert into r values (default, 'a dismissed suggestion can''t be acted on again', not ok1, ok1::text);

  ok1 := act_on_suggestion(current_setting('t.o')::uuid, 'dismiss');
  insert into r values (default, 'another creator''s suggestion is untouched', not ok1, ok1::text);

  begin
    perform act_on_suggestion(current_setting('t.a')::uuid, 'pin');
    insert into r values (default, 'pin isn''t a plain status change', false, 'ran');
  exception when raise_exception then
    insert into r values (default, 'pin isn''t a plain status change', true, sqlerrm);
  end;

  select count(*) into n from style_signals where creator_id = 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb' and created_at >= now();
  insert into r values (default, 'no style signals yet (the bridge is step 6)', n = 0, n::text);
end $$;
reset role;
do $$
declare st text;
begin
  select status into st from suggestions where id = current_setting('t.o')::uuid;
  insert into r values (default, '…still shown', st = 'shown', st);
end $$;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
