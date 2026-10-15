// apps/mobile/lib/discard.ts
// Discard (Job B.3). Two ways a take is thrown away before it becomes cards:
//
// 1. × on the listening screen (B.3.1). A take the mic never heard speech in closes and is deleted on the phone —
//    nothing was uploaded — and Home shows a grey "Nothing saved" for 2 s. Any take with speech asks, whatever its
//    length: Keep (lime) or Discard. An import always asks, because its picture is already uploaded and is the idea.
// 2. Undo on Home's "Writing it up · Undo" pill, shown for 6 s once Home is back (saving can take seconds itself,
//    so the window starts when the pill can be seen, not at the tap on stop). Undo stamps recordings.discarded_at — the
//    pipeline's stop signal (packages/pipeline/discard.ts) — then deletes the recording, its transcript and anything
//    already derived (packages/schema/deletion.ts). Nothing is logged to credits: the pipeline never charges a take.
//
// The pill lives on Home but the take is stopped on Record, so the hand-off is a tiny store rather than a route param
// (router.back() can't carry one).

/** Speech on a phone mic peaks around −30 to −15 dBFS; a silent room sits below −50 (record.tsx). */
export const SILENT_DB = -50
export const UNDO_MS = 6000
/** How long the grey "Nothing saved" stays (B.3.1). */
export const NOTICE_MS = 2000

export type CloseDecision = 'drop' | 'ask'

/**
 * What × does: drop only a take with no speech in it; ask about every other, however short. `peakDb` null means the
 * mic never reported a level, or hasn't yet — not the same as silence, so it asks.
 */
export function closeDecision(take: { peakDb: number | null; imported: boolean }): CloseDecision {
  if (take.imported) return 'ask'
  if (take.peakDb !== null && take.peakDb < SILENT_DB) return 'drop'
  return 'ask'
}

// ── Undo hand-off: Record → Home ────────────────────────────────────────────────────────────────────────────────

/** `shownAt`: when the take was handed to Home — the start of the 6 s. */
export type JustRecorded = { recordingId: string; storagePath: string; shownAt: number }

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
  return j ? Math.max(0, j.shownAt + UNDO_MS - now) : 0
}

// ── "Nothing saved": Record → Home ───────────────────────────────────────────────────────────────────────────

export type Notice = { label: string; until: number }

let currentNotice: Notice | null = null
const noticeListeners = new Set<(n: Notice | null) => void>()

/** A grey pill on Home with no action (UndoPill.tsx), gone by itself after `ms`. */
export function showNotice(label: string, ms = NOTICE_MS, now = Date.now()) {
  currentNotice = { label, until: now + ms }
  for (const l of noticeListeners) l(currentNotice)
}

export function notice(): Notice | null {
  return currentNotice
}

export function onNotice(l: (n: Notice | null) => void): () => void {
  noticeListeners.add(l)
  return () => noticeListeners.delete(l)
}
