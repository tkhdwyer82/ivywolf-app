// apps/mobile/app/(tabs)/capture.tsx
// The + tab opens Record (app/record.tsx) as a full-screen modal and hands the tab back to Home, so closing Record
// lands on Home. Goes away when Home's floating trio replaces the tab bar (Job 4, step 2).

import { useCallback } from 'react'
import { router, useFocusEffect } from 'expo-router'

export default function RecordTab() {
  useFocusEffect(
    useCallback(() => {
      router.navigate('/')
      router.push('/record')
    }, [])
  )
  return null
}
