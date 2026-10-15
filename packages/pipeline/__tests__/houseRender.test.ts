// Job B.4: the to-do house render — one fixed prompt, the brief as the noun, served at 256.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { housePrompt, nounOf, thumbOf } from '../houseRender'
import { withThumb } from '@ivywolf/schema/deletion'

test('the brief is the noun, without its article or full stop', () => {
  assert.equal(nounOf('A carton of milk on a kitchen counter.'), 'carton of milk on a kitchen counter')
  assert.equal(nounOf('the visa form'), 'visa form')
})

test('every to-do is drawn with the same prompt', () => {
  assert.equal(
    housePrompt('a canister of antibacterial wipes'),
    'one canister of antibacterial wipes, product-render style, soft studio light, pastel ground, slight tilt, no text, no people'
  )
})

test('the list serves the 256 copy; anything else as it is', () => {
  const big = 'https://x.supabase.co/storage/v1/object/public/frames/u/actions/house-abc-1-512.jpg'
  assert.equal(thumbOf(big), 'https://x.supabase.co/storage/v1/object/public/frames/u/actions/house-abc-1-256.jpg')
  const old = 'https://x.supabase.co/storage/v1/object/public/frames/u/actions/pack-abc-1.jpg'
  assert.equal(thumbOf(old), old)
})

test('deleting a render takes its 256 copy too', () => {
  assert.deepEqual(withThumb('u/actions/house-abc-1-512.jpg'), ['u/actions/house-abc-1-512.jpg', 'u/actions/house-abc-1-256.jpg'])
  assert.deepEqual(withThumb('u/cards/c1.jpg'), ['u/cards/c1.jpg'])
})
