# Ivy Wolf — Job G: Pinterest rhythm + More ideas

**Date:** 29 September 2026
**Repo:** `tkhdwyer82/ivywolf-app` → `apps/mobile` (Expo iOS), Supabase `rfzwtvysonwuuylveavq`
**Figma:** *Ivy Ai Concepts* — `H9nRPbwfGDwkho3gacQT53`, page **Ai Hero · v1 build**
- Source of truth for sizes/type/icons: frame **Launch UI · metrics** (`206:26`) + variable collection **Ivy · metrics** + the 16 text styles + paint styles `Colour / …`
- Reference screen, fully bound to the tokens: **P12b Thread · More ideas (pushed) · bound** (`202:2`), section **v3.4 — More ideas, pushed** (`201:2`)
- **Copy from these finished screens (all bound to the tokens):**
  - Home → **L3b Home · card lands** (`209:2`)
  - Idea → **L4b Idea** (`209:36`)
  - Project · More ideas → **P12b** (`202:2`); Suggestion open → **P12c** (`201:69`); After pin → **P12d** (`201:85`)
  - The originals in Launch UI (`170:184`, `170:301`) are superseded for layout; their copy and flow still stand.
**Runs after:** Job B (frames). Without `cards.frame_url` this job produces grey shimmer, not Pinterest.
**Outcome:** one TestFlight build where Home and a project page read like Pinterest — big frames, no words on idea tiles — and a project's *More ideas* tab pushes five suggestions to a thread.

---

## 1. The rule this job implements (v3.4b)

**Ideas are looked at; to-dos are read.**
- Idea tiles and suggestion tiles are **frame only**: no title, no chip, no ••• on the tile. Tap opens the idea page, which has the heading, cite and verbs.
- The only tiles with text are **My things** tiles (to-dos): title + `My things · Thu` meta, calendar icon only when a date was heard.
- A suggestion differs from her own idea by **one small lime pin, bottom-right** (30pt). Nothing else.
- A card with no frame yet shows **Shimmer** (`#E6E6E8`, subtle sweep), never a colour block.
- Unchanged from v3.2: Ivy never asks (no "Are you interested?" banner) · never answers, acts or sells · never a Shop tile · one lime thing per screen.

## 2. Tokens (generate, don't hand-type)

Create `packages/ui/theme/metrics.ts` and `packages/ui/theme/type.ts` from the Figma values below. Keep the names identical to the Figma variables so the file and the design diff cleanly.

```ts
// metrics.ts — mirrors Figma collection "Ivy · metrics"
export const space  = { margin: 12, gutter: 8, stack: 16, section: 28 };
export const radius = { tile: 20, thumb: 18, chip: 14, button: 26, bar: 28 };
export const size   = { tileW: 181, thumb: 110, pin: 30, limeDot: 36, icon: 28, tap: 44, nav: 56, barH: 72 };
export const colour = { ink: '#1D1D1F', grey: '#6E6E73', lime: '#D8F27A', chip: '#F0F0F0', surface: '#FFFFFF', shimmer: '#E6E6E8' };
```

```ts
// type.ts — mirrors the Figma text styles (SF Pro; system font on iOS)
export const type = {
  titleScreen:  { size: 34, weight: '700' },   // project / idea heading
  titleSection: { size: 22, weight: '700' },   // "Your ideas", "More ideas for this thread"
  headingSmall: { size: 18, weight: '600' },   // tabs, chips row
  headingCard:  { size: 17, weight: '600' },   // to-do tile title, open-screen sub
  bodyLarge:    { size: 17, weight: '400' },
  body:         { size: 15, weight: '400' },   // caption under a tile
  bodyMedium:   { size: 15, weight: '500' },   // buttons
  bodySmall:    { size: 13, weight: '400' },   // meta, cite line
  caption:      { size: 13, weight: '400', colour: 'grey' },
  labelTab:     { size: 12, weight: '500' },   // action-bar labels
  labelPill:    { size: 11, weight: '500' },   // source chips — open screen only
};
```

