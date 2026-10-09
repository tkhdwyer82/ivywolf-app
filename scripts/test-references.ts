// scripts/test-references.ts
// Job H.0c references (packages/pipeline/references) and the Pinterest connector, no network:
//   npx tsx scripts/test-references.ts

import { randomBytes } from 'node:crypto'
import { contentWords, dedupe, findReferences, interleave, orientationFor, referenceQuery } from '../packages/pipeline/references'
import { pinReference, pinScore, pinterestReferences, type Pin } from '../packages/pipeline/references/pinterest'
import type { Reference, ReferenceProvider } from '../packages/pipeline/references/types'
import { generate } from '../packages/pipeline/generate'
import { refusePinterest } from '../packages/schema/pinterest'
import { writeStyleSignal } from '../apps/mobile/lib/styleSignals'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}
const throws = async (f: () => unknown) => {
  try {
    await f()
    return false
  } catch {
    return true
  }
}

const ref = (source: Reference['source'], id: string, url = `https://img.example/${source}/${id}.jpg`): Reference => ({
  source,
  id,
  thumb_url: url,
  full_url: url,
  link_url: `https://example/${source}/${id}`,
  credit: { name: source, url: 'https://example' },
  width: 600,
  height: 800,
})
const provider = (source: Reference['source'], refs: Reference[] | Error, available = true): ReferenceProvider & { calls: number } => {
  const p = {
    source,
    calls: 0,
    available: () => available,
    async find() {
      p.calls++
      if (refs instanceof Error) throw refs
      return refs
    },
  }
  return p
}

