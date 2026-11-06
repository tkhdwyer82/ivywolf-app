// Inspiration demo: what the indexer picks up, the limits it holds on the tags, and how search and "more like this"
// rank, mix and space their results. The live checks (signed URLs expiring, the RPCs) are
// scripts/test-inspiration-api.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NEAR_DUPLICATE, VIDEO_EVERY, cosine, folderOf, inspirationDb, keywordHits, kindOf, mixKinds, pendingPaths, pickMore,
  rankByQuery, type MoreCandidate,
} from '../inspiration'
import { enforceTags } from '../inspirationTag'

test('photos and videos are indexable; anything else is not', () => {
  assert.equal(kindOf('nothing/nothing-ear.jpeg'), 'photo')
  assert.equal(kindOf('nothing/clip.MOV'), 'video')
  assert.equal(kindOf('nothing/notes.txt'), null)
  assert.equal(folderOf('nothing/sub/x.jpeg'), 'nothing/sub')
})

test('the indexer is idempotent: an indexed path is never done again', () => {
  const listed = ['nothing/b.jpeg', 'nothing/a.mp4', 'nothing/readme.md']
  assert.deepEqual(pendingPaths(listed, new Set()), ['nothing/a.mp4', 'nothing/b.jpeg'])
  assert.deepEqual(pendingPaths(listed, new Set(['nothing/a.mp4'])), ['nothing/b.jpeg'])
  assert.deepEqual(pendingPaths(listed, new Set(['nothing/a.mp4', 'nothing/b.jpeg'])), [])
})

test('tags are held to the prompt: ≤20-word caption, ≤12 keywords, 3 colours, lowercased, no duplicates', () => {
  const t = enforceTags({
    caption: Array.from({ length: 25 }, (_, i) => `w${i}`).join(' '),
    keywords: ['A', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'],
    colours: ['Black', 'white', 'red', 'grey'],
    shot: 'product',
    people: 'hands',
  })
  assert.equal(t.caption.split(' ').length, 20)
  assert.equal(t.keywords.length, 12)
  assert.equal(t.keywords[0], 'a')
  assert.deepEqual(t.colours, ['black', 'white', 'red'])
  assert.equal(t.people, 'hands')
})

test('too few keywords is an error, not a thin row', () => {
  assert.throws(() => enforceTags({ caption: 'x', keywords: ['a', 'b'], colours: ['r', 'g', 'b'], shot: 'detail', people: 'none' }))
})

test('the inspiration client refuses the production project', () => {
  const saved = { ...process.env }
  process.env.INSPIRATION_SUPABASE_URL = 'https://prod.supabase.co'
  process.env.INSPIRATION_SUPABASE_SERVICE_ROLE_KEY = 'k'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod.supabase.co'
  assert.throws(() => inspirationDb(), /production/)
  process.env = saved
})

// ─── search ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('a keyword the query names counts; multi-word keywords need every word; plurals match', () => {
  assert.equal(keywordHits('transparent earbuds dot matrix', ['earbud', 'dot matrix', 'matrix code', 'transparent']), 3)
  assert.equal(keywordHits('red phone', ['dot matrix', 'smartphone']), 0)
})

test('the keyword boost nudges near-ties but does not overturn a clear gap', () => {
  const rows = [
    { id: 'a', similarity: 0.50, keywords: ['phone'] },
    { id: 'b', similarity: 0.49, keywords: ['earbud', 'transparent'] },
    { id: 'c', similarity: 0.30, keywords: ['earbud', 'transparent', 'case'] },
  ]
  assert.deepEqual(rankByQuery(rows, 'transparent earbuds case').map((r) => r.id), ['b', 'a', 'c'])
})

const fixture = (photos: number, videos: number) => {
  // Interleaved by "relevance" so videos are spread through the ranking, some near the top.
  const out: { id: string; kind: 'photo' | 'video' }[] = []
  let p = 0, v = 0
  while (p < photos || v < videos) {
    if (v < videos && (out.length % 3 === 1 || p >= photos)) out.push({ id: `v${v++}`, kind: 'video' })
    else out.push({ id: `p${p++}`, kind: 'photo' })
  }
  return out
}

