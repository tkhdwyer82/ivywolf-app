// apps/web/app/api/pinterest/callback/route.ts
// Connect Pinterest, step 2 (Job H.0c): Pinterest redirects here (https://app.ivywolf.com.au/api/pinterest/callback)
// with a code and our sealed state. Public in proxy.ts — there's no Clerk session in the consent browser — so the state
// is the authentication: sealed with a key only we hold, bound to her creator id, single-purpose, ten minutes. Then
// the code becomes tokens in Vault and she's sent back to the app (ivywolf://pinterest?status=…), which closes the
// browser. Nothing from Pinterest but the token is kept (packages/schema/pinterest.ts).

import { NextResponse } from 'next/server'
import { available, connect, openState } from '@/lib/pinterest'

export const runtime = 'nodejs'

const back = (status: 'connected' | 'cancelled' | 'error') => NextResponse.redirect(`ivywolf://pinterest?status=${status}`, 302)

export async function GET(req: Request) {
  const url = new URL(req.url)
  if (!available()) return back('error')
  if (url.searchParams.get('error')) return back('cancelled') // she said no on Pinterest's page
  const code = url.searchParams.get('code')
  const state = openState(url.searchParams.get('state') ?? '')
  if (!code || !state) return back('error')
  try {
    await connect(state.creatorId, code, state.verifier)
    return back('connected')
  } catch (err) {
    console.error(`[pinterest] connect failed: ${err instanceof Error ? err.message.slice(0, 120) : 'error'}`)
    return back('error')
  }
}
