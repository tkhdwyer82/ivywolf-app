// apps/mobile/app/_layout.tsx
// Clerk wraps everything; signed-out users only ever see /sign-in. Signed in: Home (/) and the screens it opens —
// no tab bar; Home's floating trio is the navigation (Home · ⊕ · Explore).

import { ClerkProvider, useAuth } from '@clerk/clerk-expo'
import { tokenCache } from '@clerk/clerk-expo/token-cache'
import { router, Stack } from 'expo-router'
import { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { color, hero } from '@/lib/theme'

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!

function Routes() {
  const { isLoaded, isSignedIn } = useAuth()
  useReminderTaps(isLoaded && !!isSignedIn)
  if (!isLoaded) return null

  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: color.paper }, headerShadowVisible: false }}>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="index" options={{ headerShown: false, contentStyle: { backgroundColor: hero.room } }} />
        <Stack.Screen name="idea/[id]" options={{ headerShown: false, contentStyle: { backgroundColor: hero.room } }} />
        <Stack.Screen name="idea/transcript/[id]" options={{ headerShown: false, presentation: 'modal', contentStyle: { backgroundColor: '#FAFAF7' } }} />
        <Stack.Screen name="idea/save/[id]" options={{ headerShown: false, presentation: 'modal', contentStyle: { backgroundColor: hero.room } }} />
        <Stack.Screen name="idea/edit/[id]" options={{ headerShown: false, presentation: 'modal', contentStyle: { backgroundColor: hero.room } }} />
        <Stack.Screen name="explore" options={{ headerShown: false, contentStyle: { backgroundColor: hero.room } }} />
        <Stack.Screen
          name="notes"
          options={{ title: 'Voice notes', headerBackTitle: 'Home', headerStyle: { backgroundColor: color.paper } }}
        />
        <Stack.Screen name="record" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen
          name="add"
          options={{ headerShown: false, presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
        />
        <Stack.Screen name="connections" options={{ title: 'Connect', headerBackTitle: 'Home', contentStyle: { backgroundColor: hero.room } }} />
        <Stack.Screen name="things" options={{ headerShown: false, contentStyle: { backgroundColor: hero.room } }} />
        <Stack.Screen name="todo/[id]" options={{ headerShown: false, contentStyle: { backgroundColor: hero.room } }} />
        <Stack.Screen name="project/[id]" options={{ headerShown: false, contentStyle: { backgroundColor: hero.room } }} />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  )
}

/**
 * Remind me (P18): show a reminder even with the app open, and a tap on one opens its to-do. Loaded on use, so a
 * build made before expo-notifications was added still starts.
 */
function useReminderTaps(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    let sub: { remove: () => void } | undefined
    let gone = false
    import('expo-notifications')
      .then((N) => {
        if (gone) return
        N.setNotificationHandler({
          handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
        })
        const open = (r: { notification: { request: { content: { data?: Record<string, unknown> } } } } | null) => {
          const id = r?.notification.request.content.data?.todoId
          if (typeof id === 'string') router.push(`/todo/${id}`)
        }
        N.getLastNotificationResponseAsync().then(open).catch(() => {})
        sub = N.addNotificationResponseReceivedListener(open)
      })
      .catch(() => {})
    return () => {
      gone = true
      sub?.remove()
    }
  }, [ready])
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <StatusBar style="dark" />
      <Routes />
    </ClerkProvider>
  )
}
