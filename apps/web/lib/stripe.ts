// apps/web/lib/stripe.ts
// Lazy Stripe client.
//
// Gamesfield constructed `new Stripe(process.env.STRIPE_SECRET_KEY!)` at module scope in three routes.
// That throws at *build* time when the key is absent, which makes a production build depend on having
// live secrets available. Construct on first use instead, so the build only needs the code.

import Stripe from 'stripe'

let client: Stripe | null = null

export function stripe(): Stripe {
  if (client) return client

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')

  client = new Stripe(key)
  return client
}
