# More ideas: directions (Job H)

For a project, Ivy writes 3–5 **directions**. A direction is something her own cards point to that she hasn't said
yet: never a variant or a rewording of a card. Each has one cited line of her words and 3 references beside it. It's
free, automatic, and refreshed when the project changes.

Rules: never a blank screen; Ivy never asks; one cited line per direction; references steer and never become a frame;
nothing here spends credits.

## Generation (`packages/pipeline/suggest`)
- **Input:** the project's cards and the form profile. For each card: title, gist, form, her words (`said`, the
  segment), thread returns, pinned, hearted, and context notes. Also the last 10 directions she dismissed, and every
  card title (so it doesn't repeat them).
- **Prompt:** `prompts/direction_v1.md`. One call per project per trigger, on `claude-opus-5-5` with adaptive thinking
  and effort `high`. Its cost is logged in cents: about 4.6¢ per generation on the eval project.
- **Output:** up to 5 directions. Each has a title, a gist (≤ 2 lines), the card it cites and the words it quotes,
  a format (photo, quote, board, diagram, text or video), a `visual_query` saying what a reference should feel like,
  and the payload its form needs (a board's hook and beats, a quote, a comparison's rows).
- **Checks (`validate.ts`).** These are enforced whatever the model returns:
  - The quoted words must be in the cited card's `said`. The cited line, "from Thu 0:31: “…”", is built in code, not
    by the model.
  - Not a card title or a rewording of one (fuzzy match), not something she dismissed, and not a duplicate of another
    direction in the same set.
  - Never a question, and never addressed to her.
  - Follows the form profile: her top 2 forms by kept + 2·hearted + 2·pinned − 2·dismissed. At most one deliberate
    stretch outside them.
  - A board's or quote's payload must stand up, or it saves as text. A quote must be her words.
- **Ratchet:** the same pattern as classify and shape. `DIRECTION_VERSION` ships;
  `eval/direction-eval.ts [version] [runs]` scores the checks by pass rate over repeated runs.

## Triggers
- **What marks a project due.** 0038's triggers set `projects.directions_stale_at` when a card lands in the project,
  a card is pinned or hearted, or Link ideas joins two cards.
- **When it runs.** On project open, once the change has been quiet **5 minutes** (the debounce), or once the last
  generation is over **24 h** old. It needs at least 3 cards. Never on scroll.
- **How it runs.** `GET /api/projects/[id]/directions` returns the current directions straight away and rewrites them
  after responding (`next/server` `after()`). She sees the previous set until the new one lands; the open tab looks
  again twice, 25 s apart. Two opens can't both call the model: a run claims the project first.
- **No push.** There's no scheduler. Rewriting 5 minutes after a card lands, without an open, would need Vercel Queues
  or a cron.

## References
Each direction calls `findReferences({ title, gist, visual_query, shape }, { limit: 3 })` (H.0c) when the tab is
shown. They're live and never stored. Her pins are used only through `findReferences`, which keeps Pinterest's terms.
Opening an Unsplash reference sends its download event (`POST /api/references/use`), on use, never on display.

## Screen (Figma 165:423; tile styling 227:2)
- **Staged unlock.** The All ideas / More ideas tabs and the bar's **More ideas** verb appear once the project has 3
  cards. The bar is More ideas · Talk; Create joins with Job D.
- **The tile.** Each direction sits on the project's gradient (a direction has no frame):
  - the cite pill top-left, showing her words;
  - the title bottom-left;
  - a **lime + bottom-right**, which is Save and the screen's one lime thing. Talk loses its lime on this tab, and Ivy's
    dot turns grey.
  - Tap shows the gist.
- **References.** A 3-up strip under each tile. Tap one for its credit and a way to open the source. A Pinterest pin
  is shown whole, never cropped.
- **Hold → arc:** ♥ (Like) · Save · Link to… · Not this. There's no row of buttons on the tile.
  - **Save (+)** makes a real card in the project (`source 'direction'`): the cite carried over, the form and its
    payload kept, references dropped. It appears on Home.
  - **Not this** dismisses it for good, feeds the profile, and the next set avoids it.
  - **Link to…** saves it, then starts Link ideas from the new card.
- **Ivy's line on open.** For example "Three new directions, from your Mini and Tuesday's note." It's built from where
  the cited words were said, and dissolves.
- **No blank tab.** While the first set is being written, the tiles shimmer.
- **Job G.** Its thread suggestions (YouTube, TikTok, her notes) no longer show here. The rows and code are kept.

## Data (0038)
- **`suggestions`.** Directions are suggestions of kind `direction`, with `gist`, `cite_card_ids`, `format`,
  `visual_query`, `payload`, `generated_at`, `model_version` and `hearted_at`. The cite reuses 0028's `why`,
  `why_recording_id` and `why_ms`. Status is new, then saved / dismissed / expired; a new set expires the old unacted
  ones.
- **`projects`.**
  - `format_profile`: kept, hearted, pinned and dismissed counts per form over the last 90 days, recomputed by trigger.
  - `directions_stale_at` and `directions_at`: the generation clock.
- **Functions.** `save_direction`, `dismiss_direction` and `heart_direction`, each acting only on her own directions.
  Cards gain `source 'direction'`.

## Tests
- `npx tsx scripts/test-directions.ts`: 31 checks. Covers the schema, a cite on every direction, misquotes, no
  duplicates (fuzzy), dismissed ones not re-proposed, the profile and its one stretch, never asking, Pinterest (a
  Pinterest card refuses before any call; a pin link is dropped), and the trigger and debounce rule.
- `scripts/test-0038.sql`: rolled back against production, 14 checks. Covers save (form, payload, cite), video with no
  payload saving as text, dismiss, heart, the profile and the stale marking.
- `apps/mobile/components/__tests__/DirectionTile.test.tsx`: the pill, title and +; no button row; 3 references with
  Pinterest uncropped; tap for the gist.
- `eval/direction-eval.ts`: direction_v1 on the 3 eval memos as one project, 3 runs, every direction printed for a
  person to read. First run, 9 Oct 2026: 15 directions, every check 3/3, 13.92¢.

## H.1: next, not in H
- **Share to Ivy.** Links, Reels and TikToks she shares from other apps arrive as reference cards in a project, and
  directions can cite them ("From a Reel you shared · 20 Sep" in 165:423).
- **YouTube.** Her own channel's outliers and a watched video's beats as direction sources, cited by timestamp.
