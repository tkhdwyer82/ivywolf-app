# Polish checklist

Finished UI details that a build must still have. Before every build (CLAUDE.md, "Branches and builds"), go down
this list on the build's code (in the simulator or by reading the code) and report anything missing before building.
Add a line each time a polish PR merges: what it is, how to spot it, and where it lives. Builds are listed at the end.

| Detail | How to spot it | Where |
|---|---|---|
| Collapsing Home header, ~120 pt delay | Scroll Home down slowly: the logo row stays put for about half a tile (120 pt), then slides up and fades; the chips ride up under the status bar. Scroll up a little anywhere in the feed and the logo row comes straight back. | `apps/mobile/components/CollapsingHeader.tsx` (`HIDE_AFTER = 120`, `SHOW_AFTER = 40`) |
| Opaque status-bar strip | With the header collapsed, no tile ever shows behind the clock or the Dynamic Island; the strip stays white. | `CollapsingHeader.tsx` (`statusStrip`) |
| "IVY" wordmark at weight 800 | Home's logo row reads **IVY** in capitals, heavier than any title on screen (not "Ivy Wolf"). | `apps/mobile/app/index.tsx` (`Wordmark`), `type['Title / Wordmark']` (26, 800) |
| Chips at 17 pt semibold | All · My things · projects are 17 pt semibold (Heading / Card), not the smaller Heading / Small; the selected chip is ink with a rule under it; there's no + chip. | `apps/mobile/components/HomeChrome.tsx` |
| Hold arc: size, blob, white-out and big label | Hold a card 0.35 s: the whole screen (header and nav too) whites out (white at 0.85), the card lifts 5% and tilts 2.5° (left column anticlockwise, right clockwise), and the actions fan out on a 78 pt radius around the thumb, 40° apart: 48 pt buttons with 24 pt icons (SF Symbol size 30; size 24 only draws 19 pt). Slide over one and it swells to 1.2× and leans 15 pt outward (from 70 pt away), turns ink, and its name shows large (Title at 40) in the empty half of the screen. Near an edge the arc turns, then shrinks toward 66 pt, rather than squeezing its spacing. | `apps/mobile/components/HoldArc.tsx` (`WHITE`, `TILT`, `ICON`, `LABEL`), `apps/mobile/lib/holdArc.ts` (`ARC`, `BLOB`) |
| Talk-only bar | A project page's bar is the lime Talk only (plus More ideas once the project has 3 cards); no Create. | `apps/mobile/app/project/[id].tsx` |
| Ivy's line only when something changed | Open Home twice with nothing new: no line the second time. Add a card, reopen: one line with its cite, which dissolves. | `apps/mobile/app/index.tsx` (`ivyOnOpen`) |

## Builds

Every TestFlight build, newest last. TestFlight can't show the preview label, so this list is how builds are told
apart. `scripts/build-ios.sh` prints the line to add after each build.

| Build | Branch | Commit |
|---|---|---|
| 13 | main | 6c105ef |
| 14 | PREVIEW: home-hold-arc | e0a9df4 |
| 15 | PREVIEW: home-hold-arc | 5a2b9cc |
| 16 | main | 372cc8c |
