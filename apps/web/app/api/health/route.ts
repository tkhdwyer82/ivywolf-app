// Liveness probe. Public (see proxy.ts) — must answer before auth.
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ ok: true, service: 'ivywolf-web', ts: new Date().toISOString() })
}
