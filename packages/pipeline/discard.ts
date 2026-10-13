// packages/pipeline/discard.ts
// Undo on Home's "Writing it up" pill (Job B.3, 0040): the app stamps recordings.discarded_at, then deletes the
// recording. The pipeline may already be running in after(), so it checks between stages and stops — nothing more is
// written, framed or searched for. A recording that's gone altogether counts as discarded too.
//
// Nothing here touches credit_ledger: a discarded take is never charged, and stopping logs nothing.

import type { SupabaseClient } from '@supabase/supabase-js'

export class Discarded extends Error {
  constructor(readonly recordingId: string) {
    super(`recording ${recordingId} was discarded`)
    this.name = 'Discarded'
  }
}

export function isDiscarded(err: unknown): err is Discarded {
  return err instanceof Discarded || (err instanceof Error && err.name === 'Discarded')
}

/** Throws Discarded if she discarded the take (or it was deleted) since the pipeline started. */
export async function stillWanted(supabase: SupabaseClient, recordingId: string): Promise<void> {
  const { data, error } = await supabase.from('recordings').select('discarded_at').eq('id', recordingId).maybeSingle()
  if (error) throw new Error(`discard check: ${error.message}`)
  if (!data || data.discarded_at) throw new Discarded(recordingId)
}
