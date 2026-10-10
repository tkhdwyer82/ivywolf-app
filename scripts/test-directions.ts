// scripts/test-directions.ts
// Job H directions (packages/pipeline/suggest), no network, no database:
//   npx tsx scripts/test-directions.ts

import { DirectionOutput } from '../packages/schema'
import {
  asks, citeLabel, isVerbatim, preferredForms, proposeDirections, shouldGenerate, similarTitles, validateDirections,
  MIN_CARDS, DEBOUNCE_MS, MAX_AGE_MS,
} from '../packages/pipeline/suggest'
import type { InputCard } from '../packages/pipeline/suggest/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const card = (over: Partial<InputCard>): InputCard => ({
  id: 'c0', title: 'Rooftop chase ending with Ivy Mini', gist: 'A performer leaps across rooftops.', form: 'board',
  said: 'so the idea is she runs across the rooftops at night and at the end she holds it up and says I have it',
  recording_id: 'r0', recorded_at: '2026-10-01T22:00:31Z', play_from_ms: 31_000, recording_source: 'phone',
  thread_returns: 3, pinned: false, hearted: false, context: [], source: 'voice', ...over,
})
const cards = [
  card({}),
  card({ id: 'c1', title: 'Unboxing videos with 20 creators', said: 'send twenty creators a box and film them opening it on the same day', form: 'board' }),
  card({ id: 'c2', title: 'We are the visual version of Granola', said: 'we are basically the visual version of granola', form: 'quote' }),
]
const dir = (over: Partial<DirectionOutput['directions'][number]>): DirectionOutput['directions'][number] => ({
  title: 'The chase from the ground', gist: 'Shoot the same rooftop chase from street level, looking up.', cite_card_index: 0,
  cite_quote: 'runs across the rooftops at night', format: 'board', stretch: false, visual_query: 'wet street, looking up, sodium light',
  board_hook: 'Look up', board_beats: ['Street', 'Leap', 'Hold it up'], quote_text: '', diagram_title: '', diagram_rows: [], ...over,
})
const profile = { kept: { board: 4, quote: 1 } }
const run = (ds: DirectionOutput['directions'], avoid: string[] = [], prof = profile) =>
  validateDirections({ directions: ds }, cards, cards.map((c) => c.title), avoid, prof)

