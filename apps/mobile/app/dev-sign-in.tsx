// apps/mobile/app/dev-sign-in.tsx
// Dev only: the simulator signs in from a Clerk sign-in ticket instead of an emailed code (scripts/sim-sign-in.ts
// mints one and opens ivywolf://dev-sign-in?ticket=…). Inert unless this is a dev build on Clerk's development
// instance — __DEV__ and a pk_test_ key. Preview and production builds have __DEV__ false: the route only redirects
// to /sign-in, so a ticket link does nothing there.

import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { isClerkAPIResponseError, useSignIn } from '@clerk/clerk-expo'
import { color, type } from '@/lib/theme'

export const DEV_SIGN_IN = __DEV__ && (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '').startsWith('pk_test_')

export default function DevSignIn() {
  const { ticket } = useLocalSearchParams<{ ticket?: string }>()
  const { isLoaded, signIn, setActive } = useSignIn()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!DEV_SIGN_IN || !isLoaded || !ticket) return
    signIn
      .create({ strategy: 'ticket', ticket })
      .then((r) => (r.status === 'complete' ? setActive({ session: r.createdSessionId }) : setError(`Ticket sign-in stopped at ${r.status}`)))
      .catch((e) => setError(isClerkAPIResponseError(e) ? e.errors[0]?.longMessage ?? e.errors[0]?.message ?? 'Ticket refused' : String(e)))
  }, [isLoaded, signIn, setActive, ticket])

  if (!DEV_SIGN_IN) return <Redirect href="/sign-in" />
  return (
    <View style={styles.screen}>
      <Text style={type.meta}>{error ?? (ticket ? 'Signing in…' : 'No ticket. Run scripts/sim-sign-in.ts.')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.paper },
})
