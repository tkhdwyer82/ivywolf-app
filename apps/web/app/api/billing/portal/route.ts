// apps/web/app/api/billing/portal/route.ts
// Lifted from gamesfield-app app/api/billing-portal/route.ts per docs/lift-list.md.
// Changes: reads `subscriptions` (0002) not `user_subscriptions`, user-JWT client, env return URL.

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAsUser } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'
import { appUrl } from '@/lib/billing'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await supabaseAsUser()
  const { data } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('creator_id', userId)
    .maybeSingle()

  if (!data?.stripe_customer_id) {
    return NextResponse.json({ error: 'No billing account' }, { status: 404 })
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: appUrl('/account'),
  })

  return NextResponse.json({ url: session.url })
}