test('search returns at most 24, mixed: about one video in five, at most one in each five', () => {
  const mixed = mixKinds(fixture(40, 15), 24)
  assert.equal(mixed.length, 24)
  const videos = mixed.filter((m) => m.kind === 'video').length
  assert.ok(videos >= 24 / VIDEO_EVERY - 1 && videos <= Math.ceil(24 / VIDEO_EVERY), `${videos} videos in 24`)
  for (let i = 0; i < 24; i += VIDEO_EVERY) {
    assert.ok(mixed.slice(i, i + VIDEO_EVERY).filter((m) => m.kind === 'video').length <= 1, `window at ${i}`)
  }
})

test('a video that ranks first is shown first; one that ranks low is still pulled into its slot', () => {
  const top = mixKinds([{ id: 'v0', kind: 'video' as const }, ...fixture(10, 0)], 5)
  assert.equal(top[0].id, 'v0')
  const low = mixKinds([...fixture(10, 0), { id: 'v9', kind: 'video' as const }], 5)
  assert.equal(low[4].id, 'v9')
})

test('with no videos, or too few results, search still fills what it can', () => {
  assert.equal(mixKinds(fixture(30, 0), 24).length, 24)
  assert.equal(mixKinds(fixture(3, 2), 24).length, 5)
  assert.equal(mixKinds([], 24).length, 0)
})

// ─── more like this ─────────────────────────────────────────────────────────────────────────────────────────────

/** A unit vector at `deg` degrees in a plane: cosine between two is cos(Δdeg). */
const at = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)]
const cand = (id: string, source: MoreCandidate['source'], score: number, deg: number): MoreCandidate => ({
  id, source, score, image_embedding: at(deg),
})

test('more like this never includes the item itself, and alternates looks-alike with same-look', () => {
  const item = { id: 'me', image_embedding: at(0) }
  const picked = pickMore(item, [
    cand('me', 'alike', 1, 0),
    cand('a1', 'alike', 0.9, 60), cand('a2', 'alike', 0.8, 120),
    cand('l1', 'look', 0.7, 180), cand('l2', 'look', 0.6, 240),
  ], 6)
  assert.ok(!picked.some((p) => p.id === 'me'))
  assert.deepEqual(picked.map((p) => p.id), ['a1', 'l1', 'a2', 'l2'])
})

test('no two near-duplicates side by side, and the first tile is not a near-copy of the item', () => {
  assert.ok(cosine(at(0), at(10)) >= NEAR_DUPLICATE && cosine(at(0), at(60)) < NEAR_DUPLICATE)
  const item = { id: 'me', image_embedding: at(0) }
  const picked = pickMore(item, [
    cand('copy', 'alike', 0.99, 5), // a repost of the item
    cand('a1', 'alike', 0.9, 90), cand('a1-crop', 'alike', 0.89, 95), // a1 and its crop
    cand('l1', 'look', 0.7, 200), cand('l2', 'look', 0.6, 280),
  ], 6)
  assert.notEqual(picked[0].id, 'copy')
  for (let i = 1; i < picked.length; i++) {
    assert.ok(cosine(picked[i - 1].image_embedding, picked[i].image_embedding) < NEAR_DUPLICATE, `${picked[i - 1].id} → ${picked[i].id}`)
  }
  assert.ok(picked.some((p) => p.id === 'a1-crop'), 'reordered, not dropped')
})

test('a candidate in both lists appears once; the limit holds', () => {
  const item = { id: 'me', image_embedding: at(0) }
  const many = Array.from({ length: 12 }, (_, i) => cand(`x${i}`, i % 2 ? 'look' : 'alike', 1 - i / 20, 40 + i * 25))
  const picked = pickMore(item, [...many, cand('x0', 'look', 0.99, 40)], 6)
  assert.equal(picked.length, 6)
  assert.equal(new Set(picked.map((p) => p.id)).size, 6)
})
