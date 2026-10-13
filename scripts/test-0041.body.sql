
do $$
declare rec uuid;
begin
  insert into recordings (creator_id, source, storage_path, status)
  values ('user_3JfYR4D8eJVCL3yieXStYYoqwaH', 'phone', 'test/0041.m4a', 'processing') returning id into rec;
  perform set_config('t.rec', rec::text, true);
end $$;

select set_config('request.jwt.claims', '{"sub":"user_3JfYR4D8eJVCL3yieXStYYoqwaH","role":"authenticated"}', true);
set local role authenticated;
do $$
declare rec uuid := current_setting('t.rec')::uuid; n int;
begin
  update recordings set discarded_at = now() where id = rec;
  get diagnostics n = row_count;
  insert into r values (default, 'she can stamp her own take discarded', n = 1, n::text);
  begin
    update recordings set status = 'done' where id = rec;
    insert into r values (default, 'she still can''t move its status', false, 'updated');
  exception when insufficient_privilege then
    insert into r values (default, 'she still can''t move its status', true, sqlerrm);
  end;
end $$;
reset role;

select set_config('request.jwt.claims', '{"sub":"user_someone_else","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  update recordings set discarded_at = null where id = current_setting('t.rec')::uuid;
  get diagnostics n = row_count;
  insert into r values (default, 'another creator can''t touch her stamp', n = 0, n::text);
end $$;
reset role;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
