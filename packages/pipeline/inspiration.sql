-- packages/pipeline/inspiration.sql
-- Inspiration demo schema — the TEST Supabase project only (khxxnmrttasuwstkurcn, INSPIRATION_SUPABASE_URL).
-- Deliberately not in supabase/migrations: that folder is pushed to production. Applied through the Supabase MCP as
-- the migrations named below, in order; every statement is safe to re-run.

-- ─── inspiration_items (applied 2026-11-06) ─────────────────────────────────────────────────────────────────────
create extension if not exists vector with schema extensions;

create table if not exists public.inspiration_items (
  id              uuid primary key default gen_random_uuid(),
  path            text not null unique,
  kind            text not null check (kind in ('photo','video')),
  folder          text not null,
  width           int,
  height          int,
  caption         text,
  keywords        text[] not null default '{}',
  colours         text[] not null default '{}',
  shot            text,
  text_embedding  extensions.vector(1024),           -- voyage-3 of caption + keywords
  image_embedding extensions.vector(1024),           -- voyage-multimodal-3.5 (inspiration_items_image_embedding_1024)
  created_at      timestamptz not null default now()
);

-- Service role only: no policies, so anon/authenticated get nothing; the API signs URLs server-side.
alter table public.inspiration_items enable row level security;

create index if not exists inspiration_items_text_embedding_hnsw
  on public.inspiration_items using hnsw (text_embedding extensions.vector_cosine_ops);
create index if not exists inspiration_items_image_embedding_hnsw
  on public.inspiration_items using hnsw (image_embedding extensions.vector_cosine_ops);
create index if not exists inspiration_items_folder_idx on public.inspiration_items (folder);
create index if not exists inspiration_items_keywords_gin on public.inspiration_items using gin (keywords);

-- ─── inspiration_people (applied 2026-11-06) ─────────── ──────────────────────────────────────────────────────────────────────────────
alter table public.inspiration_items
  add column if not exists people text check (people in ('none','hands','person'));
create index if not exists inspiration_items_people_idx on public.inspiration_items (people);

-- ─── inspiration_search_functions (applied 2026-11-06) ──────────────────────────────────────────────────────────
-- Search: nearest by text_embedding, optionally only one `people` value. The keyword boost and the video mix are
-- applied in TypeScript (inspiration.ts) so they are unit-tested. iterative_scan keeps the HNSW scan going past
-- rows the filter drops, so a filtered search still fills match_count (pgvector ≥ 0.8; this project has 0.8.2).
-- It is set per call with set_config(…, true) — Supabase refuses it as a function-level SET ("permission denied to
-- set parameter") — which is why these are plpgsql and volatile.
create or replace function public.inspiration_search(
  query_embedding extensions.vector(1024),
  people_filter text default null,
  match_count int default 96
)
returns table (
  id uuid, path text, kind text, folder text, width int, height int, caption text,
  keywords text[], colours text[], shot text, people text, similarity float
)
language plpgsql volatile
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  return query
  select i.id, i.path, i.kind, i.folder, i.width, i.height, i.caption, i.keywords, i.colours, i.shot, i.people,
         (1 - (i.text_embedding <=> query_embedding))::float as similarity
  from public.inspiration_items i
  where i.text_embedding is not null
    and (people_filter is null or i.people = people_filter)
  order by i.text_embedding <=> query_embedding
  limit least(match_count, 200);
end
$$;

-- More like this: two candidate lists for one item, never including it — 'alike' (nearest image_embedding) and
-- 'look' (same folder, nearest text_embedding). Each carries its image_embedding so inspiration.ts can keep
-- near-duplicates apart when it interleaves them.
create or replace function public.inspiration_more(item_id uuid, pool int default 24)
returns table (
  id uuid, path text, kind text, folder text, width int, height int, caption text,
  keywords text[], colours text[], shot text, people text, source text, score float, image_embedding text
)
language plpgsql volatile
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
  return query
  with me as (select m.folder, m.text_embedding, m.image_embedding from public.inspiration_items m where m.id = item_id),
  alike as (
    select i.id, i.path, i.kind, i.folder, i.width, i.height, i.caption, i.keywords, i.colours, i.shot, i.people,
           'alike'::text as source, (1 - (i.image_embedding <=> (select me.image_embedding from me)))::float as score,
           i.image_embedding
    from public.inspiration_items i
    where i.id <> item_id and i.image_embedding is not null
    order by i.image_embedding <=> (select me.image_embedding from me)
    limit least(pool, 100)
  ),
  look as (
    select i.id, i.path, i.kind, i.folder, i.width, i.height, i.caption, i.keywords, i.colours, i.shot, i.people,
           'look'::text as source, (1 - (i.text_embedding <=> (select me.text_embedding from me)))::float as score,
           i.image_embedding
    from public.inspiration_items i
    where i.id <> item_id and i.folder = (select me.folder from me) and i.image_embedding is not null
    order by i.text_embedding <=> (select me.text_embedding from me)
    limit least(pool, 100)
  )
  select c.id, c.path, c.kind, c.folder, c.width, c.height, c.caption, c.keywords, c.colours, c.shot, c.people,
         c.source, c.score, c.image_embedding::text
  from (select * from alike union all select * from look) c;
end
$$;

-- Only the API (service role) calls these.
revoke execute on function public.inspiration_search(extensions.vector, text, int) from public, anon, authenticated;
revoke execute on function public.inspiration_more(uuid, int) from public, anon, authenticated;
grant execute on function public.inspiration_search(extensions.vector, text, int) to service_role;
grant execute on function public.inspiration_more(uuid, int) to service_role;

-- ─── inspiration_people_not_null (applied 2026-11-06, after the backfill) ───────────────────────────────────────
alter table public.inspiration_items alter column people set not null;
