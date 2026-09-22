// packages/pipeline/threading.ts
// Thread identity (CA2), as pure functions over embeddings. The pipeline (graph.ts) and the eval both call these,
// so the eval scores exactly the logic that ships. Thresholds are tuned against the eval set — change them here.
//
//   attach  — a new card joins its nearest thread when cosine(card, thread centroid) ≥ THREAD_ATTACH_MIN;
//             otherwise it starts a new thread titled from the card.
//   propose — two cards in different threads with cosine ≥ MERGE_PROPOSE_MIN get a merge_suggestions row.
//             Propose, never merge (CLAUDE.md: never silently dedupe).

export const THREAD_ATTACH_MIN = 0.8
export const MERGE_PROPOSE_MIN = 0.85

export type Vec = number[]

export function cosine(a: Vec, b: Vec): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
}

/** A thread's embedding is the mean of its cards' embeddings. */
export function mean(vectors: Vec[]): Vec {
  const out = new Array<number>(vectors[0].length).fill(0)
  for (const v of vectors) for (let i = 0; i < v.length; i++) out[i] += v[i] / vectors.length
  return out
}

export interface ThreadState {
  id: string
  title: string
  cards: { id: string; embedding: Vec }[]
}

export interface Assignment {
  cardId: string
  threadId: string
  created: boolean
  /** Cosine to the nearest existing thread's centroid (null when the creator had no threads). */
  nearest: { threadId: string; title: string; similarity: number } | null
}

/**
 * Assign cards to threads one at a time, in order, mutating `threads` (new threads are appended, centroids move
 * as cards join). `newThreadId` mints ids for created threads.
 */
export function assignCards(
  cards: { id: string; title: string; embedding: Vec }[],
  threads: ThreadState[],
  newThreadId: () => string
): Assignment[] {
  const out: Assignment[] = []
  for (const card of cards) {
    let nearest: Assignment['nearest'] = null
    for (const t of threads) {
      const similarity = cosine(card.embedding, mean(t.cards.map((c) => c.embedding)))
      if (!nearest || similarity > nearest.similarity) nearest = { threadId: t.id, title: t.title, similarity }
    }
    if (nearest && nearest.similarity >= THREAD_ATTACH_MIN) {
      threads.find((t) => t.id === nearest!.threadId)!.cards.push({ id: card.id, embedding: card.embedding })
      out.push({ cardId: card.id, threadId: nearest.threadId, created: false, nearest })
    } else {
      const id = newThreadId()
      threads.push({ id, title: card.title, cards: [{ id: card.id, embedding: card.embedding }] })
      out.push({ cardId: card.id, threadId: id, created: true, nearest })
    }
  }
  return out
}

export interface MergeProposal {
  aCardId: string
  bCardId: string
  similarity: number
}

/** Pairs of cards in different threads, at least one of them new, with cosine ≥ MERGE_PROPOSE_MIN. */
export function proposeMerges(newCardIds: Set<string>, threads: ThreadState[]): MergeProposal[] {
  const all = threads.flatMap((t) => t.cards.map((c) => ({ ...c, threadId: t.id })))
  const out: MergeProposal[] = []
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]
      const b = all[j]
      if (a.threadId === b.threadId) continue
      if (!newCardIds.has(a.id) && !newCardIds.has(b.id)) continue // old pairs were judged when they were new
      const similarity = cosine(a.embedding, b.embedding)
      if (similarity >= MERGE_PROPOSE_MIN) out.push({ aCardId: a.id, bCardId: b.id, similarity })
    }
  }
  return out
}
