# Home v4 — visual first (Job B.2)

Figma `H9nRPbwfGDwkho3gacQT53`, section 1737:2: H1 Home v4 (1737:5), H2 Explore v4 (1737:164); Explore feed 1464:5,
Pick an idea 1464:124; nav 1739:2–1739:14.

Home is her Pinterest: every idea is a picture with her words on it, errands are one row, one outside tile a day, flat
colour, and Explore is a nav tab.

## 1. Every idea carries a picture

`apps/mobile/lib/picture.ts` resolves a card's picture in this order:

1. **Her own picture.** This is an image she added with Add context (`card_context`, kind `image`, role `idea` or
   `both`, never `style` alone), an import's picture, or a take from the Create flow (`generation_runs` with status
   `completed` and an `output_url`). The newest one wins. Context images are signed from the private `context` bucket
   for an hour; takes come from the public `frames` bucket.
2. **The credited Unsplash photo** that Job B found (`frame_url` + `frame_attribution`). Its download event was sent
   when it was chosen (`packages/pipeline/frames.ts`).
3. **The reference picture** (`cards.reference_picture`, 0039). This is the first result of
   `findReferences(card, { limit: 1, sources: ['unsplash', 'pixabay'] })`, stored as
   `{source, id, url, thumb_url, link_url, credit, width, height, track_url?}`:
   - It is never Pinterest; a check constraint refuses it, because pins are never stored.
   - The image is hotlinked, not copied.
   - The pipeline fills it for new cards after frames (`packages/pipeline/references/picture.ts`, called from `finish()`
     in `process.ts`).
   - `scripts/backfill-reference-pictures.ts` fills it for existing cards.
4. **The project hue**, as a flat block. The title sits on the block (1737:140). While the card is under 5 minutes old,
   the meta says "finding a picture…".

### Forms on the picture (`components/IdeaTile.tsx`)

| Form | On Home |
|---|---|
| quote | The line in white Semibold 15/18 on a bottom scrim (clear to black 65 %). No title under it, only the meta. |
| board | A 3-up: its picture large on the left, and two more from its thread stacked on the right. Until its thread has three different pictures, just its own. |
| text, diagram | The picture as is, with the title under it. |
| photo | As is. |
| a Create take | Its first frame, muted and still, with "▶ 0:03". Video plays without being earned only on Explore. |

**Credit.** It is not drawn on the tile. A tap on the words under the picture shows "Photo by … on Unsplash" or
"Image by … on Pixabay". Tapping the name opens the source, and that counts as **use**: only then does an Unsplash
reference send its download event (`components/useOpenCredit.ts` → `POST /api/references/use`).

**The rhythm (1737:5).** These are measured values; no Figma variables are bound in the v4 frames, so they live in
`GRID` in `lib/home.ts`, not in the generated tokens.

| | Value |
|---|---|
| Picture height | 170 ± 45 (a stable jitter per id) |
| Picture → title | 8 |
| Title | Semibold 13 / 16, at most two lines |
| Title → meta | 3 |
| Meta | Regular 11, "0:31 · Restock Reel" |
| Meta → next tile | 18 |
| Columns | 170 at 393 wide |
| Gutter | 13 |
| Margins | 20 |
| Corners | 16 |

## 2. My things leaves the feed

To-dos no longer render as tiles (`feedItems()` in `lib/home.ts`). Instead, `components/MyThingsRow.tsx`
(Row/My things, 1737:129) sits at the top of All. It is cool-grey, 52 tall and radius 14, and reads
"My things / 3 today · milk · visa · wipes ›". Tapping it opens the My things list (`app/things.tsx`).

- **"Today"** counts her open to-dos that are due today, overdue, or undated, oldest first. Their first three are named.
- **Nothing due yet:** the line reads "N open".
- **No open to-dos:** the row is hidden.
- **The My things chip** still opens the full list.

## 3. Flat project hues, no gradients

`projects.hue` (0039) is one of coral, sage, butter or slate, plus cool-grey for My things:

- A trigger assigns it on insert, cycling in that order per creator.
- The migration backfills it in creation order.
- The colours are in `packages/ui/theme/hues.ts`:
  - Butter, slate and cool-grey are measured from 1737:140, 1737:75 and 1737:129.
  - Sage comes from the 83:397 blocks.
  - **Coral is unconfirmed:** v4 has no coral fill yet, so `#F2CFC2` is matched to the others' lightness. Swap it once
    Figma has one.

