-- Tables required by the code lifted from gamesfield-app (docs/lift-list.md).
-- Added here because of the standing rule: "Every table has a migration from day one.
-- `supabase db reset` must produce a working database." Gamesfield's api_keys table had no migration
-- at all — it was created by hand in the dashboard, which is exactly what this repo is avoiding.

-- ─────────────────────────────────────────────────────────────
-- api_keys — bearer tokens for the MCP server (rule 6: any tool out)
-- Only the SHA-256 hash is stored; the raw `iv_...` value is shown once at creation.
-- Revoked, never deleted, so the audit trail survives.
-- ─────────────────────────────────────────────────────────────
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  key_hash text not null unique,
  label text not null default 'My API Key',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index on api_keys (creator_id, created_at desc);

alter table api_keys enable row level security;
create policy "own api keys" on api_keys for all using (creator_id = (auth.jwt() ->> 'sub'));

-- ─────────────────────────────────────────────────────────────
-- stripe_events — webhook idempotency
-- Gamesfield's webhook set credits_remaining to a fixed number on every delivery, so a Stripe retry
-- reset the balance and erased any spend in between. Credits here are append-only credit_ledger rows,
-- which makes a duplicate delivery a duplicate *grant* unless the event id is claimed first.
-- The webhook inserts before handling and deletes the row if handling fails, so retries still work.
-- No RLS policy: service role only, never read by a creator.
-- ─────────────────────────────────────────────────────────────
create table stripe_events (
  id text primary key,                         -- Stripe event id (evt_...)
  type text not null,
  received_at timestamptz not null default now()
);

alter table stripe_events enable row level security;
