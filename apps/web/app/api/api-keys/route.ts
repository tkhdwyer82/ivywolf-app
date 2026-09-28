// apps/web/app/api/api-keys/route.ts
// Lifted from gamesfield-app app/api/api-keys/route.ts per docs/lift-list.md.
// Changes: `iv_` prefix (via lib/mcp/auth.ts), creator_id not user_id, user-JWT client so RLS applies.
// Job F: keys live in creator_api_keys (0024) and carry scopes; Connect your Muse in the app makes and lists them.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabaseAsUser } from '@/lib/supabase'
import { generateApiKey, SCOPES, type Scope } from '@/lib/mcp/auth'

/** What the creator pastes into Muse along with the key. */
const MCP_ENDPOINT = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://ivywolf-api.vercel.app'}/mcp`

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await supabaseAsUser()
  const { data, error } = await supabase
    .from('creator_api_keys')
    .select('id, label, scopes, created_at, last_used_at, revoked_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ endpoint: MCP_ENDPOINT, keys: data })
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { label?: unknown; scopes?: unknown }
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 60) : 'Muse'
  // Least privilege: read only unless she turned capture on.
  const asked = Array.isArray(body.scopes) ? body.scopes : ['ideas:read']
  const scopes = [...new Set(asked)].filter((s): s is Scope => (SCOPES as unknown[]).includes(s))
  if (scopes.length === 0 || scopes.length !== new Set(asked).size) {
    return NextResponse.json({ error: `scopes must be some of: ${SCOPES.join(', ')}` }, { status: 400 })
  }

  const { raw, hash } = generateApiKey()
  const supabase = await supabaseAsUser()
  const { data, error } = await supabase
    .from('creator_api_keys')
    .insert({ creator_id: userId, hash, scopes, label })
    .select('id, label, scopes, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The only time the raw key is ever visible.
  return NextResponse.json({ key: raw, endpoint: MCP_ENDPOINT, ...data })
}