**Where the hue is used.** Text on a hue is always ink.
- The idea's fallback block.
- The selected chip's underline (ink under All).
- The project's swatch in Save to (`app/idea/save`).
- The bed of a non-photo idea on the idea page (CardFace).
- A direction on More ideas.

`packages/ui/theme/gradients.ts` is gone. `projects.gradient` (0034) stays in the database, unread.

**Shared card page.** `apps/web/components/shared-card.tsx` now draws on a flat neutral bed, because `shared_card()`
(0034) still returns the gradient name. Showing the hue there needs that function changed, which is a schema change
left for later.

## 4. Nav: four pills

Home · Explore · ⊕ · Mini (`components/Nav.tsx`, 1739:2–14):

- Each pill is 56 square at radius 16, 10 apart, centred.
- The selected room's glyph is solid ink (Home, Mini) or heavy (Explore's magnifier); unselected glyphs are outlines.
  The glyphs are the frame's own SVGs (`assets/figma/nav-*.svg`).
- The ⊕ is the only lime pill. Tap records; long-press offers Talk / Import / Project.
- Mini stays.

## 5. Explore

`app/explore.tsx` (`/explore`, from 1464:5) is a feed only:

- **Header:** "Explore", with "Turning ideas into masterpieces." under it.
- **Search:** "Search ideas and tools". Typing filters the tools; submitting, or the "Search your ideas for …" row,
  opens `/search?q=`.
- **Chips:** All, Video, Image, Edit, Thumbnail, Music, Deck.
- **Tool tiles** (`lib/explore.ts`):
  - Each tile loops its tool's official sample video, muted.
  - The files belong in `apps/mobile/assets/explore/<key>.mp4`, registered in `VIDEOS`. Until they're in, a tile shows
    its flat placeholder colour.
  - Live tools run through the gateway: today that's Kling 3.0, run by Higgsfield. They wear "Connected ✓"; everything
    else wears "Coming soon".
- **Tapping a live tool** opens **Pick an idea** (`components/PickIdeaSheet.tsx`, 1464:124), "Try Higgsfield on…":
  - Ideas with frames come first.
  - Continue says the tool page comes with Create and closes, because no tool page is built yet.
- **Nothing on Explore spends credits.**

## 6. A direction tile, one a day

`lib/directionOfDay.ts` picks the newest `suggestions` row with `kind = 'direction'` and `status = 'new'` across her
projects (`components/HomeDirectionTile.tsx`, 1737:152).

**How it looks.** It sits second in the feed (the right column of the first row), on All only:
- The lime "IVY · DIRECTION" pill.
- Its picture by rule 1. A direction has nothing of its own, so this is its first stock reference via
  `GET /api/references?suggestion_id=…&limit=1&sources=stock`, else its project's hue.
- Its title, then its cite line, "from Thu 0:31 · Restock Reel".

**What she can do with it.**
- Tap opens that project's More ideas (`/project/<id>?tab=more`).
- Hold offers Save (`save_direction`, which makes a real card) or Not this (`dismiss_direction`).

