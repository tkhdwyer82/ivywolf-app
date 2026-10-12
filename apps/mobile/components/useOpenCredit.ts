// apps/mobile/components/useOpenCredit.ts
// A picture's credit, tapped (Home v4): open the photographer's page. That is "use", so an Unsplash reference sends its
// download event now — never for being shown (Unsplash API guidelines).

import { useCallback } from 'react'
import * as WebBrowser from 'expo-web-browser'
import { useAuth } from '@clerk/clerk-expo'
import { referenceUsed, type Reference } from '@/lib/directions'
import type { Picture } from '@/lib/picture'

export function useOpenCredit() {
  const { getToken } = useAuth()
  return useCallback(
    async (p: Picture) => {
      if (!p.credit) return
      WebBrowser.openBrowserAsync(p.credit.url).catch(() => {})
      if (!p.trackUrl) return
      const token = await getToken()
      if (token) referenceUsed(token, { source: 'unsplash', track_url: p.trackUrl } as Reference)
    },
    [getToken]
  )
}
