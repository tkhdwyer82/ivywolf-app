// packages/pipeline/imports.ts
// Add to ideas (P2): an image or video she added, plus one spoken line for what it's for, becomes a card
// (source 'import') whose frame is her own picture — never a generated one. The app uploads the original to the
// private `imports` bucket and a poster to frames/<creator>/imports/ (0018), and records the line with
// meta.import = { kind, original_path, poster_path }.
//
// The line is optional and often short ("for the restock reel"), so an import skips the too-short gate, and with no
// speech at all the card is still made. When the line yields idea cards, the first carries the import; otherwise a
// card is made for it, titled from what she said.

import { createClient } from '@supabase/supabase-js'
import type { NewCard } from './graph'

export interface Import {
  kind: 'image' | 'video'
  originalPath: string // in `imports`
  posterPath: string // in `frames`
}

const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

/** meta.import, if it's well-formed and every path is in the creator's own folder. */
export function parseImport(meta: unknown, creatorId: string): Import | null {
  const i = (meta as { import?: Record<string, unknown> } | null)?.import
  if (!i) return null
  const own = (p: unknown): p is string => typeof p === 'string' && p.startsWith(`${creatorId}/`) && !p.includes('..')
  if ((i.kind !== 'image' && i.kind !== 'video') || !own(i.original_path) || !own(i.poster_path)) return null
  if (!i.poster_path.startsWith(`${creatorId}/imports/`)) return null
  return { kind: i.kind, originalPath: i.original_path, posterPath: i.poster_path }
}

/**
 * Put the import on the recording's first card, or make a card for it. Returns the cards to thread — the same
 * list, or the one made here.
 */
export async function attachImport(args: {
  creatorId: string
  recordingId: string
  projectId: string | null
  imported: Import
  cards: NewCard[]
  /** What she said, for a card made here: the classifier's title and the words as spoken. */
  title: string | null
  words: string
}): Promise<NewCard[]> {
  const supabase = db()
  const frameUrl = supabase.storage.from('frames').getPublicUrl(args.imported.posterPath).data.publicUrl
  const fields = {
    source: 'import',
    media_path: args.imported.originalPath,
    frame_url: frameUrl,
    frame_status: 'done',
    frame_at: new Date().toISOString(),
  }

  if (args.cards.length > 0) {
    const { error } = await supabase.from('cards').update(fields).eq('id', args.cards[0].id)
    if (error) throw new Error(`import card: ${error.message}`)
    return args.cards
  }

  const { data: projectId, error: pErr } = await supabase.rpc('resolve_project', {
    p_creator_id: args.creatorId,
    p_candidate: null,
    p_scope: args.projectId,
  })
  if (pErr) throw new Error(`resolve_project: ${pErr.message}`)
  const title = args.title?.trim() || (args.imported.kind === 'video' ? 'A video you added' : 'An image you added')
  const gist = args.words.trim()
  const { data: card, error } = await supabase
    .from('cards')
    .insert({
      creator_id: args.creatorId,
      recording_id: args.recordingId,
      title,
      gist,
      play_from_ms: 0,
      // She chose to add it, so it isn't a guess — but Ivy heard no idea in the line, so not a confident one either.
      confidence: 0.7,
      project_id: projectId,
      ...fields,
    })
    .select('id')
    .single()
  if (error) throw new Error(`import card: ${error.message}`)
  return [{ id: card.id, title, gist, candidateThreads: [], projectId: projectId as string }]
}