**Once a day.** Which direction is today's, and whether she's done with it, is stored on the phone in a small JSON file (the app's documents).
- The same direction stays all day, even if newer ones land.
- Once she saves it or says Not this, there's no direction tile until tomorrow.

## 7. Decks

An idea with at least one link (`card_links`) renders as a deck (`components/DeckTile.tsx`, Figma 1742:2):

- **Two visible at most.** The top card, and its first link peeking behind it: 6 up, 6 in from each side (158 of 170
  wide), at 70 %.
- **"🔗 N"** sits top right (#3380FF, Semibold 11 white, radius 12). On a hue block the title starts under it.
- **Swipe.** A horizontal swipe pages through its links inside the tile's own slot (1742:75); the slot clips, so the
  masonry never moves.
  - The links come newest first (`deckOf()` in `lib/home.ts`).
  - Dots show while it's off the top card, and the title and meta under it follow the page.
  - A tap opens the idea that's showing.
  - It uses Gesture Handler's ScrollView, which takes the sideways swipe inside the hold arc's detector and cancels
    the tap. React Native's own lost it to the tap.
- **Lines.** While a deck is being swiped or is off its top card, Home draws its lines to each linked idea on screen
  (`LinkLines` with a `paint`):
  - 3 wide, with 10 dots at the ends.
  - The active link's line is its project's hue at full colour; the others are at 25 %.
  - Full colours are in `hueLines` (`packages/ui/theme/hues.ts`). Coral's `#F5856B` is from 1743:14; the other four
    aren't drawn in the frames yet.
- **Chips.** Linked ideas appear under each other's project chips without changing `project_id`. Where an idea
  appears is derived from `card_links` (`appearsIn()`, `feedItems()`): its own project plus its links' projects.
  Under All each idea shows once.
- **Never decked:** errands (to-dos), tiles in the Pinned row, and tiles in link mode. A deck's own hold arc works as
  before, for its top card.

## 8. B.5 — header, chips, project on the tile, idea page

- **Chips** (`components/HomeChrome.tsx`): All and her projects, every chip ink #1D1D1F at 17 pt; the selected one
  has a 2-pt ink rule, the rest none (no grey, no hue underline). There is no My things chip.
- **Header**: My things moves to the logo row, left of search — `components/MyThingsIcon.tsx`, 28 pt, a ☰ in ink
  until the mascot asset lands. It opens `/things`.
- **No My things row.** In its place Ivy's line (`components/IvyNote.tsx`): when nothing is new since her last look,
  `thingsSentence()` says "13 things today · get some milk first" — her open to-dos due today, overdue or undated, and
  the oldest, cited to its recording (rule 2) — for 4 s, then it fades. Nothing on her plate: no line. Something new:
  Ivy on open (§ above) comes first, as before.
- **Project on the tile** (`ProjectOverlay` in `components/IdeaTile.tsx`): a card filed in one of her projects has a
  gradient on the picture's lower 40 % (ink 35 % → clear) and the project's name bottom-left, Semibold 13 white, 12 in,
  with a ›. The name opens `/project/[id]`; the rest of the tile opens the card; VoiceOver has "Open {project}" as an
  action. Unfiled cards (My things) have none, and neither do tiles on the project's own page. Home and search only.
- **Under the tile**: the title Semibold 15 (two lines) and the time alone, Regular 11 grey — the project left the
  meta (`ideaMeta`, `metaLine`).
- **Idea page** (`app/idea/[id].tsx`): the to-do page's layout since B.4 (1797:59) — picture full-bleed 393 × 440 (the
  card's picture by rule 1, else its hue), back · ♥ · Share · ••• over it; the title Bold 28; her words 17/24 (the
  card's segment, cut to its sentence; the gist when there's no recording); More in this thread. The grey summary
  block (the card face and byline) and the project pill are gone; Move to project sits under ••• beside Move to trash.

## Tests

- `apps/mobile/lib/__tests__/homeV4.test.ts`:
  - Picture resolution order, including that a Pinterest pin is never used.
  - My things row visibility and its line.
  - That to-dos never render as tiles.
  - The direction tile's once-a-day rule.
  - Explore's filter and Pick an idea's order.
  - Decks: a card linked across projects appears under both chips and once under All; appears-in is derived and
    project_id is unchanged; links page newest first; errands never deck.
- `apps/mobile/components/__tests__/Tile.test.tsx`: the v4 tile (picture, caption, credit on tap, quote on the
  picture, hue block) and B.5's project overlay (present when filed, absent unfiled or on the project page; the name
  opens the project, the rest the card).
- B.5: `components/__tests__/Chips.test.tsx` (ink chips, one underline, no My things), `IdeaPage.test.tsx` (no summary
  block or project pill; Move to project under •••), `lib/__tests__/homeB5.test.ts` (Ivy's things line, time-only
  meta).
- `scripts/test-0039.sql`, a rolled-back migration test:
  - Every project has a hue, and My things (and only My things) is cool-grey.
  - The backfill cycles coral, sage, … in creation order.
  - New projects take the next hues.
  - A Pixabay reference picture is accepted and a Pinterest one is refused.

## Not touched

The idea page, Create and More ideas are unchanged, apart from two things:
- Their beds are the flat hue instead of a gradient (rule 3).
- The project page opens on More ideas when it's given `?tab=more`.
