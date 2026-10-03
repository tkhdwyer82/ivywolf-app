// scripts/test-photo-live.ts
// Job B revised, end to end on production: the Unsplash lane through POST /api/cards/:id/photo, as the standing
// reviewer (IVY_REVIEWER_EMAIL / IVY_REVIEWER_PASSWORD). A throwaway recording and card are made with the service
// role and removed afterwards. Needs UNSPLASH_ACCESS_KEY on the deployment (Vercel env), not locally.
//
//   npx tsx --env-file=.env.local scripts/test-photo-live.ts [origin]   (default https://ivywolf-api.vercel.app)

import { createClient } from '@supabase/supabase-js'
import { oauthClient } from './lib/oauth-client'

const ORIGIN = process.argv[2] ?? 'https://ivywolf-api.vercel.app'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

let failed = 0
function check(name: string, pass: boolean, detail = '') {
  if (!pass) failed++
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const client = oauthClient(ORIGIN)
await client.signInReviewer()
const me = client.reviewer()!.userId
const { data: rec, error: rErr } = await db.from('recordings').insert({ creator_id: me, source: 'phone', storage_path: 'test/photo-live', status: 'done' }).select('id').single()
if (rErr) throw rErr
const { data: card, error: cErr } = await db
  .from('cards')
  .insert({ creator_id: me, recording_id: rec.id, title: 'Candle shop corner', gist: 'test', play_from_ms: 0, confidence: 0.9, shape: 'photo', shape_set_by: 'ivy', visual_query: 'candle jars on a wooden shelf' })
  .select('id')
  .single()
if (cErr) throw cErr

try {
  const res = await fetch(`${ORIGIN}/api/cards/${card.id}/photo`, { method: 'POST', headers: { Authorization: `Bearer ${await client.sessionJwt()}` } })
  const body = (await res.json()) as { photo?: boolean; error?: string }
  check('the route finds a photo', res.status === 200 && body.photo === true, `${res.status} ${JSON.stringify(body)}`)
  const { data: after } = await db.from('cards').select('shape, frame_url, frame_status, frame_attribution').eq('id', card.id).single()
  const a = after?.frame_attribution as Record<string, string> | null
  check('hotlinked from Unsplash, not re-hosted', !!after?.frame_url?.startsWith('https://images.unsplash.com/'), after?.frame_url ?? 'none')
  check('frame done, still a photo card', after?.frame_status === 'done' && after?.shape === 'photo', `${after?.frame_status} ${after?.shape}`)
  check('credit stored: photographer and both links with utm', !!a?.photographer && /utm_source=ivywolf&utm_medium=referral/.test(a.photographer_url ?? '') && /utm_source=ivywolf/.test(a.photo_url ?? ''), JSON.stringify(a))
  check('download_location kept (the event was sent)', !!a?.download_location?.startsWith('https://api.unsplash.com/photos/'), a?.download_location ?? 'none')
  const again = await fetch(`${ORIGIN}/api/cards/${card.id}/photo`, { method: 'POST', headers: { Authorization: `Bearer ${await client.sessionJwt()}` } })
  const { data: same } = await db.from('cards').select('frame_url').eq('id', card.id).single()
  check('asking again never replaces the photo', again.status === 200 && same?.frame_url === after?.frame_url)
} finally {
  await db.from('cards').delete().eq('id', card.id)
  await db.from('recordings').delete().eq('id', rec.id)
}
console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
