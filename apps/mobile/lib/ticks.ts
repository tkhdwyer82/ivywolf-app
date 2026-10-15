// apps/mobile/lib/ticks.ts
// The tick on a My things row (M3, Figma 1797:97). Tap the circle: the to-do is done at once (written straight away,
// so leaving the screen keeps it), but the row stays where it is at 40 % for 6 s with the "Done · Undo" pill —
// nothing reorders under her finger — then drops into the Done group (groupTodos in lib/things.ts). Undo, or a tap
// on a done row's tick, takes it back. Only the latest tick is on the pill.

import { useCallback, useEffect, useRef, useState } from 'react'

export const SETTLE_MS = 6000

type Done = { id: string; done: boolean }

export function useTicks(args: {
  /** Show it now: flip the row's done in the screen's list. */
  apply: (change: Done) => void
  /** Write it: lib/todo.ts setTodoDone. A failure flips the row back. */
  save: (change: Done) => Promise<void>
  onError?: (e: unknown) => void
}) {
  const { apply, save, onError } = args
  const [settling, setSettling] = useState<ReadonlySet<string>>(new Set())
  const [undoable, setUndoable] = useState<string | null>(null)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const all = timers.current
    return () => all.forEach(clearTimeout)
  }, [])

  const settle = useCallback((id: string, on: boolean) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setSettling((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const write = useCallback(
    (change: Done) => {
      apply(change)
      save(change).catch((e) => {
        apply({ id: change.id, done: !change.done })
        onError?.(e)
      })
    },
    [apply, save, onError]
  )

  /** The circle on a row. */
  const tick = useCallback(
    (t: { id: string; done: boolean }) => {
      if (t.done) {
        // Already done (in Done, or still fading): take it back.
        settle(t.id, false)
        setUndoable((u) => (u === t.id ? null : u))
        return write({ id: t.id, done: false })
      }
      write({ id: t.id, done: true })
      settle(t.id, true)
      timers.current.set(
        t.id,
        setTimeout(() => {
          timers.current.delete(t.id)
          setSettling((s) => {
            const next = new Set(s)
            next.delete(t.id)
            return next
          })
          setUndoable((u) => (u === t.id ? null : u))
        }, SETTLE_MS)
      )
      setUndoable(t.id)
    },
    [settle, write]
  )

  /** Undo on the pill. */
  const undo = useCallback(() => {
    if (!undoable) return
    settle(undoable, false)
    write({ id: undoable, done: false })
    setUndoable(null)
  }, [undoable, settle, write])

  return { settling, undoable, tick, undo }
}
