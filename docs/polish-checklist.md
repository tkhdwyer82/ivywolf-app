# Polish checklist

Finished UI details that a build must still have. Before every build (CLAUDE.md, "Branches and builds"), go down
this list on the build's code (in the simulator or by reading the code) and report anything missing before building.
Add a line each time a polish PR merges: what it is, how to spot it, and where it lives. Builds are listed at the end.

| Detail | How to spot it | Where |
|---|---|---|
| Collapsing Home header, ~120 pt delay | Scroll Home down slowly: the logo row stays put for about half a tile (120 pt), then slides up and fades; the chips ride up under the status bar. Scroll up a little anywhere in the feed and the logo row comes straight back. | `apps/mobile/components/CollapsingHeader.tsx` (`HIDE_AFTER = 120`, `SHOW_AFTER = 40`) |
| Opaque status-bar strip | With the header collapsed, no tile ever shows behind the clock or the Dynamic Island; the strip stays white. | `CollapsingHeader.tsx` (`statusStrip`) |
| "IVY" wordmark at weight 800 | Home's logo row reads **IVY** in capitals, heavier than any title on screen (not "Ivy Wolf"). | `apps/mobile/app/index.tsx` (`Wordmark`), `type['Title / Wordmark']` (26, 800) |
| Chips at 17 pt semibold | All and her projects are 17 pt semibold (Heading / Card), not the smaller Heading / Small; since B.5 all ink, the selected one with a 2-pt ink rule (row 21); there's no + chip. | `apps/mobile/components/HomeChrome.tsx` |
| Hold arc: size, blob, white-out and big label | Hold a card 0.35 s: the whole screen (header and nav too) whites out (white at 0.85), the card lifts 5% and tilts 2.5° (left column anticlockwise, right clockwise), and the actions fan out on a 78 pt radius around the thumb, 40° apart: 48 pt buttons with 24 pt icons (SF Symbol size 30; size 24 only draws 19 pt). Slide over one and it swells to 1.2× and leans 15 pt outward (from 70 pt away), turns ink, and its name shows large (Title at 40) in the empty half of the screen. Near an edge the arc turns, then shrinks toward 66 pt, rather than squeezing its spacing. | `apps/mobile/components/HoldArc.tsx` (`WHITE`, `TILT`, `ICON`, `LABEL`), `apps/mobile/lib/holdArc.ts` (`ARC`, `BLOB`) |
| Talk-only bar | A project page's bar is the lime Talk only (plus More ideas once the project has 3 cards); no Create. | `apps/mobile/app/project/[id].tsx` |
| Ivy's line only when something changed | Open Home twice with nothing new: no line the second time. Add a card, reopen: one line with its cite, which dissolves. | `apps/mobile/app/index.tsx` (`ivyOnOpen`) |
| Every idea is a picture (v4) | On Home every idea tile is a picture at radius 16, 170 wide with 13 between columns and 20 margins: her own, else Unsplash, else a reference, else a flat project-hue block with the title on it and "finding a picture…" while new. Title Semibold 13 eight under the picture, meta Regular 11 three under that. Quotes sit on the picture in white; a Create take shows its still and "▶ 0:05" and never plays; tap the words under a picture for its credit. | `apps/mobile/components/IdeaTile.tsx`, `apps/mobile/lib/picture.ts`, `GRID` in `lib/home.ts` |
| No gradients | Nowhere in the app is a card, direction or swatch a gradient: flat hues (coral, sage, butter, slate; My things cool-grey), ink text on every one. | `packages/ui/theme/hues.ts`, `projects.hue` (0039) |
| No to-do tiles on Home | Home has no to-do tiles. Since B.5 there's no My things row either: My things is the header's ☰ (row 22). | `lib/home.ts` (`feedItems`) |
| Four-pill nav | Home · Explore · ⊕ · Mini, 56 square, 10 apart, centred; only the ⊕ is lime; the selected room's glyph is solid (Explore's magnifier heavy). | `apps/mobile/components/Nav.tsx` |
| Explore tab | Explore: header and line, "Search ideas and tools", chips, tool tiles with "Connected ✓" (Kling 3.0) or "Coming soon"; tapping a live tool opens "Try Higgsfield on…" and nothing spends. | `apps/mobile/app/explore.tsx`, `lib/explore.ts` |
| One direction a day | Second tile on All: lime "IVY · DIRECTION", its picture or hue, title and "from Thu 0:31 · Project"; tap opens More ideas; Save or Not this and no other direction shows until tomorrow. | `apps/mobile/components/HomeDirectionTile.tsx`, `lib/directionOfDay.ts` |
| Decks | An idea with a link shows a second card peeking 6 above it at 70 % and "🔗 N" top right; swipe it sideways and its links page inside the tile, with dots, and a line to each linked idea on screen — the active one in its project hue, the rest faint. A linked idea also shows under the other project's chip. | `apps/mobile/components/DeckTile.tsx`, `deckOf` / `feedItems` in `lib/home.ts` |
| × on the listening screen (Figma 1787:5, D1; B.3.1) | Say nothing and tap ×: it closes, nothing in Voice notes, and Home shows a grey "Nothing saved" for 2 s. Say anything, however short, and tap ×: the take pauses and a sheet asks "Stop and keep it, or throw it away?" with "0:04 so far. Discarding deletes the audio now; nothing is written up." — Keep a lime pill, Discard red text under it; swiping or tapping the sheet away is Keep. | `apps/mobile/app/record.tsx`, `lib/discard.ts`, `components/UndoPill.tsx` |
| Writing it up… · Undo (Figma 1787:142, D2) | Stop a voice take: once Home is back, a dark pill sits on the nav row — "Writing it up…" and a white Undo chip — for 6 s. Undo: the pill goes and the take never turns up, in Home or Voice notes. | `components/UndoPill.tsx`, `lib/discard.ts` |
| Home tap on Home | On the Launch video chip, scroll down, tap Home: the chip goes back to All and the list glides to the top. No spinner, no reload. From Explore or Mini, Home just switches. | `lib/backToTop.ts`, `components/Nav.tsx` |
| Trash, 30 days | Move an idea to the trash: it's gone from Home, its project, search and its links; Voice notes → Trash lists it with "Deletes in 30 days" and Restore, which brings it back with its links. | `lib/trash.ts`, `app/trash.tsx`, 0040 |
| My things v4.6 (Figma 1797:5, M1; 1797:97, M3) | From Ivy is one lime row. To-dos are Pinterest rows: a 64 square picture radius 14 (its frame, else the project's hue), one line of Semibold 17 with an ellipsis, Regular 13 grey meta "Today 7:40 · Home" (no work/personal), the 24 tick (stroke #C7C7CC) on the right, every 88. Overdue: the whole meta red, "Overdue · Wed 30 Sep · Home". Groups TODAY, YESTERDAY, a day each for the past week (WED 30 SEP), then WEEK OF …, Semibold 10 grey. Tick: the row fades to 40 % in place with "Done · Undo" for 6 s, then drops into DONE at the bottom ("N this week"), picture kept. | `apps/mobile/app/things.tsx`, `lib/things.ts` (`groupTodos`, `metaLine`), `lib/ticks.ts` |
| To-do card page (Figma 1797:59, M2) | Tap a My things row: its picture full-bleed 440 high with a white back circle, an ink Share pill and a white ••• over it; the to-do in Bold 28; her words as a quote, Regular 17/24; then a lime Done (281 × 52) and a white ✦ circle labelled Muse (opens the share sheet for now). No chips, no project button, no Ivy line; Date, Like, Correct by voice and Move to trash are under •••. | `apps/mobile/app/todo/[id].tsx` |
| Chips: ink, one underline (B.5) | All · her projects, every chip ink #1D1D1F at 17 pt — no grey; the selected one has a 2-pt ink rule under it, the rest none. No My things chip. | `apps/mobile/components/HomeChrome.tsx` (`ProjectChips`) |
| My things in the header; Ivy's line (B.5) | Home's logo row reads My things · search · avatar; My things (Ivy since B.6, row 25) opens My things. No blue My things tile: in its place Ivy writes "13 things today · get some milk first" with her lime dot, holds it 4 s, then it fades and the grid slides up. Nothing on her plate today: no line. Something new since her last look: that line comes first instead. | `components/MyThingsIcon.tsx`, `app/index.tsx`, `thingsSentence` in `lib/home.ts`, `components/IvyNote.tsx` |
| Project on the tile (B.5) | On Home and in search, a card filed in a project has a gradient on the picture's lower 40 % (ink 35 % → clear) and "Launch video ›" bottom-left in Semibold 13 white, 12 in. Tap the name: the project page; tap elsewhere: the card. A My things (unfiled) card has none; nor do tiles on a project's own page. Under the tile: the title Semibold 15, two lines, and the time alone in grey ("0:31"). | `components/IdeaTile.tsx` (`ProjectOverlay`), `components/Tile.tsx` |
| Idea page like the to-do page (B.5) | Open an idea: the full-bleed slot (440 high) holds its form — a photo card's picture (else its project's hue) with an Unsplash credit under it; a quote large on its hue with the ▶ chip; a text card's title and gist on its hue; a board's 3-up grid once its thread has three pictures, else its hook and beats — with back, ♥, an ink Share pill and ••• over it. Change view under ••• changes the page and the tile. Then the title Bold 28; her words in quotes, 17/24 (tap to hear them); More in this thread. No grey summary block, no project pill; ••• has Move to project beside Move to trash. | `apps/mobile/app/idea/[id].tsx` (CardFace, ThreeUp), `said` in `lib/idea.ts` |
| Ivy as My things (B.6) | Cold-open the app: left of search, Ivy plays once in her 44 pt slot (3 s, no stutter), then holds still. Go to My things and back, or background and resume: she stays still. Reduce Motion on: still from the start. Tap anywhere on her: My things; VoiceOver reads "My things". | `components/MyThingsIcon.tsx`, `assets/mascot/` |

## Builds

Every TestFlight build, newest last. TestFlight can't show the preview label, so this list is how builds are told
apart. `scripts/build-ios.sh` prints the line to add after each build.

| Build | Branch | Commit |
|---|---|---|
| 13 | main | 6c105ef |
| 14 | PREVIEW: home-hold-arc | e0a9df4 |
| 15 | PREVIEW: home-hold-arc | 5a2b9cc |
| 16 | main | 372cc8c |
| 17 | main | b55d7bf |
| 18 | main | 80de749 |
| 19 | main | 237f172 |
| 20 | main | c02b2cc |
| 21 | main | ee08242 |
| 22 | PREVIEW: job-b10-recipes | efabad6 |
| 24 | PREVIEW: job-b10-recipes (local) | c16df9c |