Icons: SF Symbols via `expo-symbols`, names from the metrics frame — `chevron.left`, `magnifyingglass`, `plus`, `ellipsis`, `heart`/`heart.fill`, `square.and.arrow.up`, `mic.fill`, `house`/`house.fill`, `rectangle.portrait` (Mini), `calendar`, `xmark`, `arrow.right`, `checklist` (Organise), `sparkles` (Create), `ellipsis.circle` (See all). Header icons 28, nav 56, all hit areas ≥ 44.

Two columns at 393pt = `margin 12 + 181 + gutter 8 + 181 + 12`. On wider phones keep two columns and grow `tileW`; never three.

## 3. Screens

### 3.1 Home (copy `209:2`)
- Masonry: `FlashList`/`MasonryFlashList`, 2 columns, `gutter 8`, `margin 12`, `radius.tile`.
- Idea tile = `<Frame url={card.frame_url} />` or `<Shimmer />`. **No text.**
- To-do tile (`actions`) = frame-less card: `headingCard` title, `caption` meta (`My things · Thu`), calendar icon when `due_date`.
- Day dividers, project chips, Ivy's line on open — unchanged from Job B. Chips row uses `headingSmall`.
- Remove any per-tile title/timestamp rendering left from Job 4 (`Restock day — box tips over first · 0:31 · 2 cards`).

### 3.2 Idea page (copy `209:36`)
- Heading `titleScreen`, row **♥ · Share | project ⌄**, "More in this thread" thumbs at `size.thumb`/`radius.thumb`, floating bar `barH 72`/`radius.bar`, lime dot 36. Talk lime; Create only when earned.

### 3.3 Project page (P11) + **More ideas** tab — new
Reference `202:2`. Tabs **All ideas · More ideas** (`headingSmall`, 3pt underline).
- **Your ideas** — `titleSection` + horizontal strip of `thumb` squares (her cards in this project), arrow → All ideas.
- **More ideas for this thread** — `titleSection` + masonry of up to **5** suggestion tiles: frame + lime pin (30). Tap → 3.4. Long-press → hide (negative signal, no UI).
- Gate: tab visible only when the project has a thread with `returns ≥ 3`. Otherwise the tab doesn't render (not greyed).
- Refresh when the thread changes (new card in the thread, or a pin/dismiss). Never on pull-to-refresh alone.
- Action bar renders earned items only (Talk · Create at launch; More ideas appears with the tab).

### 3.4 Suggestion · open (P12c)
- Full-bleed visual, back, **×** top-right.
- Chip `labelPill`: `Near: <nearest card title>`.
- Heading `titleScreen` (22 on this screen), cite line `bodySmall grey`: `12× its channel average · @handle · Tue · 0:00–0:04`.
- One "why it fits" line (`body`) that cites **her** recording: `…you said "box tips over first" on Thu 0:31.` Tap → play from there.
- Verbs: **+ Pin to <project>** (lime, `radius.button`) · **Not for me** (chip). Footnote `Watch the original ↗` (opens source URL in SFSafariViewController; we never embed the video).
- No prompt bar, no share, no "shop".

### 3.5 After pin (P12d)
- Suggestion becomes a card in the project with `source` badge (`via YouTube · pinned just now`, `labelPill`, lime) shown **only on the idea page**, not on the tile.
- Ivy's one cited line on the project page: `From YouTube: one cut you pinned, near the rooftop chase · Tue 0:00` → dissolves per v3.2 rule 4.

## 4. Data

