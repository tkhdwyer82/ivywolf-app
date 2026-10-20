// apps/mobile/components/RecipeUndo.tsx
// "Remove these n cards · Undo" (Job B.10): for 10 s after a recipe's cards land in the project. Undo deletes every
// card the application made (DELETE /api/recipes/applications/{id}); the charge stands (B.10 leaves refunds to Tim).

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/clerk-expo'
import { Pill } from '@/components/UndoPill'
import { removeLabel, undo, UNDO_MS } from '@/lib/recipes'

export function RecipeUndo({ applicationId, count, onDone }: { applicationId: string; count: number; onDone: (removed: boolean) => void }) {
  const { getToken } = useAuth()
  const [state, setState] = useState<'open' | 'removing' | 'failed'>('open')

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
      await undo(token, applicationId)
      onDone(true)
    } catch {
      setState('failed')
      setTimeout(() => onDone(false), 2500)
    }
  }

  if (state === 'failed') return <Pill label="Those cards didn’t come off" tone="grey" />
  if (state === 'removing') return <Pill label="Removing…" tone="grey" />
  return <Pill label={removeLabel(count)} action="Undo" onAction={remove} actionLabel={`Undo, ${removeLabel(count).toLowerCase()}`} testID="recipe-undo" />
}
