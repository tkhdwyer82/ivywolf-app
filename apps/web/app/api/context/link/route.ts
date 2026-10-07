// apps/web/app/api/context/link/route.ts
// Add context → Link (Job C+, Figma 1461:2): the page's title and thumbnail, and nothing else. The app stores what
// this returns on the card_context row; nothing about her is sent to the page beyond an ordinary fetch.
//
// The server fetches a URL she typed, so it's guarded: http(s) only, ports 80/443, no private, loopback or link-local
// addresses (checked on every redirect, at most three), five seconds, the first 512 KB of HTML read.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { fetchHtml, preview } from '@/lib/web/linkPreview'

export const runtime = 'nodejs'
export const maxDuration = 15

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { url?: unknown } | null
  const raw = typeof body?.url === 'string' ? body.url.trim() : ''
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return NextResponse.json({ error: 'Not a link' }, { status: 400 })
  }
  const host = url.host.replace(/^www\./, '')

  try {
    const html = await fetchHtml(url)
    const page = html ? preview(html, url) : { title: null, thumbnail_url: null }
    return NextResponse.json({ ...page, host })
  } catch (err) {
    console.warn(`[context/link] ${url.host}: ${err instanceof Error ? err.message : err}`)
    return NextResponse.json({ title: null, thumbnail_url: null, host })
  }
}
