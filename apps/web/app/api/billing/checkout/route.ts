// apps/web/app/api/billing/checkout/route.ts
// Lifted from gamesfield-app app/api/checkout/route.ts per docs/lift-list.md.
// Changes: Ivy plans, price ids from env (Gamesfield hardcoded `price_1TXrvf...` in the source),
// return URLs from NEXT_PUBLIC_APP_URL (Gamesfield hardcoded its vercel.app domain).

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { stripe } from '@/lib/stripe'
import { PLANS, isPlanId, appUrl } from '@/lib/billing'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan } = await req.json().catch(() => ({ plan: null }))
  if (!isPlanId(plan)) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

  const tier = PLANS[plan]
  if (!tier.priceEnv) {
    return NextResponse.json({ error: `Plan "${plan}" is not purchasable` }, { status: 400 })
  }

  const priceId = process.env[tier.priceEnv]
  if (!priceId) {
    console.error(`[billing/checkout] ${tier.priceEnv} is not set`)
    return NextResponse.json({ error: 'Billing is not configured' }, { status: 500 })
  }

  // creator_id travels on the session AND the subscription so every later webhook can attribute itself.
  const metadata = { creator_id: userId, plan: tier.id }

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: appUrl('/account?success=1'),
    cancel_url: appUrl('/pricing'),
    metadata,
    subscription_data: { metadata },
  })

  return NextResponse.json({ url: session.url })
}
