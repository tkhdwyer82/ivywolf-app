// scripts/test-shapes.ts
// Job B revised: the invariants on shape_v1's output and the Unsplash helpers — no network, no database.
//
//   npx tsx scripts/test-shapes.ts
//
//   a quote must be copied from the segment (punctuation and case aside), or it's dropped
//   a diagram needs two rows, a board two beats, a photo a visual_query — else the card falls back to text
//   below LOW_CONFIDENCE every card is text, whatever the model picked
//   credit links carry utm_source=ivywolf&utm_medium=referral; photos near her palette score higher

import { shapeInvariants } from '../packages/pipeline/shape'
import { paletteDistance, score, withUtm } from '../packages/pipeline/unsplash'

let failed = 0
function check(name: string, pass: boolean, detail = '') {
  if (!pass) failed++
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const raw = (over: Partial<Parameters<typeof shapeInvariants>[0]>) => ({
  card_index: 0, shape: 'text' as const, visual_query: '', quote_text: '', quote_speaker: null, diagram_title: '',
  diagram_rows: [], board_hook: '', board_beats: [], ...over,
})
const SEG = 'Arabella said on the podcast, “we scaled the apology,” and honestly that’s the line.'

let s = shapeInvariants(raw({ shape: 'quote', quote_text: '"We scaled the apology."', quote_speaker: 'Arabella' }), 0.9, SEG)
check('a verbatim quote is kept, its outer quote marks trimmed', s.shape === 'quote' && s.quote?.text === 'We scaled the apology.' && s.quote.speaker === 'Arabella', JSON.stringify(s.quote))
s = shapeInvariants(raw({ shape: 'quote', quote_text: 'We scaled back the apology' }), 0.9, SEG)
check('a paraphrased quote is dropped and the card is text', s.shape === 'text' && s.quote === null, JSON.stringify(s))
s = shapeInvariants(raw({ shape: 'quote', quote_text: 'scaled the apol' }), 0.9, SEG)
check('a quote must be whole words', s.quote === null, JSON.stringify(s.quote))

s = shapeInvariants(raw({ shape: 'diagram', diagram_title: 'Old vs new', diagram_rows: [{ from: '5am', to: '7am' }] }), 0.9, SEG)
check('a one-row diagram is no diagram', s.shape === 'text' && s.diagram === null)
s = shapeInvariants(raw({ shape: 'diagram', diagram_title: 'Old vs new', diagram_rows: [{ from: '5am', to: '7am' }, { from: 'Daily', to: ' ' }, { from: 'Me', to: 'Box' }] }), 0.9, SEG)
check('a diagram keeps its complete rows', s.shape === 'diagram' && s.diagram?.rows.length === 2, JSON.stringify(s.diagram))

s = shapeInvariants(raw({ shape: 'board', board_hook: 'Open on the box', board_beats: ['Hook'] }), 0.9, SEG)
check('a one-beat board is no board', s.shape === 'text' && s.board === null)
s = shapeInvariants(raw({ shape: 'photo', visual_query: '  ' }), 0.9, SEG)
check('a photo needs a visual_query', s.shape === 'text')
s = shapeInvariants(raw({ shape: 'photo', visual_query: 'candle jars on a wooden shelf' }), 0.5, SEG)
check('below LOW_CONFIDENCE it is text, but the payloads stay for Change view', s.shape === 'text' && s.visual_query === 'candle jars on a wooden shelf')

check('credit links carry the utm', withUtm('https://unsplash.com/@ana') === 'https://unsplash.com/@ana?utm_source=ivywolf&utm_medium=referral')
check('…and keep an existing query', withUtm('https://unsplash.com/photos/x?a=1').endsWith('?a=1&utm_source=ivywolf&utm_medium=referral'))
check('a colour on the palette is distance 0', paletteDistance('#D8F27A', ['#d8f27a', '#000000']) === 0)
check('nearer her palette scores higher at equal likes', score({ color: '#3b2b22', likes: 10 }, ['#3b2b22']) > score({ color: '#7ad8f2', likes: 10 }, ['#3b2b22']))

console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
