create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;

do $$
declare
  me text := 'user_3JfYR4D8eJVCL3yieXStYYoqwaH';
  bad int; hue_seq text; p1 uuid; p2 uuid; things_hue text; c uuid;
begin
  select count(*) into bad from projects where hue is null;
  insert into r values (default, 'every project has a hue', bad = 0, bad::text);
  select count(*) into bad from projects where kind = 'things' and hue <> 'cool-grey';
  insert into r values (default, 'My things is cool-grey', bad = 0, bad::text);
  select count(*) into bad from projects where kind <> 'things' and hue = 'cool-grey';
  insert into r values (default, 'only My things is cool-grey', bad = 0, bad::text);
  select string_agg(hue, ',' order by created_at, is_default desc, id) into hue_seq from projects where creator_id = me and kind <> 'things';
  insert into r values (default, 'backfill cycles coral, sage, butter, slate in creation order', hue_seq like 'coral,sage%', hue_seq);

  insert into projects (creator_id, name) values (me, 'Hue test A') returning id into p1;
  insert into projects (creator_id, name) values (me, 'Hue test B') returning id into p2;
  select string_agg(hue, ',' order by created_at, id) into hue_seq from projects where id in (p1, p2);
  insert into r values (default, 'new projects take the next hues', hue_seq is not null and hue_seq not like '%cool-grey%', hue_seq);
  insert into r values (default, 'consecutive projects differ', (select count(distinct hue) from projects where id in (p1, p2)) = 2, hue_seq);

  select id into c from cards where creator_id = me limit 1;
  update cards set reference_picture = '{"source": "pixabay", "id": "1", "url": "https://x", "thumb_url": "https://x", "link_url": "https://x", "credit": {"name": "a", "url": "https://x"}, "width": 1, "height": 1}' where id = c;
  insert into r values (default, 'a Pixabay reference picture is accepted', true, c::text);
  begin
    update cards set reference_picture = '{"source": "pinterest", "id": "1"}' where id = c;
    insert into r values (default, 'a Pinterest reference picture is refused', false, 'updated');
  exception when check_violation then
    insert into r values (default, 'a Pinterest reference picture is refused', true, sqlerrm);
  end;
end $$;

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
