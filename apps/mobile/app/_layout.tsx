// apps/mobile/app/_layout.tsx
// Clerk wraps everything; signed-out users only ever see /sign-in. Signed in: Home (/) and the screens it opens —
// no tab bar; Home's floating trio is the navigation (Home · ⊕ · Explore).

import { ClerkProvider, useAuth } from '@clerk/clerk-expo'
import { tokenCache } from '@clerk/clerk-expo/token-cache'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { color, hero } from '@/lib/theme'

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!

function Routes() {
  const { isLoaded, isSignedIn } = useAuth()
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
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <StatusBar style="dark" />
      <Routes />
    </ClerkProvider>
  )
}
