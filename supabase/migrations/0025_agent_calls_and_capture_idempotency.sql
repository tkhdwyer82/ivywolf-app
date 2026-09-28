-- The Muse connector's own tables (Job F §2 rules 6 and 7).
--
--   agent_calls          every tool call, logged apart (rule 7) — and what the rate limits count (rule 6)
--   start_agent_call()   rate limit + open the log row, atomically per creator
--   capture_idempotency  capture_idea's idempotency keys: an agent's retry never files an idea twice
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
  error text,                                    -- the sentence she was shown, 'internal', or 'rate_limited'
  latency_ms int,
  created_at timestamptz not null default now()
);
create index agent_calls_creator_idx on agent_calls (creator_id, created_at desc);
create index agent_calls_tool_idx on agent_calls (tool, created_at desc);

alter table agent_calls enable row level security;

-- ── Rate limits: 60 calls a minute per creator, of which 10 may be captures ─────────────────────────────────────
-- In Postgres rather than a separate store (Upstash): the count is over agent_calls, which every call writes anyway.
-- An advisory lock per creator makes count-then-insert atomic, so a burst of parallel calls can't all see room.
-- A refused call is logged (error 'rate_limited') but doesn't count, so an agent retrying in a loop can't keep her
-- locked out past the minute. Called by apps/web/lib/mcp/log.ts with the service role.

create function start_agent_call(p_creator text, p_key uuid, p_tool text, p_params jsonb)
returns table (call_id uuid, allowed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  total int;
  captures int;
  ok_to_run boolean;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('agent_calls:' || p_creator));
  select count(*), count(*) filter (where tool = 'capture_idea')
    into total, captures
    from agent_calls
   where creator_id = p_creator
     and created_at > now() - interval '1 minute'
     and error is distinct from 'rate_limited';
  ok_to_run := total < 60 and (p_tool <> 'capture_idea' or captures < 10);
  insert into agent_calls (creator_id, key_id, tool, params, ok, error)
  values (p_creator, p_key, p_tool, coalesce(p_params, '{}'),
          case when ok_to_run then null else false end,
          case when ok_to_run then null else 'rate_limited' end)
  returning id into new_id;
  return query select new_id, ok_to_run;
end;
$$;
revoke execute on function start_agent_call(text, uuid, text, jsonb) from public, anon, authenticated;

-- ── capture_idempotency ─────────────────────────────────────────────────────────────────────────────────────────
-- capture_idea claims (creator, key) before it writes the recording, then fills in recording_id. A retry with the
-- same key gets the first recording back; the same key with different words is refused (text_hash, sha256 — the
-- words themselves stay on the recording only). The row goes with its recording, so deleting the idea leaves no key
-- behind. Service role only: RLS on, no policies.

create table capture_idempotency (
  creator_id text not null references creators(id) on delete cascade,
  key text not null check (length(key) between 8 and 128),
  text_hash text not null,
  recording_id uuid references recordings(id) on delete cascade,  -- null only while the capture is being written
  created_at timestamptz not null default now(),
  primary key (creator_id, key)
);

alter table capture_idempotency enable row level security;
