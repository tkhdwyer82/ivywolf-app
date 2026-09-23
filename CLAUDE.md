# ivywolf-app — build notes for Claude Code

## What this is
The Ivy Wolf creator platform: voice in → cards → threads → boards. Mobile-first (Expo), Supabase behind it,
Claude for extraction, Deepgram for transcription. Scaffolded from gamesfield-app (auth, credits ledger,
adapter layer, feed tables, MCP server skeleton). Everything the creator sees is new.

## The one-line
The object is for thinking. The platform is for what you thought.

## Vocabulary (do not invent synonyms)
- **Recording** — one audio file from any source (phone, note taker, Mini, DJI import, reference clip).
- **Segment** — a span of a recording with one type: idea | action | entity | loose_end | reference | request | junk | retracted | filler.
- **Card** — one idea from one recording: title, gist, play_from_ms, confidence, energy. The atom.
- **Thread** — cards clustered across recordings. Lifecycle: sparked → developing → ready → shipped. The hero.
- **Board** — a thread rendered through a format + the creator's style pack. Beats, hooks, caption, actions.
- **Life** — the catch-all: actions (to-dos), people/places, loose ends. Also where Ivy speaks.
- **Rising** — private pilot feed of shared cards/formats/boards, ranked by remix velocity.

## Rules that shape every screen
1. No blank state — the first thing on screen is a thread, a board, or, before the first card exists, a single record prompt. Never an empty list.
2. Ivy speaks only from the graph — every sentence cites a recording + timestamp; never first; one turn, then an object; ≤10 s.
3. Visuals over text — cards, boards, even to-dos carry a frame. Cache common ones; generate only novel ones.
4. Integrations are verbs on a board (tools as footnotes). Home shows a verb only when a thread has earned it.
5. Three interaction models — scroll (Notes, Life, Rising), pan (Threads canvas), swipe (Boards filmstrip).
6. Open at the edges, owned in the middle — any mic in, any tool out via MCP; the graph is never exposed to a competitor's app.

## Pipeline invariants (CA1 — R&D core activity)
- Classify **per segment**, never per recording. Mixed content is the normal case.
- "wait, no, scrap that" → the retracted span is type `retracted` and never becomes a card.
- Explicit markers ("one second", "back to the idea") are strong segment boundaries.
- The wake word ("hey Ivy") is stripped and logged as `trigger=wake_word`.
- Duplicate ideas across recordings → propose a merge, never silently dedupe (CA2).
- No speech → `junk` (reason: no_speech). Recordings < 3 s → `junk` (reason: too_short). Never summarise junk.
- Confidence on every card. Below 0.6 the card is shown greyed with "Ivy isn't sure".
- Descriptions of people are rendered neutrally on cards ("the original performer").
- Entity names are canonicalised against the creator's people list (transcripts drift: Arabella → "Abela").
- A `request` segment is addressed to Ivy. Life-type requests route to the phone (Reminders); idea-type requests draft a board.

## Nav (Instagram layout)
Home=Threads · Explore=Rising · +=Record · Reels=Boards · Profile=Voice notes · top-right=Life (inbox).

## Stack
Expo (iOS first, web via RN Web later) · Next.js for marketing, admin, MCP server · Supabase (Postgres, storage, RLS) ·
Clerk · Vercel · Deepgram (nova, diarize, utterances) · Claude (structured output) · image gen via Higgsfield adapter.

## Repo layout
apps/mobile (Expo) · apps/web (Next.js) · packages/schema (zod types shared) · packages/pipeline · supabase/ · docs/

## Working agreements
- Weekly commit cadence aligned to ClickUp "Software platform" list; docs/ mirrored to the R&D Drive folder.
- Never store raw audio outside Supabase storage. Never send other creators' data to any adapter.
- Prompts live in packages/pipeline/prompts as versioned markdown. Shipping is a ratchet: a prompt version may ship if, on the
  eval set in packages/pipeline/eval, it fails no check that the current shipping version passes (both scored with the same
  scorer, expected.json and transcripts). A check that gives different results on repeated runs of the same version is
  scored by pass rate over 3 runs of each version; the candidate ships only if its pass rate on every such check is ≥ the
  shipping version's. Checks that don't vary stay single-run. `PROMPT_VERSION` in packages/pipeline/classify.ts records
  which version ships and what it was ratcheted over (method: docs/rnd/eval-method-repeat-runs.md).
- Run `supabase config diff` before `supabase config push` — push applies even when you answer "n" at its prompt.
- Third-party auth (Clerk) is set via the Management API (`/v1/projects/{ref}/config/auth/third-party-auth`), not config.toml — config push does not sync it.
