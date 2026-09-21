// apps/web/app/api/billing/webhook/route.ts
// Lifted from gamesfield-app app/api/webhook/route.ts per docs/lift-list.md.
//
// The substantive change: Gamesfield set `credits_remaining` to a fixed number on every event, so a
// Stripe retry silently reset the balance and any spend between events was erased. Here a grant is an
// append-only credit_ledger row, and every event is recorded in stripe_events first so a redelivery
// is a no-op rather than a second grant.
//
// Grants happen on invoice.paid, not checkout.session.completed — both fire on a first payment, and
// granting on each would double up.

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'
import { PLANS, isPlanId, type PlanId } from '@/lib/billing'

export const runtime = 'nodejs'

/** Record the event id. Returns false if we have already processed it. */
async function claimEvent(eventId: string, type: string): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from('stripe_events')
    .insert({ id: eventId, type })

  // 23505 = unique_violation — a redelivery of an event we have already handled.
  if (error && (error as { code?: string }).code === '23505') return false
  if (error) throw new Error(`stripe_events insert failed: ${error.message}`)
  return true
}

/**
 * Drop the claim so Stripe's retry is processed rather than skipped as a duplicate.
 * Without this, a handler that fails halfway would be permanently ignored on redelivery.
 */
async function releaseEvent(eventId: string): Promise<void> {
  const { error } = await supabaseAdmin().from('stripe_events').delete().eq('id', eventId)
  if (error) {
    // Nothing more we can do; log loudly because this event will now never be retried successfully.
    console.error(`[billing/webhook] could not release ${eventId}:`, error.message)
  }
}

function planFrom(metadata: Stripe.Metadata | null | undefined): PlanId | null {
  const plan = metadata?.plan
  return isPlanId(plan) ? plan : null
}

async function grantCredits(creatorId: string, plan: PlanId, invoiceId: string) {
  const tier = PLANS[plan]
  const { error } = await supabaseAdmin()
    .from('credit_ledger')
    .insert({
      creator_id: creatorId,
      delta: tier.credits,
      reason: tier.grantReason,
      adapter: 'stripe',
    })

  if (error) throw new Error(`credit grant failed (${invoiceId}): ${error.message}`)
  console.log(`[billing/webhook] granted ${tier.credits} to ${creatorId} (${plan})`)
}

export async function POST(req: NextRequest) {
  const body = Buffer.from(await req.arrayBuffer())
  const sig = req.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('[billing/webhook] signature failed:', message)
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 })
  }

  try {
    if (!(await claimEvent(event.id, event.type))) {
      console.log(`[billing/webhook] duplicate ${event.id}, ignoring`)
      return NextResponse.json({ received: true, duplicate: true })
    }

    switch (event.type) {
      // Record the subscription. No credits here — invoice.paid does that.
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const creatorId = session.metadata?.creator_id
        const plan = planFrom(session.metadata)
        if (!creatorId || !plan) {
          console.error('[billing/webhook] checkout without creator_id/plan', session.id)
          break
        }

        const bundledMonths = PLANS[plan].bundledMonths
        // Calendar months, not 30-day blocks: 12 bundled months ends exactly one year from now.
        let bundledUntil: string | null = null
        if (bundledMonths) {
          const until = new Date()
          until.setUTCMonth(until.getUTCMonth() + bundledMonths)
          bundledUntil = until.toISOString()
        }

        const { error } = await supabaseAdmin()
          .from('subscriptions')
          .upsert(
            {
              creator_id: creatorId,
              plan,
              status: 'active',
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              bundled_until: bundledUntil,
            },
            { onConflict: 'creator_id' }
          )
        if (error) throw new Error(`subscription upsert failed: ${error.message}`)
        break
      }

      // The grant. Fires on first payment and every renewal.
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = (invoice as unknown as { subscription?: string }).subscription
        if (!subscriptionId) break

        const subscription = await stripe().subscriptions.retrieve(subscriptionId)
        const creatorId = subscription.metadata?.creator_id
        const plan = planFrom(subscription.metadata)
        if (!creatorId || !plan) {
          console.error('[billing/webhook] invoice without creator_id/plan', invoice.id)
          break
        }

        // bundled12 is paid once and covers 12 months — grant on creation only, not on renewals.
        const billingReason = (invoice as unknown as { billing_reason?: string }).billing_reason
        if (PLANS[plan].bundledMonths && billingReason !== 'subscription_create') break

        await grantCredits(creatorId, plan, invoice.id ?? event.id)
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const creatorId = subscription.metadata?.creator_id
        if (!creatorId) break

        const { error } = await supabaseAdmin()
          .from('subscriptions')
          .update({ status: subscription.status })
          .eq('creator_id', creatorId)
        if (error) throw new Error(`subscription status update failed: ${error.message}`)
        break
      }

      // Credits already granted are not clawed back — the ledger is append-only.
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const creatorId = subscription.metadata?.creator_id
        if (!creatorId) break

        const { error } = await supabaseAdmin()
          .from('subscriptions')
          .update({ plan: 'free', status: 'canceled' })
          .eq('creator_id', creatorId)
        if (error) throw new Error(`subscription cancel failed: ${error.message}`)
        break
      }

      default:
        console.log(`[billing/webhook] unhandled ${event.type}`)
    }
  } catch (err) {
    // Release the claim first, then let Stripe retry.
    console.error('[billing/webhook] handler failed:', err)
    await releaseEvent(event.id)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
