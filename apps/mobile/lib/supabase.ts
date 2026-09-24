// apps/mobile/lib/supabase.ts
// Supabase from the app always carries the signed-in creator's Clerk session token, so every query and upload is
// scoped by RLS (auth.jwt() ->> 'sub'). The anon key is the only key in the app.

import 'react-native-url-polyfill/auto'
import { useAuth } from '@clerk/clerk-expo'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// One client for the app, so screens can depend on it: Clerk hands out a new getToken on every render, and a client
// rebuilt from it was a new object each render — every `useFocusEffect(load)` keyed on it reloaded forever. The
// client asks for the token through whichever getToken the latest render saw, so a sign-in as someone else is
// picked up on the next query.
let getToken: (() => Promise<string | null>) | null = null
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  accessToken: async () => (getToken ? await getToken() : null),
})

export function useSupabase(): SupabaseClient {
  getToken = useAuth().getToken
  return client
}
