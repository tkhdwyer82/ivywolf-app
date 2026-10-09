// scripts/test-gateway.ts
// Route choice in the generation gateway (packages/pipeline/generate), no network:
//   npx tsx scripts/test-gateway.ts

import { candidates, cheapest, defaultModel, MODELS, type Priced } from '../packages/pipeline/generate'
import type { Model } from '../packages/pipeline/generate/types'
import { credentials, dimensions, tokenPrice } from '../packages/pipeline/generate/routes/higgsfield'
import { aspectsOf, buildBrief } from '../packages/pipeline/generate/brief'

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
  tier: 'default',
  price: { usd: 0, for: '', source: 'provider', checked: '' },
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
  hf === null ? { ...c[0], error: 'down' } : { ...c[0], estimate: { usd: hf, credits: null, source: 'provider' } },
  fal === null ? { ...c[1], error: 'down' } : { ...c[1], estimate: { usd: fal, credits: null, source: 'provider' } },
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
let labelled = false
try { credentials(`abcd:${id}:s3cret`) } catch { labelled = true }
check('credentials: a label in front is refused, not sent', labelled)
check('credentials: whitespace trimmed', credentials(` ${id}:s3cret\n`) === `${id}:s3cret`)

// Seedance 2.5's estimate is a pricing description (2026-10-09 wording).
const SEEDANCE = 'For 16:9 video without video input, your request costs roughly $0.2056 per second of generated video at 480p, $0.4622 at 720p, and $1.1372 at 1080p. Each 1,000 video tokens costs $0.0214 at 480p or 720p and $0.0234 at 1080p. Billable video tokens = ceil(output height × output width × (input video duration + generated video duration) × 24 / 1024). Image and audio references do not count as video input.'
check('720p 9:16 is 720 × 1280', JSON.stringify(dimensions('720p', '9:16')) === JSON.stringify({ width: 720, height: 1280 }))
check('5 s 720p 9:16 Seedance ≈ $2.3112 (= its $0.4622/s)', tokenPrice(SEEDANCE, { duration: 5, resolution: '720p', aspect_ratio: '9:16' }) === 2.3112, String(tokenPrice(SEEDANCE, { duration: 5, resolution: '720p', aspect_ratio: '9:16' })))
check('1080p uses the 1080p rate', tokenPrice(SEEDANCE, { duration: 5, resolution: '1080p', aspect_ratio: '16:9' }) > 5)
let threw = false
try { tokenPrice('Something else entirely.', { duration: 5 }) } catch { threw = true }
check('unrecognised wording refuses to price', threw)

// Tiers: one default per kind; Seedance 2.5 is the default video, Kling 3.0 Standard fast.
check('Seedance 2.5 is the default video model', defaultModel('video').key === 'seedance-2.5-t2v')
check('Kling 3.0 Standard is fast', MODELS['kling-3.0-std-t2v'].tier === 'fast')
check('every model carries a reference price', Object.values(MODELS).every((m) => m.price.usd > 0))
check('exactly one default per kind', (['video', 'image'] as const).every((k) => Object.values(MODELS).filter((m) => m.kind === k && m.tier === 'default').length === 1))

// The brief: the idea wins on time of day, weather and light; the style pack fills the rest.
const TONE = ['warm', 'film grain', 'soft daylight']
const night = buildBrief({ idea: ['Rooftop chase ending with Ivy Mini, at night', 'A performer leaps across rooftops.'], tone: TONE })
check('night drops "soft daylight"', night.dropped.map((d) => d.word).join() === 'soft daylight', JSON.stringify(night.dropped))
check('night keeps the rest of the pack', night.kept.join() === 'warm,film grain')
check('the brief reads idea, then look', night.text === 'Rooftop chase ending with Ivy Mini, at night. A performer leaps across rooftops. Look: warm, film grain.', night.text)
const silent = buildBrief({ idea: ['Unboxing with 20 creators'], tone: TONE })
check('an idea that names none keeps the whole pack', silent.kept.length === 3 && silent.dropped.length === 0)
const rain = buildBrief({ idea: ['Street interview in the rain'], tone: ['sunny', 'film grain'] })
check('weather in the idea drops the pack’s weather', rain.dropped.map((d) => d.word).join() === 'sunny')
const neon = buildBrief({ idea: ['Neon-lit alley walk'], tone: ['soft daylight', 'warm'] })
check('light in the idea drops the pack’s light', neon.dropped.some((d) => d.word === 'soft daylight' && d.because.includes('light')))
check('whole words only: "Sunday" is not "sun…", "daytrip" not "day"', aspectsOf('Sunday daytrip').size === 0)

if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('all passed')
