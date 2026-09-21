// apps/web/app/api/api-keys/route.ts
// Lifted from gamesfield-app app/api/api-keys/route.ts per docs/lift-list.md.
// Changes: `iv_` prefix (via lib/mcp/auth.ts), creator_id not user_id, user-JWT client so RLS applies.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabaseAsUser } from '@/lib/supabase'
import { generateApiKey } from '@/lib/mcp/auth'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await supabaseAsUser()
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, label, created_at, last_used_at, revoked_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { label } = await req.json().catch(() => ({ label: '' }))
  const { raw, hash } = generateApiKey()

  const supabase = await supabaseAsUser()
  const { error } = await supabase.from('api_keys').insert({
    creator_id: userId,
    key_hash: hash,
    label: label || 'My API Key',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The only time the raw key is ever visible.
  return NextResponse.json({ key: raw })
}
