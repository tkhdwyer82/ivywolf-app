// packages/pipeline/scripts/test-inspiration-api.ts
// Live checks for the inspiration demo against the TEST project (the unit tests in __tests__/inspiration.test.ts
// cover ranking, mixing and spacing on fixtures). Reads only, except one short-lived signed URL.
//
//   npm run test:inspiration -w @ivywolf/pipeline

import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  INSPIRATION_BUCKET, NEAR_DUPLICATE, PEOPLE, SIGNED_URL_SECONDS, cosine, inspirationDb, moreLikeThis, searchInspiration,
} from '../inspiration'

const db = inspirationDb()
let failures = 0
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`✔ ${name}`)
  } catch (e) {
    failures++
    console.log(`✖ ${name}\n    ${(e as Error).message}`)
  }
}

/** The JWT a Supabase signed URL carries, decoded (claims only; the signature is the server's business). */
const claims = (url: string) =>
  JSON.parse(Buffer.from(new URL(url).searchParams.get('token')!.split('.')[1], 'base64url').toString()) as { iat: number; exp: number }

const vec = (v: unknown): number[] => (typeof v === 'string' ? JSON.parse(v) : (v as number[]))

await check('search returns at most 24, each a photo or video with a signed URL', async () => {
  const items = await searchInspiration(db, { q: 'transparent earbuds', limit: 24 })
  assert.ok(items.length > 0 && items.length <= 24, `${items.length} items`)
  for (const i of items) {
    assert.ok(i.kind === 'photo' || i.kind === 'video', i.path)
    assert.match(i.url, /\/storage\/v1\/object\/sign\/inspiration-test\//)
    assert.ok(!('text_embedding' in i) && !('image_embedding' in i) && !('similarity' in i), 'no internals in the response')
  }
  const kinds = new Set(items.map((i) => i.kind))
  console.log(`    ${items.length} items: ${[...kinds].join(' + ')}; top: ${items.slice(0, 3).map((i) => i.path).join(', ')}`)
})

await check('an empty query still fills the page (the newest)', async () => {
  const items = await searchInspiration(db, { q: '', limit: 24 })
  assert.equal(items.length, 24)
})

await check('people= keeps only that value, and every value finds something', async () => {
  for (const people of PEOPLE) {
    const items = await searchInspiration(db, { q: 'earbuds', limit: 24, people })
    assert.ok(items.length > 0, `no ${people}`)
    assert.ok(items.every((i) => i.people === people), `${people}: ${items.filter((i) => i.people !== people).map((i) => i.path)}`)
    console.log(`    ${people}: ${items.length}`)
  }
})

await check('more like this excludes the item, holds the limit, and keeps near-duplicates apart', async () => {
  const { data: all, error } = await db.from('inspiration_items').select('id, path, image_embedding')
  if (error) throw new Error(error.message)
  const emb = new Map(all.map((r) => [r.id as string, vec(r.image_embedding)]))
  for (const item of all) {
    const more = (await moreLikeThis(db, item.id, 6))!
    assert.ok(more.length > 0 && more.length <= 6, `${item.path}: ${more.length}`)
    assert.ok(!more.some((m) => m.id === item.id), `${item.path} is in its own more`)
    const chain = [item.id, ...more.map((m) => m.id)]
    for (let i = 1; i < chain.length; i++) {
      assert.ok(cosine(emb.get(chain[i - 1])!, emb.get(chain[i])!) < NEAR_DUPLICATE, `${item.path}: near-duplicates at ${i}`)
    }
  }
  console.log(`    checked all ${all.length} items`)
})

await check('more like this for an unknown id is null (the route 404s)', async () => {
  assert.equal(await moreLikeThis(db, '00000000-0000-0000-0000-000000000000', 6), null)
})

await check(`signed URLs are issued for ${SIGNED_URL_SECONDS} s and open now`, async () => {
  const [item] = await searchInspiration(db, { q: 'phone', limit: 1 })
  const { iat, exp } = claims(item.url)
  assert.equal(exp - iat, SIGNED_URL_SECONDS)
  const res = await fetch(item.url)
  await res.arrayBuffer() // read every body, or the open sockets keep the process alive
  assert.equal(res.status, 200)
})

await check('a signed URL stops working once it expires', async () => {
  const { data: [row] } = await db.from('inspiration_items').select('path').limit(1) as { data: { path: string }[] }
  const { data, error } = await db.storage.from(INSPIRATION_BUCKET).createSignedUrl(row.path, 2)
  if (error) throw new Error(error.message)
  const before = await fetch(data.signedUrl)
  await before.arrayBuffer()
  assert.equal(before.status, 200, 'should open before expiry')
  await sleep(4000)
  const after = await fetch(data.signedUrl)
  await after.arrayBuffer()
  assert.notEqual(after.status, 200, 'still opens after expiry')
  console.log(`    after expiry: ${after.status}`)
})

console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exitCode = failures ? 1 : 0
