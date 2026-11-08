// packages/pipeline/inspiration.ts
// The inspiration demo ("Nothing" look): a library of reference pictures and clips, tagged and embedded so the app
// can search it in plain words and show "more like this". The indexer (scripts/index-inspiration.ts, model calls in
// inspirationTag.ts) fills it; apps/web's /api/inspiration routes read it through searchInspiration() and
// moreLikeThis() below. Schema: inspiration.sql.
//
// It lives on its own TEST Supabase project (INSPIRATION_SUPABASE_*), never the production one: the files are
// third-party reference images and no creator's data is in them. inspirationDb() refuses to run if the two point at
// the same project.
//
//   text_embedding  — voyage-3 (embed.ts) of inspirationText(): what search matches a query against
//   image_embedding — voyage-multimodal-3.5 of the picture (a video's first frame): what "looks alike" uses

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { embed } from './embed'

export const INSPIRATION_BUCKET = 'inspiration-test'
export const PEOPLE = ['none', 'hands', 'person'] as const
export type People = (typeof PEOPLE)[number]
/** Signed URLs last an hour; the app re-fetches results rather than caching URLs past that. */
export const SIGNED_URL_SECONDS = 3600

const PHOTO_EXTS = ['jpg', 'jpeg', 'png', 'webp']
const VIDEO_EXTS = ['mp4', 'mov']

/** The test project's client. Throws if it isn't configured, or if it is the production project. */
export function inspirationDb() {
  const url = process.env.INSPIRATION_SUPABASE_URL
  const key = process.env.INSPIRATION_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('INSPIRATION_SUPABASE_URL / INSPIRATION_SUPABASE_SERVICE_ROLE_KEY are not set')
  const host = (u?: string) => (u ? new URL(u).host : null)
  const prod = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL].map(host)
  if (prod.includes(host(url))) throw new Error('INSPIRATION_SUPABASE_URL points at the production project')
  return createClient(url, key, { auth: { persistSession: false } })
}

export function kindOf(path: string): 'photo' | 'video' | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return PHOTO_EXTS.includes(ext) ? 'photo' : VIDEO_EXTS.includes(ext) ? 'video' : null
}

/** 'nothing/sub/x.jpeg' → 'nothing/sub'. The folder is the "look" a file belongs to. */
export const folderOf = (path: string) => path.split('/').slice(0, -1).join('/')

/** What a row's text_embedding is made from. Keep in one place: the indexer and any re-embed must match. */
export const inspirationText = (t: { caption: string; keywords: string[] }) => `${t.caption}\n${t.keywords.join(', ')}`

/** The files the indexer still has to do: indexable, and not already a fully embedded row. */
export function pendingPaths(listed: string[], done: Set<string>): string[] {
  return listed.filter((p) => kindOf(p) && !done.has(p)).sort()
}

// ─── Upload names ───────────────────────────────────────────────────────────────────────────────────────────────

/** A slug's longest length; longer titles are cut at a hyphen. */
export const SLUG_MAX = 80

/**
 * A file's title as a path segment: accents folded, lowercase, anything else a hyphen, cut at SLUG_MAX on a word.
 * "Introducing, the Shaving Stick - Yanko Design" → "introducing-the-shaving-stick-yanko-design".
 */
export function slugOf(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (s.length <= SLUG_MAX) return s
  const cut = s.slice(0, SLUG_MAX + 1)
  return (cut.includes('-') ? cut.slice(0, cut.lastIndexOf('-')) : cut.slice(0, SLUG_MAX)).replace(/-+$/, '')
}

/**
 * A title that says nothing — a camera roll name (IMG_2421), a saved-image number ("_ (10)"), a hash, or no letters
 * at all once folded (a title in small caps or another script) — is numbered in its folder instead.
 */
export function genericName(slug: string): boolean {
  const letters = slug.replace(/[^a-z]/g, '')
  return (
    letters.length < 3 ||
    /^(img|dsc|dscn|pxl|image|photo|video|vid|mov|screenshot)-?\d+/.test(slug) ||
    /^[0-9a-f]{16,}$/.test(slug)
  )
}

/** Library paths keep one extension per kind: photos are .jpeg (HEIC is converted), videos keep theirs. */
export function libraryExt(original: string): string | null {
  const ext = original.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'heic', 'heif'].includes(ext)) return 'jpeg'
  if (['png', 'webp', 'mp4', 'mov'].includes(ext)) return ext
  return null
}

/**
 * Where each local file goes in `folder`: its slug, or `<folder>-NNN` / `<folder>-clip-NNN` when its name is generic
 * (numbered on from the highest already there), "-2" on a clash. Deterministic for the same files and bucket, so a
 * re-run maps every file to the same path. Files that aren't a photo or video are left out.
 */
