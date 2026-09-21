// apps/mobile/lib/supabase.ts
// Supabase from the app always carries the signed-in creator's Clerk session token, so every query and upload is
// scoped by RLS (auth.jwt() ->> 'sub'). The anon key is the only key in the app.

import 'react-native-url-polyfill/auto'
import { useMemo } from 'react'
import { useAuth } from '@clerk/clerk-expo'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export function useSupabase(): SupabaseClient {
  const { getToken } = useAuth()
  return useMemo(
    () =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        accessToken: async () => (await getToken()) ?? null,
      }),
    [getToken]
  )
}
