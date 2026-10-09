-- 0035 — the generation gateway (Job H.0a, packages/pipeline/generate).
--
-- generation_runs: one row per generate() call — the model and the exact version, which route ran it, every route's
-- estimate, the chosen estimate, the provider's request id, the actual cost, latency (submit → terminal) and where
-- the output now lives in our storage (frames/<creator>/generations/<run>.<ext>; the provider's URL lasts ~7 days).
-- credit_events: one row per run — what the provider charged us for it. Distinct from credit_ledger (0002), which is
-- the creator's own credits; nothing here spends or grants those yet.
--
-- Writes are service role only (the gateway runs server-side). She can read her own rows.

create table generation_runs (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  card_id uuid references cards(id) on delete set null,
  model text not null,                       -- registry key, e.g. 'kling-3.0-std-t2v'
  model_version text not null,               -- every candidate route served this version
  kind text not null check (kind in ('image', 'video')),
  route text not null check (route in ('higgsfield', 'fal', 'direct')),
  endpoint text not null,
  brief text not null,                       -- after the name guard (redact.ts)
  refs jsonb not null default '[]',
  request_body jsonb not null,
  estimates jsonb not null default '[]',     -- [{ route, endpoint, usd, credits, error }]
  estimate_usd numeric(10, 4) not null,
  estimate_credits numeric(12, 3),
  status text not null check (status in ('submitting', 'queued', 'completed', 'failed', 'nsfw', 'canceled', 'copy_failed')),
  request_id text,
  error text,
  submitted_at timestamptz,
  completed_at timestamptz,
  latency_ms int,
  actual_usd numeric(10, 4),
  actual_credits numeric(12, 3),
  actual_source text,                        -- 'estimate_on_completion' until a route reports its own charge
  provider_output_url text,
  output_path text,
  output_url text,
  output_bytes bigint,
  content_type text,
  created_at timestamptz not null default now()
);
create index on generation_runs (creator_id, created_at desc);
create index on generation_runs (card_id);
create unique index on generation_runs (route, request_id) where request_id is not null;

create table credit_events (
  id bigint generated always as identity primary key,
  creator_id text not null references creators(id) on delete cascade,
  run_id uuid not null unique references generation_runs(id) on delete cascade,
  route text not null,
  model text not null,
  outcome text not null,                     -- completed | failed | nsfw | canceled
  estimate_usd numeric(10, 4) not null,
  usd numeric(10, 4) not null,               -- charged: 0 when failed / nsfw / canceled (not billed)
  provider_credits numeric(12, 3),
  created_at timestamptz not null default now()
);
create index on credit_events (creator_id, created_at desc);

alter table generation_runs enable row level security;
alter table credit_events enable row level security;
create policy "own generation runs" on generation_runs for select using (creator_id = (auth.jwt() ->> 'sub'));
create policy "own credit events" on credit_events for select using (creator_id = (auth.jwt() ->> 'sub'));