export function libraryPaths(files: string[], folder: string, existing: string[]): Map<string, string> {
  const taken = new Set(existing)
  const base = folder.split('/').pop()!
  const highest = (prefix: string) =>
    Math.max(0, ...existing.map((p) => new RegExp(`^${folder}/${prefix}-(\\d+)\\.`).exec(p)?.[1]).filter(Boolean).map(Number))
  const next = { photo: highest(base), video: highest(`${base}-clip`) }
  const out = new Map<string, string>()
  for (const f of [...files].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const ext = libraryExt(f)
    if (!ext) continue
    const kind = kindOf(`x.${ext}`)!
    const stem = slugOf(f.replace(/\.[^.]+$/, ''))
    let name: string
    if (genericName(stem)) name = kind === 'video' ? `${base}-clip-${String(++next.video).padStart(3, '0')}` : `${base}-${String(++next.photo).padStart(3, '0')}`
    else {
      name = stem
      for (let n = 2; taken.has(`${folder}/${name}.${ext}`); n++) name = `${stem}-${n}`
    }
    const path = `${folder}/${name}.${ext}`
    taken.add(path)
    out.set(f, path)
  }
  return out
}

// ─── Search and "more like this" ────────────────────────────────────────────────────────────────────────────────

export interface InspirationItem {
  id: string
  path: string
  kind: 'photo' | 'video'
  folder: string
  width: number | null
  height: number | null
  caption: string
  keywords: string[]
  colours: string[]
  shot: string
  people: People | null
}
export type Signed<T> = T & { url: string }

/** Candidates fetched per search before ranking and mixing; the library is small, so this is most of it. */
const SEARCH_POOL = 96
/** Added to cosine similarity per keyword the query names, up to MAX_KEYWORD_HITS: a nudge, not a re-sort. */
export const KEYWORD_BOOST = 0.02
const MAX_KEYWORD_HITS = 3
/** About one tile in VIDEO_EVERY is a video, when the library has videos to show. */
export const VIDEO_EVERY = 5
/**
 * Two pictures at least this alike (image cosine) are never placed side by side. Calibrated on the first 37: the
 * same photo cropped or with ad text on it scores 0.78–0.79, but so does a different shot from the same campaign, and
 * caption similarity doesn't separate them either. So it reorders rather than removes.
 */
export const NEAR_DUPLICATE = 0.76
const MORE_POOL = 24
/** "More like this": at most one tile in this many from another folder than the item's. */
export const OTHER_FOLDER_EVERY = 4

const stem = (w: string) => w.replace(/(es|s)$/, '')
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stem)

/** How many of an item's keywords the query names (every word of a multi-word keyword must be in the query). */
export function keywordHits(query: string, keywords: string[]): number {
  const q = new Set(words(query))
  return keywords.filter((k) => {
    const kw = words(k)
    return kw.length > 0 && kw.every((w) => q.has(w))
  }).length
}

/** Cosine similarity plus the small keyword boost, best first. */
export function rankByQuery<T extends { keywords: string[]; similarity: number }>(rows: T[], query: string): T[] {
  const score = (r: T) => r.similarity + KEYWORD_BOOST * Math.min(MAX_KEYWORD_HITS, keywordHits(query, r.keywords))
  return rows.map((r) => ({ r, s: score(r) })).sort((a, b) => b.s - a.s).map(({ r }) => r)
}

/**
 * Takes the ranked list in order, but holds videos to about one in VIDEO_EVERY: a video that ranks early is let in
 * early, up to its share; at every VIDEO_EVERY-th tile without its share, the best remaining video is pulled up.
 */
export function mixKinds<T extends { kind: 'photo' | 'video' }>(ranked: T[], limit: number): T[] {
  const photos = ranked.filter((r) => r.kind === 'photo')
  const videos = ranked.filter((r) => r.kind === 'video')
  const out: T[] = []
  let shown = 0
  while (out.length < limit && (photos.length || videos.length)) {
    const n = out.length + 1
    const share = Math.ceil(n / VIDEO_EVERY)
    const due = n % VIDEO_EVERY === 0 && shown < n / VIDEO_EVERY
    const best = ranked.find((r) => photos.includes(r) || videos.includes(r))!
    const wantVideo = due || (best.kind === 'video' && shown < share)
    const next = (wantVideo ? videos.shift() : photos.shift()) ?? photos.shift() ?? videos.shift()!
    if (next.kind === 'video') shown++
    out.push(next)
  }
  return out
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / Math.sqrt(na * nb)
}

export interface MoreCandidate {
  id: string
  folder?: string
  source: 'alike' | 'look'
  score: number
  image_embedding: number[]
}