```sql
-- migration 0025
create table suggestions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id),
  project_id uuid references projects(id),
  thread_id uuid references threads(id),
  near_card_id uuid references cards(id),
  field text not null check (field in ('format','sound','aesthetic','topic','graph')),
  source text not null,                 -- 'youtube' | 'tiktok' | 'pinterest' | 'graph'
  source_url text,
  source_handle text,
  source_score numeric,                 -- e.g. 12.0 = 12× channel average
  title text not null,
  why text,                             -- one line, cites recording_id + ms
  why_recording_id uuid, why_ms int,
  frame_url text,
  rank int not null,
  status text not null default 'shown' check (status in ('shown','pinned','dismissed','hidden','expired')),
  created_at timestamptz default now(), acted_at timestamptz
);
create table suggestion_signals (
  id bigserial primary key,
  creator_id uuid not null, suggestion_id uuid not null references suggestions(id),
  signal text not null check (signal in ('pin','dismiss','hide','open','play_why')),
  created_at timestamptz default now()
);
alter table cards add column source text default 'voice';      -- 'voice' | 'muse' | 'youtube' | 'tiktok' | 'pinterest'
alter table cards add column source_url text, add column source_suggestion_id uuid;
```
- RLS: creator-scoped on both tables.
- **Pin** → insert `cards` row (`source`, `frame_url` copied, `project_id`, `thread_id`, `status = sparked`), `suggestions.status = pinned`, signal `pin`, `style_signals += {kind:'suggestion_pin', field, source}`.
- **Dismiss / hide** → status + signal + `style_signals += {kind:'suggestion_dismiss', field, source}`. Never re-shown.
- Seed: a `scripts/seed-suggestions.ts` that writes 5 rows per thread for the pilot creators from a JSON file. Adapters (YouTube Data API outlier score, TikTok Creative Center, Pinterest MCP trends) are **Job H**, not this job. Do not stub network calls into the app.

## 5. Build steps (one Claude Code job)

1. `theme/metrics.ts`, `theme/type.ts`; replace hard-coded sizes in `Home`, `Idea`, `Project`, `ActionBar`, `NavTrio` with tokens. Add `<Shimmer />`.
2. Home masonry: strip tile text from idea cards; keep it on to-do cards. Verify `cards.frame_url` renders; shimmer otherwise.
3. Migration 0025 + RLS + seed script.
4. Project page: tabs, Your ideas strip, More ideas masonry (gated), long-press hide.
5. Suggestion open screen; pin / not-for-me; after-pin card + Ivy line.
6. `suggestion_signals` → `style_signals` bridge (same function that handles take picks).
7. Tests: gate hides the tab below 3 returns; pin creates exactly one card with `source`; dismissed suggestion never returns; tile renders no text nodes for `kind = idea`.
8. `eas build --platform ios --profile preview` → TestFlight internal.

**Definition of done:** on Tim's phone, the Launch video project shows *More ideas* with five seeded tiles that look like Pinterest; pinning one lands a card with a *via YouTube* badge on its idea page and Ivy's line on the project page; Home shows no words on idea tiles and words on the milk.

## 6. Not in this job
- Live adapters (YouTube / TikTok / Pinterest) — Job H.
- Rising / other creators' outcomes — Later.
- Any suggestion that answers, acts or sells; any Shop tile; any "Are you interested?" banner.
- Three-column grids, tile captions on ideas, colour-block placeholders.

---

## Job G — as built (29 September 2026)

Branch `job-g-pinterest-rhythm` (PR against `main`, not merged). TestFlight build 6 is built from `a56c944`. The code
is on the branch; the database changes are already live (below).

### Decisions taken
- **Tokens:** `packages/ui/theme/metrics.ts` and `type.ts` are generated from `figma-tokens.json` (`npm run tokens -w @ivywolf/ui`). Keys are the Figma names exactly (`size['tile-w']`, `type['Title / Screen']`). Measured values that aren't tokens are named constants citing their Figma node.
- **Figma vs the brief:** the brief wins over P12c/P12d. Margin is 12, the tile width is derived from the screen (`(width − 24 − 8) / 2`; 181 × 2 + 28 is 394, not 393), idea tiles carry no title, and the "via …" badge appears only on the idea page. Shimmer uses the paint style `#E5E5E8`. `square.grid.2x2` is the More ideas icon (to be added to the metrics frame).
- **Home:** the IVY mark. Idea tiles are frame-only (shimmer until the frame lands); to-do tiles are frameless with a title, meta and calendar. Built on FlashList masonry. Unsure ideas are greyed, and "Ivy isn't sure" appears on the idea page only. The nav is one white pill with a lime ⊕.
- **Idea page:** the gist and the lime byline dot are gone. The meta line reads "Thu 0:31 · 2 cards · Launch video"; the thread pill reads "×N · Thu 0:31". Voice correction is the Talk verb in the action bar.
- **Action bars:** render only earned verbs. At launch the Project bar is More ideas (with the tab) plus Talk, and Idea is Talk only. Create is hidden until a Create flow exists; Organise and See all appear when earned.
- **More ideas:** a tab only when a thread in the project has `return_count ≥ 3` (the most-returned wins, then the most recent). Below that the tab row isn't drawn. It shows Your ideas (thumbs) and up to five suggestion tiles (frame plus lime pin); long-press hides one. Suggestions reload on focus, never on pull-to-refresh alone.
- **Suggestion open (P12c):**
  - the heading is `Title / Section` (22);
  - the cite line is score plus handle only (no source day or clip range until Job H);
  - back and × both return to the project;
  - "Watch the original" opens Safari's in-app view.
