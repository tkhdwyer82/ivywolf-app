// scripts/test-gateway.ts
// Route choice in the generation gateway (packages/pipeline/generate), no network:
//   npx tsx scripts/test-gateway.ts

import { candidates, cheapest, MODELS, type Priced } from '../packages/pipeline/generate'
import type { Model } from '../packages/pipeline/generate/types'
import { credentials } from '../packages/pipeline/generate/routes/higgsfield'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

// A model with three routes: two serve its version, one an older one.
const model: Model = {
  key: 'x',
  label: 'x',
  kind: 'video',
  version: 'v2',
  defaults: { duration: 5 },
  routes: [
    { route: 'higgsfield', endpoint: 'hf/x', version: 'v2', body: (b, _r, p) => ({ prompt: b, duration: p.duration }) },
    { route: 'fal', endpoint: 'fal/x', version: 'v2', body: (b) => ({ prompt: b }) },
    { route: 'direct', endpoint: 'direct/x', version: 'v1', body: (b) => ({ prompt: b }) },
  ],
}
const all = () => true

const c = candidates(model, 'a brief', [], {}, all)
check('only routes serving the model version', c.map((x) => x.route).join() === 'higgsfield,fal', c.map((x) => x.route).join())
check('defaults reach the body', c[0].body.duration === 5)
check('params override defaults', candidates(model, 'a', [], { duration: 8 }, all)[0].body.duration === 8)
check('a route that is not live is skipped', candidates(model, 'a', [], {}, (r) => r !== 'higgsfield').map((x) => x.route).join() === 'fal')

const priced = (hf: number | null, fal: number | null): Priced[] => [
  hf === null ? { ...c[0], error: 'down' } : { ...c[0], estimate: { usd: hf, credits: null } },
  fal === null ? { ...c[1], error: 'down' } : { ...c[1], estimate: { usd: fal, credits: null } },
]
check('cheapest wins', cheapest(priced(0.5, 0.3))?.route === 'fal')
check('a tie goes to the first listed', cheapest(priced(0.3, 0.3))?.route === 'higgsfield')
check('an unpriced route is never chosen', cheapest(priced(null, 0.9))?.route === 'fal')
check('nothing priced → null', cheapest(priced(null, null)) === null)

// The registry: text-to-video takes no refs; Soul V2 takes a Soul ID and nothing else.
const soul = MODELS['soul-2']
const withChar = candidates(soul, 'a', [{ kind: 'character', ids: { higgsfield: '00000000-0000-0000-0000-000000000001' } }])
check('Soul V2 passes a Higgsfield character id', withChar[0]?.body.custom_reference_id === '00000000-0000-0000-0000-000000000001')
check('Soul V2 keeps strength above 0', (withChar[0]?.body.custom_reference_strength as number) > 0)
check('Soul V2 refuses an image URL ref rather than drop it', candidates(soul, 'a', [{ kind: 'image', url: 'https://x/y.jpg' }]).length === 0)
check('Kling text-to-video refuses refs', candidates(MODELS['kling-3.0-std-t2v'], 'a', [{ kind: 'image', url: 'https://x' }]).length === 0)
check('Kling defaults: 5 s, vertical', candidates(MODELS['kling-3.0-std-t2v'], 'a', [])[0]?.body.duration === 5)
check('every registry route serves its model version', Object.values(MODELS).every((m) => m.routes.every((r) => r.version === m.version)))

const id = '0b6f3c2a-1d4e-4f5a-9b8c-7d6e5f4a3b2c'
check('credentials: id:secret passes through', credentials(`${id}:s3cret`) === `${id}:s3cret`)
check('credentials: a label in front is dropped', credentials(`abcd:${id}:s3cret`) === `${id}:s3cret`)
check('credentials: whitespace trimmed', credentials(` ${id}:s3cret\n`) === `${id}:s3cret`)

if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('all passed')
