// supabase/functions/cleanup-junk/index.ts
// Privacy promise: "Junk recordings (accidental taps, no speech): deleted automatically within 30 days."
// Called daily by pg_cron (0007_recording_deletion.sql) with the service role JWT.
//
// Storage objects are removed through the Storage API first, then the rows (which cascade to everything derived
// from them). If a storage removal fails, that batch's rows are kept so the next run retries — never a row deleted
// with its audio left behind.

import { createClient } from 'npm:@supabase/supabase-js@2'

const BATCH = 200

Deno.serve(async (req) => {
  // verify_jwt is on for this function, so only a valid project JWT reaches here; require the service role one.
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const role = decodeRole(token)
  if (role !== 'service_role') return json({ error: 'forbidden' }, 403)

  const { older_than_days = 30 } = await req.json().catch(() => ({}))
  const days = Math.max(30, Number(older_than_days) || 30) // never shorter than the promise allows us to keep
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  let deleted = 0
  for (;;) {
    const { data: rows, error } = await db
      .from('recordings')
      .select('id, storage_path')
      .eq('status', 'junk')
      .lt('received_at', cutoff)
      .limit(BATCH)
    if (error) return json({ error: error.message, deleted }, 500)
    if (!rows || rows.length === 0) break

    const removed = await db.storage.from('recordings').remove(rows.map((r) => r.storage_path))
    if (removed.error) return json({ error: `storage: ${removed.error.message}`, deleted }, 500)

    const { error: delError } = await db.from('recordings').delete().in('id', rows.map((r) => r.id))
    if (delError) return json({ error: delError.message, deleted }, 500)

    deleted += rows.length
    if (rows.length < BATCH) break
  }

  console.log(`[cleanup-junk] deleted ${deleted} junk recordings older than ${days} days`)
  return json({ deleted, cutoff })
})

function decodeRole(jwt: string): string | null {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