async function main() {
  // ── Query ──
  const card = { title: 'Rooftop chase ending with Ivy Mini', gist: 'A performer leaps across rooftops chased by bad guys and ends holding up Ivy Mini saying "I have it."', shape: 'photo' as const }
  check('title + gist → content words, quoted speech and stop words out', referenceQuery(card) === 'rooftop chase ivy mini performer leaps', referenceQuery(card))
  check('visual_query wins when the classifier gave one', referenceQuery({ ...card, visual_query: 'night rooftop city lights' }) === 'night rooftop city lights')
  check('names heard are stripped before the query leaves', !referenceQuery({ title: 'Arabella on the rooftop at night', gist: null }, ['Arabella']).includes('arabella'))
  check('capped at six words', referenceQuery({ title: 'one alpha beta gamma delta epsilon zeta theta iota', gist: null }).split(' ').length === 6)
  check('nothing left → empty query', referenceQuery({ title: 'the and of', gist: null }) === '')
  check('content words dedupe', contentWords('Rooftop rooftop ROOFTOP chase').join() === 'rooftop,chase')
  check('photo and text cards want portrait', orientationFor('photo') === 'portrait' && orientationFor('text') === 'portrait')
  check('boards and comparisons want landscape', orientationFor('board') === 'landscape' && orientationFor('diagram') === 'landscape')
  check('a quote takes either', orientationFor('quote') === 'any')

  // ── Interleave + dedupe ──
  const il = interleave([[ref('unsplash', '1'), ref('unsplash', '2'), ref('unsplash', '3')], [ref('pixabay', 'a')], [ref('pinterest', 'x'), ref('pinterest', 'y')]])
  check('interleaves one from each source in turn', il.map((r) => r.id).join() === '1,a,x,2,y,3', il.map((r) => r.id).join())
  const same = ref('pixabay', 'b', 'https://img.example/shared.jpg')
  const dd = dedupe([ref('unsplash', '1'), ref('unsplash', '1'), ref('unsplash', '9', 'https://img.example/shared.jpg'), same])
  check('dedupes the same id and the same image across sources', dd.map((r) => `${r.source}:${r.id}`).join() === 'unsplash:1,unsplash:9', dd.map((r) => r.id).join())

  // ── findReferences ──
  const u = provider('unsplash', [ref('unsplash', '1'), ref('unsplash', '2'), ref('unsplash', '3'), ref('unsplash', '4')])
  const px = provider('pixabay', [ref('pixabay', 'a'), ref('pixabay', 'b'), ref('pixabay', 'c'), ref('pixabay', 'd')])
  const out = await findReferences(card, { providers: { unsplash: u, pixabay: px, pinterest: provider('pinterest', [], false) } })
  check('default limit is 6, interleaved', out.map((r) => r.id).join() === '1,a,2,b,3,c', out.map((r) => r.id).join())
  const failing = await findReferences(card, { providers: { unsplash: provider('unsplash', new Error('503')), pixabay: px, pinterest: provider('pinterest', [], false) }, limit: 3 })
  check('a failing source is skipped, never fatal', failing.map((r) => r.id).join() === 'a,b,c', failing.map((r) => r.id).join())
  const onlyPix = await findReferences(card, { sources: ['pixabay'], limit: 2, providers: { unsplash: u, pixabay: px } })
  check('sources limits which run', onlyPix.every((r) => r.source === 'pixabay') && onlyPix.length === 2)
  check('an empty query asks nobody', (await findReferences({ title: 'the of', gist: null }, { providers: { unsplash: u, pixabay: px } })).length === 0)
  check('a card that came from Pinterest is never searched with', await throws(() => findReferences({ ...card, source: 'pinterest' }, { providers: { unsplash: u } })))

  // ── Pinterest degrades without the app secret ──
  const savedSecret = process.env.PINTEREST_APP_SECRET
  const savedId = process.env.PINTEREST_APP_ID
  process.env.PINTEREST_APP_ID = 'app-id'
  delete process.env.PINTEREST_APP_SECRET
  check('no app secret → the Pinterest source is unavailable, even with a token', !pinterestReferences('token').available())
  const web = await import('../apps/web/lib/pinterest')
  check('no app secret → the connector is unavailable (Connect shows "coming soon")', !web.available())
  check('no app secret → start refuses', await throws(() => web.authorizeUrl('user_x')))
  process.env.PINTEREST_APP_SECRET = 'test-secret'
  check('with the secret but no token → still skipped', !pinterestReferences(null).available())
  check('with the secret and her token → available', pinterestReferences('token').available())

  // ── The sealed state (callback authentication) ──
  const key = randomBytes(32)
  const sealed = web.sealState({ creatorId: 'user_a', verifier: 'v'.repeat(43), nonce: 'n', exp: Date.now() + 60_000 }, key)
  check('state opens with our key', web.openState(sealed, key)?.creatorId === 'user_a')
  check('state is unreadable without it (no creator id or verifier in the clear)', !Buffer.from(sealed, 'base64url').toString('latin1').includes('user_a'))
  check('another key can’t open it', web.openState(sealed, randomBytes(32)) === null)
  const tampered = Buffer.from(sealed, 'base64url')
  tampered[tampered.length - 1] ^= 1
  check('a tampered state is refused', web.openState(tampered.toString('base64url'), key) === null)
  check('an expired state is refused', web.openState(sealed, key, Date.now() + 11 * 60_000) === null)
  check('the PKCE challenge is S256 of the verifier', web.challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk') === 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  const auth = new URL(web.authorizeUrl('user_a'))
  check('consent URL: code flow, our redirect, read scopes, state, S256', auth.searchParams.get('response_type') === 'code' && auth.searchParams.get('redirect_uri') === 'https://app.ivywolf.com.au/api/pinterest/callback' && auth.searchParams.get('scope') === 'boards:read,pins:read' && !!auth.searchParams.get('state') && auth.searchParams.get('code_challenge_method') === 'S256')
  if (savedSecret === undefined) delete process.env.PINTEREST_APP_SECRET
  else process.env.PINTEREST_APP_SECRET = savedSecret
  if (savedId === undefined) delete process.env.PINTEREST_APP_ID
  else process.env.PINTEREST_APP_ID = savedId

  // ── Pins: unaltered, ranked locally ──
  const img = (w: number, h: number, size: string) => ({ url: `https://i.pinimg.com/${size}/a.jpg`, width: w, height: h })
  const pin: Pin = { id: '42', title: 'Rooftop at night', media: { media_type: 'image', images: { '150x150': img(150, 150, '150x150'), '400x300': img(400, 300, '400x300'), '600x': img(600, 900, '600x'), '1200x': img(1200, 1800, '1200x') } } }
  const pr = pinReference(pin, 'City nights')
  check('a pin uses only uncropped sizes (600x, 1200x), never 150x150 or 400x300', pr?.thumb_url.includes('/600x/') === true && pr?.full_url.includes('/1200x/') === true)
  check('a pin links to its pin page, credited to its board', pr?.link_url === 'https://www.pinterest.com/pin/42/' && pr?.credit.name === 'City nights')
  check('a pin with only crops is left out, not cropped', pinReference({ ...pin, media: { media_type: 'image', images: { '150x150': img(150, 150, '150x150') } } }, 'b') === null)
  check('a video pin is left out', pinReference({ ...pin, media: { ...pin.media, media_type: 'video' } }, 'b') === null)
  check('an image off Pinterest’s hosts is refused', pinReference({ ...pin, media: { media_type: 'image', images: { '600x': { url: 'https://evil.example/a.jpg', width: 1, height: 1 } } } }, 'b') === null)
  check('pins rank by shared query words (board name counts)', pinScore(pin, 'City nights', ['rooftop', 'night', 'city']) === 3 && pinScore(pin, 'Recipes', ['soup']) === 0)

  // ── Guards: a Pinterest reference is never an input ──
  const pinRef = pr!
  check('generate() refuses a Pinterest reference as an image', await throws(() => generate({ creatorId: 'x', model: 'kling-3.0-std-t2v', brief: 'a', refs: [{ kind: 'image', url: pinRef.full_url }] })))
  check('generate() refuses a Pinterest reference’s link in the brief', await throws(() => generate({ creatorId: 'x', model: 'kling-3.0-std-t2v', brief: `like ${pinRef.link_url}` })))
  check('style_signals: the shared guard refuses a Pinterest reference', await throws(() => refusePinterest('style_signals', pinRef.source, [pinRef.full_url])))
  let rpcCalled = false
  const fake = { rpc: async () => ((rpcCalled = true), { data: 1, error: null }) }
  const wrote = await writeStyleSignal(fake as never, 'reference_open', { source: pinRef.source, reference_id: pinRef.id })
  check('style_signals: the app’s writer drops a Pinterest reference without calling Postgres', wrote === 0 && !rpcCalled)

  if (failed) {
    console.error(`${failed} failed`)
    process.exit(1)
  }
  console.log('all passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
