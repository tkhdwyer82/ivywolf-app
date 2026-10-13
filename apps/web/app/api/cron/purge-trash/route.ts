// apps/web/app/api/cron/purge-trash/route.ts
// GET, daily from Vercel Cron (vercel.json): the 30-day trash purge and any discarded take whose delete didn't finish
// (packages/pipeline/trash.ts, Job B.3, 0040). Vercel sends `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET
// set, the route refuses everyone, so it can't be triggered from outside. Service role: it purges every creator's
// trash, and only rows that are already in it.

import { NextResponse } from 'next/server'
import { purgeTrash } from '@ivywolf/pipeline'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await purgeTrash()
  if (result.errors.length) console.error('[cron/purge-trash]', result.errors)
  console.log(`[cron/purge-trash] ${result.recordings} recording(s), ${result.cards} card(s), ${result.actions} to-do(s)`)
  return NextResponse.json(result, { status: result.errors.length ? 500 : 200 })
}
