// packages/pipeline/threading.ts
// Thread identity (CA2), as pure functions. The pipeline (graph.ts) and the eval both call these, so the eval
// scores exactly the logic that ships. Thresholds are tuned against the eval set — change them here.
//
//   attach  — hybrid (docs/rnd/ca2-experiment-1.md showed card-text cosine alone can't separate same-thread from
//             unrelated ideas):
//               1. by name: the classifier's candidate_threads for the card fuzzy-match an existing thread title
//                  (titleMatch ≥ NAME_MATCH_MIN) → attach to the best match;
//               2. by embedding: cosine(card, thread centroid) ≥ THREAD_ATTACH_MIN → attach to the nearest;
//               3. otherwise start a new thread, named from the card's first candidate_thread when it gave one,
//                  else from the card title — cards are named by content, threads by purpose.
//   propose — two cards in different threads with cosine ≥ MERGE_PROPOSE_MIN get a merge_suggestions row.
//             Propose, never merge (CLAUDE.md: never silently dedupe).

export const THREAD_ATTACH_MIN = 0.8
export const MERGE_PROPOSE_MIN = 0.85
/** Fuzzy title match for step 1. New with experiment 2; not yet tuned against negative memos. */
export const NAME_MATCH_MIN = 0.6

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'to', 'in', 'on', 'my', 'our', 'with'])
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))

/**
 * 0–1 match between a candidate thread name and a thread title: 1 when one's content words all appear in the other
 * ("Launch video" vs "Ivy launch video"), else Jaccard overlap of content words.
 */
export function titleMatch(candidate: string, title: string): number {
  const a = new Set(words(candidate))
  const b = new Set(words(title))
  if (a.size === 0 || b.size === 0) return 0
  const shared = [...a].filter((w) => b.has(w)).length
  if (shared === a.size || shared === b.size) return 1
  return shared / (a.size + b.size - shared)
}

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
  via: 'name' | 'embedding' | 'new'
  /** Best candidate-name match found (null when the card named no candidate threads or there were no threads). */
  nameMatch: { candidate: string; threadId: string; title: string; score: number } | null
  /** Cosine to the nearest existing thread's centroid (null when the creator had no threads). */
  nearest: { threadId: string; title: string; similarity: number } | null
}

/**
 * Assign cards to threads one at a time, in order, mutating `threads` (new threads are appended, centroids move
 * as cards join). `newThreadId` mints ids for created threads.
 */
export function assignCards(
  cards: { id: string; title: string; embedding: Vec; candidateThreads: string[] }[],
  threads: ThreadState[],
  newThreadId: () => string
): Assignment[] {
  const out: Assignment[] = []
  for (const card of cards) {
    let nameMatch: Assignment['nameMatch'] = null
    for (const candidate of card.candidateThreads) {
      for (const t of threads) {
        const score = titleMatch(candidate, t.title)
        if (!nameMatch || score > nameMatch.score) nameMatch = { candidate, threadId: t.id, title: t.title, score }
      }
    }
    let nearest: Assignment['nearest'] = null
    for (const t of threads) {
      const similarity = cosine(card.embedding, mean(t.cards.map((c) => c.embedding)))
      if (!nearest || similarity > nearest.similarity) nearest = { threadId: t.id, title: t.title, similarity }
    }

    const attachTo = (threadId: string, via: 'name' | 'embedding') => {
      threads.find((t) => t.id === threadId)!.cards.push({ id: card.id, embedding: card.embedding })
      out.push({ cardId: card.id, threadId, created: false, via, nameMatch, nearest })
    }
    if (nameMatch && nameMatch.score >= NAME_MATCH_MIN) attachTo(nameMatch.threadId, 'name')
    else if (nearest && nearest.similarity >= THREAD_ATTACH_MIN) attachTo(nearest.threadId, 'embedding')
    else {
      const id = newThreadId()
      threads.push({ id, title: threadName(card), cards: [{ id: card.id, embedding: card.embedding }] })
      out.push({ cardId: card.id, threadId: id, created: true, via: 'new', nameMatch, nearest })
    }
  }
  return out
}

/** A new thread's name: the card's first candidate thread, else the card title. */
export function threadName(card: { title: string; candidateThreads: string[] }): string {
  const named = card.candidateThreads.map((c) => c.trim()).find((c) => c.length > 0)
  return named ?? card.title
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
