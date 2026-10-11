# Polish checklist

Finished UI details that a build must still have. Before every build (CLAUDE.md, "Branches and builds"), go down
this list on the build's code (in the simulator or by reading the code) and report anything missing before building.
Add a line each time a polish PR merges: what it is, how to spot it, and where it lives.

| Detail | How to spot it | Where |
|---|---|---|
| Collapsing Home header, ~120 pt delay | Scroll Home down slowly: the logo row stays put for about half a tile (120 pt), then slides up and fades; the chips ride up under the status bar. Scroll up a little anywhere in the feed and the logo row comes straight back. | `apps/mobile/components/CollapsingHeader.tsx` (`HIDE_AFTER = 120`, `SHOW_AFTER = 40`) |
| Opaque status-bar strip | With the header collapsed, no tile ever shows behind the clock or the Dynamic Island; the strip stays white. | `CollapsingHeader.tsx` (`statusStrip`) |
| "IVY" wordmark at weight 800 | Home's logo row reads **IVY** in capitals, heavier than any title on screen (not "Ivy Wolf"). | `apps/mobile/app/index.tsx` (`Wordmark`), `type['Title / Wordmark']` (26, 800) |
| Chips at 17 pt semibold | All · My things · projects are 17 pt semibold (Heading / Card), not the smaller Heading / Small; the selected chip is ink with a rule under it; there's no + chip. | `apps/mobile/components/HomeChrome.tsx` |
| Hold arc: blob, white-out and big label | Hold a card 0.35 s: the whole screen (header and nav too) whites out, the card lifts and tilts by column, the actions fan out around the thumb; slide over one and it swells and turns ink, and its name shows large in the empty half of the screen. (PR #12 — on main once merged.) | `apps/mobile/components/HoldArc.tsx`, `apps/mobile/lib/holdArc.ts` |
| Talk-only bar | A project page's bar is the lime Talk only (plus More ideas once the project has 3 cards); no Create. | `apps/mobile/app/project/[id].tsx` |
| Ivy's line only when something changed | Open Home twice with nothing new: no line the second time. Add a card, reopen: one line with its cite, which dissolves. | `apps/mobile/app/index.tsx` (`ivyOnOpen`) |
