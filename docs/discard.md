# Discard (Job B.3)

Figma: section **1787:2**, "v4.2 — Discard" (file H9nRPbwfGDwkho3gacQT53).

| Frame | What it is | Built in |
|---|---|---|
| **D1** 1787:5 — Listening · × tapped | Nothing heard: × closes and deletes on the phone, no question, and Home shows a grey "Nothing saved" for 2 s (B.3.1 dropped the frame's under-5 s rule: any take with speech asks). Otherwise this sheet: "Stop and keep it, or throw it away?", "0:14 so far. Discarding deletes the audio now; nothing is written up.", Keep (lime pill, 52 high), Discard (red text). Swipe down = Keep. | `apps/mobile/app/record.tsx`, `lib/discard.ts` (`closeDecision`) |
| **D2** 1787:68 — Home just after stop | The toast 1787:142, "Writing it up…" + white Undo chip, for 6 s on the nav row. Undo cancels the pipeline, deletes the recording, spends nothing. | `components/UndoPill.tsx`, `lib/discard.ts`, `packages/pipeline/discard.ts` |
| **D3** 1787:149 — Once it's a card | No new UI: ••• → Move to trash (30 days, takes its audio and derived errands). | `lib/trash.ts`, `app/trash.tsx`, `packages/pipeline/trash.ts`, migrations 0040–0041 |

Rules (from the section): never "are you sure?" before there's something worth keeping; never delete audio without the
30-day trash once a card exists.

## Behaviour

- **Undo window.** The 6 s start when Home shows the pill, not at the tap on stop: saving can take seconds itself.
- **Trash unit.** Card-level `trashed_at`. Trashing one idea leaves the recording's other ideas alone; trashing its last
  idea carries the recording's to-dos with it (same timestamp), and restore brings exactly those back. Links and
  thread membership are hidden, not deleted.
- **Purge.** Vercel Cron, daily 03:17 UTC, `/api/cron/purge-trash` (CRON_SECRET): discarded takes; rows 30 days in the
  trash; a recording whole once every card and to-do from it has been in the trash 30 days. Files before rows.
- **Home tap.** Home in the nav while on Home: chip back to All, scroll to the top, animated, nothing reloaded. From
  another room it just switches.

## Not built from the frames

- **D2's shimmer slot** ("the card's slot shimmers while Ivy writes", 1787:138) — Home still shows nothing in that
  slot until the card lands.
- **D3's "Not this" on a card's hold arc.** The frame says the arc already has it; today only directions do (Like ·
  Save · Link to… · Not this). A card's arc is Like · Link ideas · Add context · Share, so trashing an idea is ••• →
  Move to trash only.
