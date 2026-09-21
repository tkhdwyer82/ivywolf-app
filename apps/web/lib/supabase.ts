// apps/web/lib/supabase.ts
// Two clients, deliberately separate.
//
// docs/lift-list.md "Fixed on the way in":
//   "RLS: auth.jwt() ->> 'sub' everywhere. Routes use the user JWT; service role only in the pipeline worker."
//
// Gamesfield used the service-role key in every single route, which made its RLS policies decorative —
// they were never exercised, and the auth.uid() ones never matched a Clerk JWT at all. Here, a route that
// acts on behalf of a signed-in creator uses supabaseAsUser() so the policies in 0001/0002 do the work.
// supabaseAdmin() is for the two cases with no user session: the Stripe webhook and the pipeline worker.

import { auth } from '@clerk/nextjs/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

/**
 * Supabase client carrying the caller's Clerk token. RLS applies.
 * Requires the Clerk third-party auth integration to be enabled on the Supabase project
 * (supabase/config.toml -> [auth.third_party.clerk]) so auth.jwt() ->> 'sub' resolves.
 */
export async function supabaseAsUser(): Promise<SupabaseClient> {
  const { getToken } = await auth()

  return createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    accessToken: async () => (await getToken()) ?? '',
  })
}

/**
 * Service-role client. Bypasses RLS entirely — use only where there is no user session to speak for.
 * Never import this into a route that could have used supabaseAsUser().
 */
export function supabaseAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}
