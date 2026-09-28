create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;

do $$
declare me text := 'user_3JfFAEHAdkvURqPjYDQ4BkVd2rb'; k uuid; a uuid;
begin
  insert into oauth_clients (client_id, kind, client_name, redirect_uris) values ('ivc_test0027', 'registered', 'Test', array['http://127.0.0.1/cb']);
  begin
    insert into oauth_clients (client_id, kind, client_name, redirect_uris, token_endpoint_auth_method) values ('ivc_test0027b', 'registered', 'Test', array['https://x.example/cb'], 'client_secret_post');
    insert into r (check_name, ok, detail) values ('a confidential client needs a secret hash', false, 'inserted');
  exception when check_violation then
    insert into r (check_name, ok, detail) values ('a confidential client needs a secret hash', true, sqlerrm);
  end;
  insert into creator_api_keys (creator_id, hash, refresh_hash, scopes, label, client_id, expires_at)
    values (me, 'test-0027-at', 'test-0027-rt', array['ideas:read'], 'Test', 'ivc_test0027', now() + interval '30 days') returning id into k;
  insert into oauth_authorizations (creator_id, client_id, redirect_uri, code_challenge, requested_scopes, expires_at, key_id)
    values (me, 'ivc_test0027', 'http://127.0.0.1/cb', repeat('a', 43), array['ideas:read'], now() + interval '5 minutes', k) returning id into a;
  perform set_config('t.key', k::text, true);

  delete from creator_api_keys where id = k;
  insert into r (check_name, ok, detail)
    select 'an authorization outlives its grant (key_id set null)', key_id is null, coalesce(key_id::text, 'null') from oauth_authorizations where id = a;
  insert into creator_api_keys (creator_id, hash, refresh_hash, scopes, label, client_id, expires_at)
    values (me, 'test-0027-at2', 'test-0027-rt2', array['ideas:read'], 'Test', 'ivc_test0027', now() + interval '30 days') returning id into k;
  perform set_config('t.key', k::text, true);
end $$;

select set_config('request.jwt.claims', '{"sub":"user_3JfFAEHAdkvURqPjYDQ4BkVd2rb","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int; c text;
begin
  select client_id into c from creator_api_keys where id = current_setting('t.key')::uuid;
  insert into r (check_name, ok, detail) values ('she sees which app a grant is for', c = 'ivc_test0027', coalesce(c, 'null'));
  begin
    perform refresh_hash from creator_api_keys where id = current_setting('t.key')::uuid;
    insert into r (check_name, ok, detail) values ('she can''t read the refresh hash', false, 'read');
  exception when insufficient_privilege then
    insert into r (check_name, ok, detail) values ('she can''t read the refresh hash', true, sqlerrm);
  end;
  select count(*) into n from oauth_clients;
  insert into r (check_name, ok, detail) values ('she can''t read oauth_clients', n = 0, n::text);
  select count(*) into n from oauth_authorizations;
  insert into r (check_name, ok, detail) values ('she can''t read oauth_authorizations', n = 0, n::text);
  update creator_api_keys set revoked_at = now() where id = current_setting('t.key')::uuid;
  get diagnostics n = row_count;
  insert into r (check_name, ok, detail) values ('she revokes a sign-in like a key', n = 1, n::text);
end $$;
reset role;

delete from oauth_clients where client_id = 'ivc_test0027';
insert into r (check_name, ok, detail)
  select 'a deleted client takes its grants', count(*) = 0, count(*)::text from creator_api_keys where client_id = 'ivc_test0027';

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
