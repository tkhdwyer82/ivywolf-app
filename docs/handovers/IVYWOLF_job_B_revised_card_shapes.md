# Ivy Wolf — Job B revised: card shapes, Unsplash photos with credit, Ivy's line

**Date:** 3 October 2026 · **Branch:** `job-b-revised-card-shapes` (from `job-g-pinterest-rhythm`; PR #3 still open)
**Brief:** Tim's message of 3 Oct (no separate doc). Photo spec = Job G.1 §1 (Unsplash lane + credit). Card shapes =
Figma `227:5` (section `227:2`, "v3.4 — Creator-first"). Ivy's line = Figma `162:2`. No generated images.

## As built

### Shapes — `shape_v1`, a second call after classify
- The brief said "the classifier returns `cards.shape`". Adding shape and its payloads to the classify schema made the
  structured-output grammar too large for the API ("The compiled grammar is too large"), even with flat fields. So
  shape is a **separate, small structured call** (`packages/pipeline/shape.ts`, prompt `prompts/shape_v1.md`) run on
  the cards classify made. **classify_v6 is unchanged** — no classify ratchet was needed. `recordings.meta` records
  `shape_version` beside `prompt_version`.
- It picks `photo | quote | diagram | board | text` and fills **every** payload the segment supports, so Change view
  has somewhere to go: `visual_query` (plain words), `quote` {text, speaker}, `diagram` {title, rows[from,to]},
  `board` {hook, beats}.
- Invariants (whatever the model says): a quote is copied word for word from the segment, otherwise it's dropped; a
  diagram needs ≥ 2 rows; a board needs ≥ 2 beats; a photo needs a visual_query; confidence < 0.6 → `text`. A shape
  without its payload → `text`. If the call fails, the cards are `text` and nothing is blocked.
- Board status pill = the thread's stage (`threads.stage`), read at render time, not stored.

### Photos — Unsplash (Job G.1 §1.2)
- `packages/pipeline/unsplash.ts`: search `orientation=portrait&content_filter=high&per_page=6`, score by palette
  distance to her style pack + log(likes), keep the best. **Hotlinked** (`frame_url` is the images.unsplash.com URL),
  `download_location` called once when set, credit stored in `cards.frame_attribution` with
  `utm_source=ivywolf&utm_medium=referral` on both links.
- Credit "Photo by <name> on Unsplash" is on the **tile** (per this brief, overriding G.1's "never on the tile") and
  on the idea page under the photo, where the name and "Unsplash" link back.
- A miss (nothing found, no query, search error) → the card becomes `text`, unless she chose photo herself.
- **No card frames are generated any more.** To-do frames (fal) are untouched; the to-do tile doesn't show them.
- An imported picture is a `photo` card and is never searched for or replaced.
- Not built from G.1: the `card_frames` carousel/alternates, the generated lane rewrite, header/nav changes.

### Migration 0033 (applied to production 3 Oct)
`cards.shape` (check), `shape_set_by` ('ivy' | 'creator'), `visual_query`, `quote`, `diagram`, `board` (jsonb),
`frame_attribution` (jsonb), and `cards_shape_has_payload`. G.1's brief numbered `card_frames` 0033; it takes the
next number when it's built. Cards from before 0033 have no shape: the app shows photo while a frame is (or may be)
coming, else text.

### App
- `components/CardFace.tsx` draws the five forms (Figma 227:5) for tiles and, large, the idea page. Corners use
  `radius/tile` like every Home tile (Job G: tokens over the frame's 14). The diagram arrow is the frame's SVG
  (`assets/figma/diagram-arrow.svg`).
- **Change view**: idea page ••• → an action sheet of the forms this card has words for (+ text). Her pick sets
  `shape_set_by = 'creator'` (the pipeline never overrides it) and writes a `shape_change` style signal. Photo on a
  card with no picture calls `POST /api/cards/:id/photo` (same Unsplash lane). Home tiles have no ••• (Figma S2's
  long-press menu is a later job).
- Quote ▶ chips play from `play_from_ms` on Home and on the idea page ("Mini · 12:40").
- Sibling thumbs (idea page) and the project's Your ideas strip show the title for cards with no picture.
- Job G's "no text on idea tiles" is superseded by 227:5 (photo tiles carry title + credit; the other forms are
  words by nature). Tile tests rewritten.

### Ivy's line (162:2)
Lime dot; written word by word with a lime caret; then the cite in grey (" · Thu 0:31") — tap the line to hear that
moment; dissolves after ~6 s (was 8) or on scroll, **words first, the timestamp last**. New cards since she last
looked are named by form, as 227:14: "A quote, a comparison, and the board is ready." ("From your Mini: …" when they
all came from one place). **Pace stays 220 wpm** — Tim set it on 23 Sep because 162:2's "≈40 wpm" was reading pace;
say if 162:2 should now win.

## Evidence
- Eval (`packages/pipeline/eval`, 3 rounds × 3 memos, `runs/repeat/*.classify_v6.shape_v1.run<n>.actual.json`):
  shape checks 11/11 scored (1 not scored: thomas-st round 1 had no card at 40.6 s); "visual queries name no one" 9/9.
  Every card in these memos is a launch-video idea and shape_v1 chose `board` for all of them (each label allows it).
  The other failures are classify_v6's, unchanged by this job: milton-st "one second" filler 1/3 (2/3 on 23 Sep),
  thomas-st card recall 2/3 and precision 2/3.
- Probe (synthetic, not in the eval set): a guest's line → quote (verbatim, speaker Arabella); "5am → 7am, daily →
  batch, me → box" → diagram; a candle shelf → photo; a hedged half-thought at 0.5 → text.
- `scripts/test-0033.sql` 7/7 (rolled back) · `scripts/test-shapes.ts` 12/12 · `npm test -w @ivywolf/mobile` 23/23 ·
  `scripts/test-photo-live.mts` 6/6 against production.

## Open items
1. **Add memos with quotes, comparisons and scenes** to the eval set — today it can't tell shape_v1 from "always board".
2. **Unsplash relevance:** the live test's "candle jars on a wooden shelf" got canned goods on wooden shelves — the
   palette term may outweigh the subject. Consider ranking by Unsplash's own order first, palette as a tie-break.
3. **Unsplash production access** before the pilot (demo key: 50 requests/hour; one per photo card).
4. `UNSPLASH_ACCESS_KEY` is set for **Production only** on ivywolf-api (not Preview), so preview API deployments
   can't find photos.
5. Build 6 (Job G) users see new non-photo cards as shimmer until they update — the old tile only knows frames.