/**
 * "More like this": alternate the pictures that look alike (image neighbours) with ones from the same folder (same
 * look, closest by tags), never the item itself, and never two near-duplicates side by side — including the first
 * tile against the item. A candidate that can't be placed next to the last tile waits for a later slot.
 *
 * It stays mostly in the item's folder (a library category: "nothing", "box"): at most one tile in OTHER_FOLDER_EVERY
 * comes from another folder, until the item's own folder runs out.
 */
export function pickMore<T extends MoreCandidate>(
  item: { id: string; image_embedding: number[]; folder?: string },
  candidates: T[],
  limit: number
): T[] {
  const bySource = (s: MoreCandidate['source']) =>
    candidates.filter((c) => c.source === s && c.id !== item.id).sort((a, b) => b.score - a.score)
  const alike = bySource('alike'), look = bySource('look')
  const merged: T[] = []
  for (let i = 0; i < Math.max(alike.length, look.length); i++) {
    for (const c of [alike[i], look[i]]) if (c && !merged.some((m) => m.id === c.id)) merged.push(c)
  }

  const out: T[] = []
  let prev = item.image_embedding
  const away = (c: T) => item.folder !== undefined && c.folder !== undefined && c.folder !== item.folder
  while (out.length < limit) {
    const awayOk = out.filter(away).length < Math.floor((out.length + 1) / OTHER_FOLDER_EVERY)
    const fits = (c: T) => cosine(prev, c.image_embedding) < NEAR_DUPLICATE
    let i = merged.findIndex((c) => fits(c) && (awayOk || !away(c)))
    // Its own folder has nothing left that fits: let the others fill.
    if (i < 0) i = merged.findIndex(fits)
    if (i < 0) break
    const [next] = merged.splice(i, 1)
    out.push(next)
    prev = next.image_embedding
  }
  return out
}

const ITEM_COLUMNS = 'id, path, kind, folder, width, height, caption, keywords, colours, shot, people'

async function sign<T extends { path: string }>(db: SupabaseClient, rows: T[]): Promise<Signed<T>[]> {
  if (rows.length === 0) return []
  const { data, error } = await db.storage.from(INSPIRATION_BUCKET).createSignedUrls(rows.map((r) => r.path), SIGNED_URL_SECONDS)
  if (error) throw new Error(`sign: ${error.message}`)
  const urls = new Map(data.map((d) => [d.path, d.signedUrl]))
  return rows.filter((r) => urls.get(r.path)).map((r) => ({ ...r, url: urls.get(r.path)! }))
}

const vec = (v: unknown): number[] => (typeof v === 'string' ? JSON.parse(v) : (v as number[]))

/** GET /api/inspiration/search. An empty query shows the newest, mixed the same way. */
export async function searchInspiration(
  db: SupabaseClient,
  { q, limit, people }: { q: string; limit: number; people?: People }
): Promise<Signed<InspirationItem>[]> {
  let rows: (InspirationItem & { similarity: number })[]
  if (q.trim()) {
    const [query] = await embed([q.trim()], 'query')
    const { data, error } = await db.rpc('inspiration_search', {
      query_embedding: JSON.stringify(query),
      people_filter: people ?? null,
      match_count: SEARCH_POOL,
    })
    if (error) throw new Error(`search: ${error.message}`)
    rows = rankByQuery(data as (InspirationItem & { similarity: number })[], q)
  } else {
    let query = db.from('inspiration_items').select(ITEM_COLUMNS).order('created_at', { ascending: false }).limit(SEARCH_POOL)
    if (people) query = query.eq('people', people)
    const { data, error } = await query
    if (error) throw new Error(`newest: ${error.message}`)
    rows = (data as InspirationItem[]).map((r) => ({ ...r, similarity: 0 }))
  }
  return sign(db, mixKinds(rows, limit).map(({ similarity: _, ...r }) => r))
}

/** GET /api/inspiration/{id}/more. Null if there is no such item. */
export async function moreLikeThis(db: SupabaseClient, id: string, limit: number): Promise<Signed<InspirationItem>[] | null> {
  const { data: item, error } = await db.from('inspiration_items').select('id, folder, image_embedding').eq('id', id).maybeSingle()
  if (error) throw new Error(`item: ${error.message}`)
  if (!item) return null
  const { data, error: rpcError } = await db.rpc('inspiration_more', { item_id: id, pool: MORE_POOL })
  if (rpcError) throw new Error(`more: ${rpcError.message}`)
  const candidates = (data as (InspirationItem & MoreCandidate)[]).map((c) => ({ ...c, image_embedding: vec(c.image_embedding) }))
  const picked = pickMore({ id, folder: item.folder as string, image_embedding: vec(item.image_embedding) }, candidates, limit)
  return sign(db, picked.map(({ source: _s, score: _sc, image_embedding: _e, ...r }) => r))
}
