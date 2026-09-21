// apps/web/app/api/api-keys/[id]/route.ts
// Lifted from gamesfield-app app/api/api-keys/[id]/route.ts per docs/lift-list.md.
// Revoke, never delete — a revoked key stays on the row so the audit trail survives.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabaseAsUser } from '@/lib/supabase'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // RLS scopes this to the caller's own keys; the explicit creator_id filter is belt and braces.
  const supabase = await supabaseAsUser()
  const { error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('creator_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
