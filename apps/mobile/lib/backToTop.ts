// apps/mobile/lib/backToTop.ts
// Home in the nav, tapped while already on Home (Job B.3 item 4): back to All and to the top, animated. Nothing is
// reloaded — no pull-to-refresh, no fetch. From another room the nav just switches (Nav.tsx).
//
// Switching the chip swaps the list's data, and a scroll fired in the same tick runs against the old content (the
// list lands part-way down). So when the chip changes, the scroll waits for the render that shows All.

import { useCallback, useEffect, useRef, type RefObject } from 'react'

type Scrollable = { scrollToOffset: (to: { offset: number; animated: boolean }) => void }

export function useBackToTop(project: string | null, setProject: (id: string | null) => void, list: RefObject<Scrollable | null>) {
  const pending = useRef(false)
  useEffect(() => {
    if (project !== null || !pending.current) return
    pending.current = false
    list.current?.scrollToOffset({ offset: 0, animated: true })
  }, [project, list])

  return useCallback(() => {
    if (project === null) return list.current?.scrollToOffset({ offset: 0, animated: true })
    pending.current = true
    setProject(null)
  }, [project, setProject, list])
}
