// apps/mobile/components/RecipeUndo.tsx
// "Remove these n cards · Undo" (Job B.10): for 10 s after a recipe's cards land in the project. Undo deletes every
// card the application made (DELETE /api/recipes/applications/{id}) and refunds the charge in full — nothing has
// generated yet. "Removed · n credits back" for a moment after.

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-expo'
import { Pill } from '@/components/UndoPill'
import { creditsLabel, removeLabel, undo, UNDO_MS } from '@/lib/recipes'

export function RecipeUndo({ applicationId, count, onDone }: { applicationId: string; count: number; onDone: (removed: boolean) => void }) {
  const { getToken } = useAuth()
  const [state, setState] = useState<'open' | 'removing' | 'removed' | 'failed'>('open')
  const [back, setBack] = useState(0)

  useEffect(() => {
    if (state !== 'open') return
    const t = setTimeout(() => onDone(false), UNDO_MS)
    return () => clearTimeout(t)
  }, [state, onDone])

  async function remove() {
    setState('removing')
    try {
      const token = await getToken()
      if (!token) throw new Error('signed out')
      const refunded = await undo(token, applicationId)
      setBack(refunded)
      setState('removed')
      setTimeout(() => onDone(true), 1800)
    } catch {
      setState('failed')
      setTimeout(() => onDone(false), 2500)
    }
  }

  if (state === 'failed') return <Pill label="Those cards didn’t come off" tone="grey" />
  if (state === 'removing') return <Pill label="Removing…" tone="grey" />
  if (state === 'removed') return <Pill label={back > 0 ? `Removed · ${creditsLabel(back)} back` : 'Removed'} tone="grey" />
  return <Pill label={removeLabel(count)} action="Undo" onAction={remove} actionLabel={`Undo, ${removeLabel(count).toLowerCase()}`} testID="recipe-undo" />
}
