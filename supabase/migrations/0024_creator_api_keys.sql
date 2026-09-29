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
