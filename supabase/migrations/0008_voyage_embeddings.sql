-- Thread identity (CA2). Embeddings come from Voyage voyage-3: 1024 dimensions, unit length.
-- 0001 reserved vector(1536); no embeddings have been written yet, so the columns are resized in place.

drop index if exists cards_embedding_idx;

alter table cards alter column embedding type vector(1024);
alter table threads alter column embedding type vector(1024);

-- HNSW rather than 0001's ivfflat: it needs no training data, so it is correct from the first row.
create index cards_embedding_idx on cards using hnsw (embedding vector_cosine_ops);

-- A merge is proposed once per pair, whichever card was seen first.
create unique index merge_suggestions_pair_idx
  on merge_suggestions (least(a_card_id, b_card_id), greatest(a_card_id, b_card_id));