async function main() {
// Schema
check('the output schema accepts a well-formed direction', DirectionOutput.safeParse({ directions: [dir({})] }).success)
check('the output schema refuses an unknown format', !DirectionOutput.safeParse({ directions: [dir({ format: 'gif' as never })] }).success)

// Cite on every direction
const ok = run([dir({})])
check('a good direction is kept, with its cited line', ok.kept.length === 1 && ok.kept[0].why.startsWith('from ') && ok.kept[0].why.includes('“runs across the rooftops at night”'), ok.kept[0]?.why)
check('the cite carries the card, recording and moment', ok.kept[0]?.cite_card_ids[0] === 'c0' && ok.kept[0]?.cite_recording_id === 'r0' && ok.kept[0]?.cite_ms === 31_000)
check('every kept direction has a cite', run([dir({}), dir({ title: 'Twenty boxes, one morning', cite_card_index: 1, cite_quote: 'film them opening it on the same day' })]).kept.every((d) => d.why && d.cite_card_ids.length === 1))
check('a misquote is dropped', run([dir({ cite_quote: 'sprints over the roofs at midnight' })]).dropped[0]?.reason === 'misquote')
check('a cite to no card is dropped', run([dir({ cite_card_index: 9 })]).dropped[0]?.reason === 'bad_cite')
check('verbatim ignores case and punctuation, needs 3+ words', isVerbatim('Runs, across the ROOFTOPS', 'she runs across the rooftops') && !isVerbatim('runs', 'she runs'))
check('the cite label is the day and moment', /^(Thu|Fri) 0:31$/.test(citeLabel('2026-10-01T22:00:31Z', 31_000)), citeLabel('2026-10-01T22:00:31Z', 31_000))
check('the cite label uses the recording’s zone', citeLabel('2026-10-01T22:00:31Z', 31_000, 'Australia/Sydney') === 'Fri 0:31')

// Never a duplicate of a card (fuzzy)
check('a reworded card title is dropped', run([dir({ title: 'Rooftop chase that ends with Ivy Mini' })]).dropped[0]?.reason === 'duplicates_card')
check('fuzzy match: same words, different order', similarTitles('Twenty creators unboxing videos', 'Unboxing videos with 20 creators') === true)
check('a genuinely new title isn’t a duplicate', !similarTitles('The chase from the ground', 'Rooftop chase ending with Ivy Mini'))
check('two directions can’t duplicate each other', run([dir({}), dir({ title: 'The chase from ground level' })]).kept.length === 1)

// Dismissed ones are not re-proposed
check('a dismissed direction isn’t proposed again', run([dir({})], ['The chase from the ground']).dropped[0]?.reason === 'was_dismissed')
check('nor a rewording of one', run([dir({ title: 'Chase seen from the ground' })], ['The chase from the ground']).dropped[0]?.reason === 'was_dismissed')

// Format follows the profile, at most one stretch
check('preferred forms come from the profile (kept + hearts + pins − dismisses)', preferredForms({ kept: { board: 4, quote: 1, photo: 1 }, dismissed: { photo: 2 } }).join() === 'board,quote')
const forms = run([
  dir({ title: 'Street-level chase', cite_quote: 'runs across the rooftops at night' }),
  dir({ title: 'A photo of the last roof', format: 'photo', cite_quote: 'holds it up and says I have it' }),
  dir({ title: 'Diagram of then and now', format: 'diagram', cite_card_index: 1, cite_quote: 'send twenty creators a box', diagram_rows: [{ from: 'a', to: 'b' }, { from: 'c', to: 'd' }] }),
])
check('one stretch is allowed, a second is dropped', forms.kept.filter((d) => d.stretch).length === 1 && forms.dropped.some((d) => d.reason === 'extra_stretch'), JSON.stringify(forms.dropped))
check('with no profile yet, any form is fine', run([dir({ format: 'photo' }), dir({ title: 'A diagram of the boxes', format: 'diagram', cite_card_index: 1, cite_quote: 'send twenty creators a box' })], [], {}).kept.length === 2)
check('a board carries its hook and beats', ok.kept[0]?.payload.board?.beats.length === 3)
check('a quote payload must be her words', run([dir({ title: 'Lead with the Granola line', format: 'quote', quote_text: 'we are the visual granola of things', cite_card_index: 2, cite_quote: 'the visual version of granola' })]).kept[0]?.payload.quote === undefined)

// Ivy never asks
check('a question is dropped', run([dir({ title: 'What if the chase ran backwards?' })]).dropped[0]?.reason === 'asks')
check('addressing her is dropped', asks('You could shoot it from the ground') && asks('Why not film it at dawn'))

// Pinterest guard
const pinCards = [card({ source: 'pinterest' }), ...cards.slice(1)]
let refused = false
try { await proposeDirections({ projectId: 'p', creatorId: 'u', name: 'Launch video', cards: pinCards, profile, avoid: [] }) } catch (e) { refused = /Pinterest/.test((e as Error).message) }
check('directions are never written from Pinterest data (a Pinterest card refuses before any call)', refused)
check('a direction carrying a pin link is dropped', run([dir({ gist: 'Like https://www.pinterest.com/pin/123/ but at night.' })]).dropped[0]?.reason === 'pinterest')

// Triggers: ≥ 3 cards; a change quiet 5 minutes; 24 h on open
const now = Date.parse('2026-10-09T12:00:00Z')
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()
check(`fewer than ${MIN_CARDS} cards: never`, !shouldGenerate({ directions_at: null, directions_stale_at: null }, 2, now))
check('never generated: yes', shouldGenerate({ directions_at: null, directions_stale_at: null }, 3, now))
check('a change 2 minutes ago: not yet (debounce)', !shouldGenerate({ directions_at: iso(3600_000), directions_stale_at: iso(2 * 60_000) }, 5, now))
check('a change quiet 5 minutes: yes', shouldGenerate({ directions_at: iso(3600_000), directions_stale_at: iso(DEBOUNCE_MS) }, 5, now))
check('no change, 23 h old: no', !shouldGenerate({ directions_at: iso(23 * 3600_000), directions_stale_at: null }, 5, now))
check('no change, 24 h old: yes', shouldGenerate({ directions_at: iso(MAX_AGE_MS), directions_stale_at: null }, 5, now))

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
