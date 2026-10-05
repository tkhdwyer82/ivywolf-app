// packages/pipeline/redact.ts
// The code-level guard behind "illustrative, never a likeness" (shape_v1 visual_query, classify_v6 frame_brief). The
// prompts ask for no names; this makes sure. Before a visual_query goes to Unsplash or a frame_brief to fal.ai, every
// word of a person the classifier heard in that recording (name, canonical name, aliases) is taken out.
//
// The names come from recordings.meta.people, written by graph.ts writeClassification. A recording classified before
// that existed has no list; for it the creator's known people (entities, kind person) stand in.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Lowercased words of the names, letters and digits only; one-letter words are skipped (initials match too much). */
function nameWords(names: string[]): Set<string> {
  const words = new Set<string>()
  for (const n of names) for (const w of n.toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (w.length > 1) words.add(w)
  return words
}

/**
 * `text` with every word matching a person's name removed (case-insensitive, whole words, possessive 's with it),
 * whitespace collapsed. `removed` counts the words taken out; 0 means the text is unchanged.
 */
export function stripPeople(text: string, names: string[]): { text: string; removed: number } {
  const words = nameWords(names)
  if (words.size === 0) return { text, removed: 0 }
  let removed = 0
  const out = text.replace(/[\p{L}\p{N}]+(?:['’][sS])?/gu, (token) => {
    const bare = token.replace(/['’][sS]$/, '').toLowerCase()
    if (!words.has(bare)) return token
    removed++
    return ''
  })
  if (removed === 0) return { text, removed: 0 }
  return {
    text: out
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s,.;:!?]+|[\s,;:]+$/g, '')
      .trim(),
    removed,
  }
}

/** The person names to keep out of one recording's outbound queries and briefs. */
export async function peopleFor(supabase: SupabaseClient, creatorId: string, recordingId: string | null): Promise<string[]> {
  if (recordingId) {
    const { data } = await supabase.from('recordings').select('meta').eq('id', recordingId).eq('creator_id', creatorId).maybeSingle()
    const people = (data?.meta as { people?: unknown } | null)?.people
    if (Array.isArray(people)) return people.filter((p): p is string => typeof p === 'string')
  }
  const { data, error } = await supabase.from('entities').select('canonical_name, aliases').eq('creator_id', creatorId).eq('kind', 'person')
  if (error) throw new Error(`people for ${creatorId}: ${error.message}`)
  return (data ?? []).flatMap((e) => [e.canonical_name as string, ...((e.aliases as string[] | null) ?? [])])
}
