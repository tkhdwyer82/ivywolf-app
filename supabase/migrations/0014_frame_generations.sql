-- One row per frame the pipeline serves (packages/pipeline/frames.ts): the cost log, and the cache that lets a to-do's
-- frame be generated once per creator — "milk" is looked up by (style pack, normalised brief) before anything is drawn.
--
-- No brief text is kept here: brief_hash is sha256 of the normalised brief, so deleting a recording (0007) leaves
-- nothing of what she said behind. The row survives its card/action (set null) so the cost history stays whole.
-- Service role only: RLS on, no policies.

create table frame_generations (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null references creators(id) on delete cascade,
  style_pack_id uuid references style_packs(id) on delete set null,
  card_id uuid references cards(id) on delete set null,
  action_id uuid references actions(id) on delete set null,
  kind text not null check (kind in ('card', 'action')),
  brief_hash text not null,
  model text not null,                         -- e.g. 'fal-ai/flux/schnell'
  status text not null check (status in ('done', 'failed')),
  cached boolean not null default false,       -- served from an earlier generation: no model call, no cost
  frame_url text,
  width int,
  height int,
  cost_usd numeric(10, 5) not null default 0,
  error text,
  created_at timestamptz not null default now()
);
alter table frame_generations enable row level security;

create index frame_generations_creator_idx on frame_generations (creator_id, created_at desc);
-- The to-do cache lookup.
create index frame_generations_action_cache_idx on frame_generations (style_pack_id, brief_hash)
  where kind = 'action' and status = 'done' and not cached;
