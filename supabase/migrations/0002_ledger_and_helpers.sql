-- Credits ledger (append-only) + atomic decrement. Replaces Gamesfield's read-modify-write on
-- user_subscriptions.credits_remaining, which was racy and lost on partial failure.
-- Also: updated_at trigger fn (salvaged from Gamesfield scene_builder migration) and the Vault helpers
-- (copy 20260526130000_vault_helper_functions.sql verbatim as 0003 — zero domain coupling).

create table subscriptions (
  creator_id text primary key references creators(id) on delete cascade,
  plan text not null default 'pilot',          -- pilot | bundled12 | monthly | free
  status text not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  bundled_until timestamptz,                   -- Kickstarter: 12 months included
  updated_at timestamptz not null default now()
);

create table credit_ledger (
  id bigint generated always as identity primary key,
  creator_id text not null references creators(id) on delete cascade,
  delta int not null,                          -- negative = spend, positive = grant/refund
  reason text not null,                        -- image_frame | higgsfield_clip | grant_monthly | refund | pilot_grant
  ref_id uuid,                                 -- board id / card id / adapter job id
  adapter text,                                -- which adapter charged it (tools are footnotes; the ledger still knows)
  created_at timestamptz not null default now()
);
create index on credit_ledger (creator_id, created_at desc);

create view credit_balance as
  select creator_id, coalesce(sum(delta),0)::int as balance from credit_ledger group by creator_id;

-- Atomic spend: fails if balance would go negative. Call from the worker with the service role.
create or replace function spend_credits(p_creator text, p_cost int, p_reason text, p_ref uuid default null, p_adapter text default null)
returns int language plpgsql security definer as $$
declare bal int;
begin
  perform pg_advisory_xact_lock(hashtext(p_creator));
  select coalesce(sum(delta),0) into bal from credit_ledger where creator_id = p_creator;
  if bal < p_cost then raise exception 'insufficient_credits' using detail = bal::text; end if;
  insert into credit_ledger (creator_id, delta, reason, ref_id, adapter) values (p_creator, -p_cost, p_reason, p_ref, p_adapter);
  return bal - p_cost;
end $$;

create or replace function refund_credits(p_creator text, p_amount int, p_reason text, p_ref uuid default null)
returns void language sql security definer as $$
  insert into credit_ledger (creator_id, delta, reason, ref_id) values (p_creator, p_amount, p_reason, p_ref);
$$;

-- updated_at trigger (from Gamesfield)
create or replace function update_updated_at_column() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger subscriptions_updated_at before update on subscriptions for each row execute function update_updated_at_column();

-- Rising counters: never read-modify-write; one RPC per counter.
create table shares (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  kind text not null,                          -- card | format | board
  ref_id uuid not null,
  visibility text not null default 'pilot',    -- pilot | public
  created_at timestamptz not null default now()
);
create table remixes (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references shares(id) on delete cascade,
  by_creator text not null references creators(id) on delete cascade,
  into_thread uuid,                            -- attribution back to the source share
  created_at timestamptz not null default now(),
  unique (share_id, by_creator)
);
-- remix velocity = remixes in the last 7 days; computed in the ranking query, never stored on the share row.

alter table subscriptions enable row level security;
alter table credit_ledger enable row level security;
alter table shares enable row level security;
alter table remixes enable row level security;
create policy "own subscription" on subscriptions for select using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own ledger" on credit_ledger for select using (creator_id = (auth.jwt() ->> 'sub'));
create policy "shares visible" on shares for select using (visibility in ('pilot','public') or creator_id = (auth.jwt() ->> 'sub'));
create policy "own shares write" on shares for insert with check (creator_id = (auth.jwt() ->> 'sub'));
create policy "remixes visible" on remixes for select using (true);
create policy "own remix" on remixes for insert with check (by_creator = (auth.jwt() ->> 'sub'));
