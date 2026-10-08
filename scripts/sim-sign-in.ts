// scripts/sim-sign-in.ts
// Signs the iOS simulator's dev build in without an emailed code: mints a Clerk sign-in token (a one-use ticket,
// 5 minutes) for the simulator's test account and opens ivywolf://dev-sign-in?ticket=… on the booted simulator,
// which redeems it (apps/mobile/app/dev-sign-in.tsx). The app is not relaunched.
//
//   npx tsx --env-file=apps/web/.env.local scripts/sim-sign-in.ts            # the test account, the booted simulator
//   SIM_USER_ID=user_… SIM_DEVICE=<udid> npx tsx --env-file=apps/web/.env.local scripts/sim-sign-in.ts
//
// Development instance only: it refuses a live Clerk key (sk_live_), and the app side only acts in a __DEV__ build
// on a pk_test_ key, so preview and production never accept a ticket. The ticket is never printed.

import { execFileSync } from 'node:child_process'

/** The simulator / test account (docs/handovers/IVYWOLF_pinterest_rhythm_jobG.md). */
const TEST_ACCOUNT = 'user_3JfYR4D8eJVCL3yieXStYYoqwaH'

async function main() {
  const key = process.env.CLERK_SECRET_KEY
  if (!key) throw new Error('CLERK_SECRET_KEY is not set (run with --env-file=apps/web/.env.local)')
  if (!key.startsWith('sk_test_')) throw new Error('Refusing: this is not a Clerk development key (sk_test_). Simulator sign-in is dev only.')
  const userId = process.env.SIM_USER_ID ?? TEST_ACCOUNT
  const device = process.env.SIM_DEVICE ?? 'booted'

  const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
  })
  if (!res.ok) throw new Error(`Clerk sign_in_tokens ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const { token } = (await res.json()) as { token?: string }
  if (!token) throw new Error('Clerk returned no token')

  execFileSync('xcrun', ['simctl', 'openurl', device, `ivywolf://dev-sign-in?ticket=${encodeURIComponent(token)}`], { stdio: 'inherit' })
  console.log(`Opened the ticket link on ${device} for ${userId}. The app signs in and lands on Home.`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
