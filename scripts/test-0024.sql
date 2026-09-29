-- Rolled-back test for 0024 (write, test in a rolled-back transaction, dry-run, push).
-- Applies the migration inside the transaction, runs as the creator through RLS, and rolls everything back.
--
--   supabase db query --linked -f scripts/test-0024.sql
begin;
-- The Muse connector's keys (Job F §4). A creator makes a key in Connect your Muse, pastes it into Muse as a custom
-- connector, and Muse calls /mcp with `Authorization: Bearer iv_…`. Least privilege (§2 rule 4): each key carries its
-- scopes, and there are two — ideas:read ("Let Muse read your ideas") and ideas:capture ("Let Muse add ideas to Ivy").
--
-- Replaces api_keys (0004), which had no scopes: a key there could do anything the MCP server offered. Its rows are
-- copied here as read-only keys; api_keys stays until a later migration drops it (nothing reads it after this job).
--
-- Only the SHA-256 hash is stored (apps/web/lib/mcp/auth.ts); the raw key is shown once. Revoked, never deleted,
-- so the audit trail survives. The creator reads her keys' labels and dates but never the hash, and may change
-- only the label and revoked_at — scopes are fixed at creation, so widening a key means making a new one.

create table creator_api_keys (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  hash text not null unique,
  scopes text[] not null check (cardinality(scopes) > 0 and scopes <@ array['ideas:read', 'ideas:capture']),
  label text not null default 'Muse' check (length(btrim(label)) between 1 and 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index on creator_api_keys (creator_id, created_at desc);

alter table creator_api_keys enable row level security;
create policy "own api keys: read" on creator_api_keys for select using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own api keys: create" on creator_api_keys for insert with check (creator_id = (auth.jwt() ->> 'sub'));
create policy "own api keys: revoke" on creator_api_keys for update
  using (creator_id = (auth.jwt() ->> 'sub'))
  with check (creator_id = (auth.jwt() ->> 'sub'));

-- Column grants: RLS picks the rows, these pick the columns (as recordings, 0006). No delete grant at all.
revoke all on creator_api_keys from anon, authenticated;
grant select (id, creator_id, scopes, label, created_at, last_used_at, revoked_at) on creator_api_keys to authenticated;
grant insert (creator_id, hash, scopes, label) on creator_api_keys to authenticated;
grant update (label, revoked_at) on creator_api_keys to authenticated;

-- A revoked key stays revoked.
create function keep_key_revoked() returns trigger
language plpgsql
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'a revoked key cannot be restored' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger creator_api_keys_keep_revoked before update of revoked_at on creator_api_keys
  for each row execute function keep_key_revoked();

insert into creator_api_keys (creator_id, hash, scopes, label, created_at, last_used_at, revoked_at)
select creator_id, key_hash, array['ideas:read'], left(label, 60), created_at, last_used_at, revoked_at from api_keys
on conflict (hash) do nothing;

create temp table r(n serial, check_name text, ok boolean, detail text) on commit drop;
grant all on r to authenticated; grant all on r_n_seq to authenticated;

-- ── As her, through RLS, the way apps/web/app/api/api-keys writes ─────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"user_3JfFAEHAdkvURqPjYDQ4BkVd2rb","role":"authenticated"}', true);
set local role authenticated;
do $$
declare k uuid; n int; s text[];
begin
  insert into creator_api_keys (creator_id, hash, scopes, label)
    values ('user_3JfFAEHAdkvURqPjYDQ4BkVd2rb', 'test-0024-hash', array['ideas:read', 'ideas:capture'], 'Muse')
    returning id into k;
  perform set_config('t.key', k::text, true);
  select scopes into s from creator_api_keys where id = k;
  insert into r (check_name, ok, detail) values ('she makes a key with both scopes', s = array['ideas:read', 'ideas:capture'], s::text);

  begin
    insert into creator_api_keys (creator_id, hash, scopes) values ('user_3JfFAEHAdkvURqPjYDQ4BkVd2rb', 'test-0024-b', array['boards:write']);
    insert into r (check_name, ok, detail) values ('an unknown scope is refused', false, 'inserted');
  exception when check_violation then
    insert into r (check_name, ok, detail) values ('an unknown scope is refused', true, sqlerrm);
  end;

  begin
    insert into creator_api_keys (creator_id, hash, scopes) values ('user_3JfFAEHAdkvURqPjYDQ4BkVd2rb', 'test-0024-c', '{}');
    insert into r (check_name, ok, detail) values ('a key with no scope is refused', false, 'inserted');
  exception when check_violation then
    insert into r (check_name, ok, detail) values ('a key with no scope is refused', true, sqlerrm);
  end;

  begin
    insert into creator_api_keys (creator_id, hash, scopes) values ('user_3JfYR4D8eJVCL3yieXStYYoqwaH', 'test-0024-d', array['ideas:read']);
    insert into r (check_name, ok, detail) values ('she can''t make a key for someone else', false, 'inserted');
  exception when insufficient_privilege then
    insert into r (check_name, ok, detail) values ('she can''t make a key for someone else', true, sqlerrm);
  end;

  begin
    perform hash from creator_api_keys where id = k;
    insert into r (check_name, ok, detail) values ('she can''t read the hash', false, 'read');
  exception when insufficient_privilege then
    insert into r (check_name, ok, detail) values ('she can''t read the hash', true, sqlerrm);
  end;

  begin
    update creator_api_keys set scopes = array['ideas:read', 'ideas:capture'] where id = k;
    insert into r (check_name, ok, detail) values ('she can''t change scopes', false, 'updated');
  exception when insufficient_privilege then
    insert into r (check_name, ok, detail) values ('she can''t change scopes', true, sqlerrm);
  end;

  update creator_api_keys set revoked_at = now() where id = k;
  get diagnostics n = row_count;
  insert into r (check_name, ok, detail) values ('she revokes it', n = 1, n::text);

  begin
    update creator_api_keys set revoked_at = null where id = k;
    insert into r (check_name, ok, detail) values ('a revoked key stays revoked', false, 'restored');
  exception when insufficient_privilege then
    insert into r (check_name, ok, detail) values ('a revoked key stays revoked', true, sqlerrm);
  end;

  begin
    delete from creator_api_keys where id = k;
    insert into r (check_name, ok, detail) values ('she can''t delete a key', false, 'deleted');
  exception when insufficient_privilege then
    insert into r (check_name, ok, detail) values ('she can''t delete a key', true, sqlerrm);
  end;
end $$;

-- ── Someone else can't see or revoke it ───────────────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"user_3JfYR4D8eJVCL3yieXStYYoqwaH","role":"authenticated"}', true);
set local role authenticated;
do $$
declare k uuid := current_setting('t.key')::uuid; n int;
begin
  select count(*) into n from creator_api_keys where id = k;
  insert into r (check_name, ok, detail) values ('another creator can''t see it', n = 0, n::text);
  update creator_api_keys set label = 'mine now' where id = k;
  get diagnostics n = row_count;
  insert into r (check_name, ok, detail) values ('another creator updates 0 rows', n = 0, n::text);
end $$;
reset role;

-- ── The copy from api_keys ────────────────────────────────────────────────────────────────────────────────────
insert into r (check_name, ok, detail)
  select 'every api_keys row copied as read-only',
         (select count(*) from api_keys) = (select count(*) from creator_api_keys c join api_keys a on a.key_hash = c.hash and c.scopes = array['ideas:read']),
         (select count(*) from api_keys)::text || ' old key(s)';

select n, case when ok then 'pass' else 'FAIL' end as result, check_name, detail from r order by n;
rollback;
