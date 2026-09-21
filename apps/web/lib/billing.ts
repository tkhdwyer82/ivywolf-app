// apps/web/lib/billing.ts
// Ivy plans. Replaces Gamesfield's PLAN_CREDITS = { indie: 750, studio: 3000, team: 7500, free: 50 }.
//
// Plan names must match the `plan` column comment in supabase/migrations/0002_ledger_and_helpers.sql:
//   pilot | bundled12 | monthly | free
//
// NOTE: the credit grants below are placeholders — they need real numbers before anyone is charged.
// Gamesfield's price IDs were hardcoded in the route; here they come from env so test and live differ
// by configuration rather than by edit.

export type PlanId = 'pilot' | 'bundled12' | 'monthly' | 'free'

export interface Plan {
  id: PlanId
  /** Credits granted per billing period. TODO: confirm real values. */
  credits: number
  /** credit_ledger.reason for the grant. */
  grantReason: string
  /** Env var holding the Stripe price id. Absent for plans that are not purchasable. */
  priceEnv?: string
  /** Kickstarter tier: 12 months included up front. */
  bundledMonths?: number
}

export const PLANS: Record<PlanId, Plan> = {
  free: { id: 'free', credits: 50, grantReason: 'grant_monthly' },
  pilot: { id: 'pilot', credits: 1000, grantReason: 'pilot_grant' },
  monthly: {
    id: 'monthly',
    credits: 1000,
    grantReason: 'grant_monthly',
    priceEnv: 'STRIPE_PRICE_MONTHLY',
  },
  bundled12: {
    id: 'bundled12',
    credits: 12000,
    grantReason: 'grant_monthly',
    priceEnv: 'STRIPE_PRICE_BUNDLED12',
    bundledMonths: 12,
  },
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in PLANS
}

export function appUrl(path = ''): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}${path}`
}
