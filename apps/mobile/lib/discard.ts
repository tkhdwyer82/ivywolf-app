// apps/mobile/lib/discard.ts
// Discard (Job B.3). Two ways a take is thrown away before it becomes cards:
//
// 1. × on the listening screen. A take under 5 s, or one the mic never heard speech in, closes and is deleted on the
//    phone without a word — nothing was uploaded. Anything longer asks: Keep (lime) or Discard. An import always
//    asks, because its picture is already uploaded and is the idea.
// 2. Undo on Home's "Writing it up · Undo" pill, shown for 6 s after stop. Undo stamps recordings.discarded_at — the
//    pipeline's stop signal (packages/pipeline/discard.ts) — then deletes the recording, its transcript and anything
//    already derived (packages/schema/deletion.ts). Nothing is logged to credits: the pipeline never charges a take.
//
// The pill lives on Home but the take is stopped on Record, so the hand-off is a tiny store rather than a route param
// (router.back() can't carry one).

export const DISCARD_SILENT_MS = 5000
/** Speech on a phone mic peaks around −30 to −15 dBFS; a silent room sits below −50 (record.tsx). */
export const SILENT_DB = -50
export const UNDO_MS = 6000

export type CloseDecision = 'drop' | 'ask'

/**
 * What × does. `peakDb` null means the mic never reported a level — not the same as silence, so only the length
 * decides then.
 */
export function closeDecision(take: { tookMs: number; peakDb: number | null; imported: boolean }): CloseDecision {
  if (take.imported) return 'ask'
  if (take.tookMs < DISCARD_SILENT_MS) return 'drop'
  if (take.peakDb !== null && take.peakDb < SILENT_DB) return 'drop'
  return 'ask'
}

// ── Undo hand-off: Record → Home ────────────────────────────────────────────────────────────────────────────────

export type JustRecorded = { recordingId: string; storagePath: string; stoppedAt: number }

let current: JustRecorded | null = null
const listeners = new Set<(j: JustRecorded | null) => void>()

export function setJustRecorded(j: JustRecorded | null) {
  current = j
  for (const l of listeners) l(j)
}

export function justRecorded(): JustRecorded | null {
  return current
}

export function onJustRecorded(l: (j: JustRecorded | null) => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Milliseconds of the Undo window left at `now`; 0 once it has passed. */
export function undoLeft(j: JustRecorded | null, now: number): number {
  return j ? Math.max(0, j.stoppedAt + UNDO_MS - now) : 0
}
