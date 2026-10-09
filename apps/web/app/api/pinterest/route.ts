// apps/web/app/api/pinterest/route.ts
// The Pinterest connection, for the app's Connect row (Job H.0c). Signed in (Clerk).
//   GET    → { available, connected } — available is false until PINTEREST_APP_SECRET is set ("coming soon")
//   DELETE → disconnect: deletes her token from Vault and the creator_connections row, together
//            (Pinterest terms, rule 4: packages/schema/pinterest.ts).

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { available, disconnect, isConnected } from '@/lib/pinterest'

export const runtime = 'nodejs'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ available: available(), connected: await isConnected(userId) })
}

export async function DELETE() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    await disconnect(userId)
    return NextResponse.json({ connected: false })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Disconnect failed' }, { status: 500 })
  }
}
