-- The Muse connector's own tables (Job F §2 rules 6 and 7).
--
-- agent_calls — one row per MCP tool call, kept apart from everything the app logs (source 'muse'), so we can see
-- what creators ask their Muse: the free "questions people ask" study (§7 — the top five become Home's earned
-- in-feed blocks). What's kept is the shape of the ask, not her words: the tool, its non-text parameters (since,
-- limit, status, min_returns…) and how it went. A search query or a captured idea is never copied here — the idea
-- already lives on its recording, and deleting that recording (0007) must leave nothing of it behind.
-- Service role only: RLS on, no policies.

create table agent_calls (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  key_id uuid references creator_api_keys(id) on delete set null,
  source text not null default 'muse',           -- every key today is made in Connect your Muse
  tool text not null,
  params jsonb not null default '{}',            -- non-text arguments only (apps/web/lib/mcp/tools.ts)
  ok boolean,                                    -- null while the call runs
  error text,                                    -- the sentence she was shown, or 'internal'
  latency_ms int,
  created_at timestamptz not null default now()
);
create index agent_calls_creator_idx on agent_calls (creator_id, created_at desc);
create index agent_calls_tool_idx on agent_calls (tool, created_at desc);

alter table agent_calls enable row level security;