- **After a pin:** she returns to All ideas with Ivy's one cited line above the tabs, which dissolves per v3.2 rule 4. Own-graph pins keep `source = 'graph'`: provenance is the signal, and the badge reads "via More ideas".
- **Muse (MCP):** `list_ideas` and `get_idea` leave out pinned cards (by source). The change is not deployed; see follow-up #2.

### Schema deltas vs the brief (migrations 0028–0032, applied to production)
| Brief | As built |
|---|---|
| "migration 0025" | 0025–0027 were taken (Job F). Built as **0028** suggestions, suggestion_signals, style_signals and cards changes; **0029** `act_on_suggestion` (hide / dismiss); **0030** `pin_suggestion`; **0031** graph pins keep source; **0032** signals → style_signals bridge. |
| `creator_id uuid` | `text` (Clerk id), as `creators.id`, in all three new tables. |
| `add column cards.source` | It already existed (`voice \| import`). The check is widened to `voice \| import \| muse \| youtube \| tiktok \| pinterest \| graph`. `source_url` and `source_suggestion_id` are new. |
| Pin sets card `thread_id`, `status = sparked` | Cards have no thread or status. The card joins its thread through `thread_cards`; stage lives on `threads`. |
| — | `cards.recording_id` is nullable only for youtube / tiktok / pinterest cards (`cards_recording_unless_pinned`). Graph cards sit on the recording their why line cites. |
| Gate on `returns` | `threads.return_count ≥ 3` on a thread whose `project_id` is the project. |
| `style_signals += {…}` | New table `style_signals(id, creator_id text, kind, field, source, payload jsonb, created_at)`, written only through `write_style_signal(kind, payload)` (SQL; the app calls it via `lib/styleSignals.ts` `writeStyleSignal`; Job D uses the same function). Kinds: `suggestion_pin / _dismiss / _hide / _open / _play_why`. |
| — | Deleting a recording nulls a suggestion's `why` that quotes it (trigger). Status changes go only through the functions; she can insert `open` / `play_why` signals directly. |

Tests: `scripts/test-0028…0032.sql` (rolled back against the linked project; pre-push only, since they replay their migration), `npm test -w @ivywolf/mobile` (13), `.maestro/mini-to-home.yaml` and `.maestro/more-ideas.yaml`.

### Test account (fixture) and the DoD path
The simulator / test account `user_3JfYR4D8eJVCL3yieXStYYoqwaH` has:
- a **Launch video** project holding the thread "Rooftop chase ending with Ivy Mini" (`return_count` raised to 3) and its two cards;
- the five fixture suggestions from `scripts/seed/suggestions.fixture.json`. These are FIXTURE DATA: fake `@example-…` handles, `example.com` URLs, and solid-colour placeholder frames (`scripts/seed/frames/fixture-*.png`).

To reset: delete that account's suggestions (and any cards pinned from them), then
`npx tsx --env-file=.env.local scripts/seed-suggestions.ts scripts/seed/suggestions.fixture.json --write`.

### Open items
1. **Pilot seed JSON:** Tim's JSON of real suggestions for the pilot creators, in the `seed-suggestions.ts` format (`thread_id` or `thread_title`, five per thread, `frame_url` or `frame_file`). The fixture must never be used for pilots.
2. **Higgsfield stills:** real frames for the pilot suggestions (and for Tim's account) so the tiles look like Pinterest; until then those accounts aren't seeded.
3. **Job H adapters:** live YouTube outlier / TikTok Creative Center / Pinterest trends feeds that write `suggestions`. Also add `source_at timestamptz`, `clip_start_ms` and `clip_end_ms` so the cite line can show the day and clip range. The Muse follow-up (#2: pinned cards in list/search, cited by `source_url`) is Job F's.
