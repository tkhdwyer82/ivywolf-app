# Claude Code brief — Ivy Wolf app v1 build

**Repo:** `~/Developer/ivywolf-app` · **Spec:** `docs/IVYWOLF_AI_hero_handover_v1.md` (copy it in first) · **Design:** Figma *Ivy Ai Concepts*, page **Ai Hero · v1 build**, section node `83-1178` — https://www.figma.com/design/H9nRPbwfGDwkho3gacQT53/Ivy-Ai-Concepts?node-id=83-1178 · **Type styles:** page *Ai Hero*, node `60-18` (SF Pro).

Build only what is in the **"Build now"** row of that page. The "Later" row exists so nobody redesigns it; do not build it. Use the Figma MCP to read each frame (spacing, radii, type styles, colours) rather than working from this text.

## How to work

- One job at a time. Commit each. Stop and report after each, then wait.
- Migrations: write, test in a rolled-back transaction against the linked project, dry-run, push. Same standard as 0005–0010.
- Prompt versions ship by the ratchet in CLAUDE.md. `classify_v6` must fail no check `v5` passes.
- Never send data to an external tool without stopping first. fal.ai for frames is allowed once `FAL_KEY` is in `.env.local` (I'll add it).
- Rules that govern every screen (from the handover, §4): ⊕ listens and never asks; actions are verbs, tools are footnotes; a verb only when earned; Ivy speaks in My things and in one cited line elsewhere; summary is the heading, transcript behind •••; every card gets a frame (typographic fallback); to-dos → Reminders, timed ideas → Calendar; light rooms; My things and Ivy Mini are default projects.

## Job 1 — data (migrations 0011–0013)

- **0011 projects**: `projects(id, creator_id, name, is_default, kind text check in ('things','mini','user'), created_at)`; seed *My things* and *Ivy Mini* per creator on creator-row creation; `cards.project_id`, `threads.project_id`, `actions.project_id` (actions default to My things); RLS by creator. A resolver so every new card lands in a project: the classifier's candidate project if it matches by name, else My things.
- **0012 frames + style**: `cards.frame_brief text`, `cards.frame_url text`, `cards.frame_status text default 'none' check in ('none','queued','done','typographic','failed')`; same three on `actions`. `style_packs(id, creator_id, tone_words text[], palette text[], reference_urls text[], updated_at)`, one per creator, seeded `{warm, film grain, soft daylight}` and an ink/paper/lime palette. `creators.last_opened_at timestamptz`.
- **0013 connections**: `connections(slug pk, name, verb_line, what_it_does text[], privacy_line, sort_weight int, tile_url, hero_url, example_urls text[])` seeded with higgsfield, canva, figma, clickup, gamma (null images); `creator_connections(creator_id, slug, connected_at)`. Storage buckets `frames` and `connections`, public read, service-role write. Give me a one-line script `scripts/upload-connection.ts <slug> <tile> <hero> [examples…]`.

## Job 2 — classify_v6

Each card and action gains `frame_brief`: one literal, drawable sentence ("a carton of milk on a kitchen bench"), empty when the idea is abstract. Each card gains `candidate_project` (a name from the creator's project list, or null). Add both to the three eval expected files; run v5 and v6; ship v6 only if the ratchet holds. Do not touch thresholds.

## Job 3 — frames (do not let this slip)

`packages/pipeline/frames.ts`, called after graph writes: prompt = `frame_brief` + style pack tone words + palette; fal.ai `fal-ai/flux/schnell`, 3:4, one image; upload to `frames/<creator_id>/<card_id>.jpg`; set `frame_url`, `frame_status='done'`. Empty brief → `typographic` (app renders the title in the palette). Actions are cached by `(style_pack_id, normalised brief)` so "milk" is generated once per creator. Never people's faces, never a product likeness — briefs are illustrative. Log cost per frame. Failures set `failed` and never block the card.

## Job 4 — screens (Build now row, in this order)

Read each frame from Figma before writing it. Expo Router, existing theme file extended with the type styles from node `60-18`.

1. **Record** — existing screen; add a `projectId` param: when present, `recent_thread_titles` and the resolver are scoped to that project.
2. **Home (P1)** — masonry of cards + actions unioned, ordered by `recorded_at`, grouped by local day with dividers; project chips (All · My things · … · +) filter the query; profile avatar top-right (no menu yet); floating trio Home · ⊕ · Explore. Tile = `frame_url` or the typographic fallback. **Cold start:** zero cards → only the record prompt, never an empty grid. **Ivy on open:** compose ≤3 sentences from due-today actions, threads with `return_count ≥ 3`, cards with a new frame since `last_opened_at`; render at 17pt, fade the last sentence; write word-by-word pushing the grid down; dissolve after 8 s or on scroll, grid slides up (~400 ms ease-out); never stored; silent when nothing is new.
3. **Add to ideas (P2)** — home **+** opens a sideways row: Image · Video · Connect · File. Image/Video pick from the library, upload to storage, create a card with `source='import'` and a one-line "what's it for" prompt by voice. Connect shows the connections list read-only for now. File can be a stub.
4. **Idea (P9)** — visual (frame or typographic) with back/•••; heading; heart · mic (voice correction stub that records a note tagged to this card) · share; dark project button with ⌄ → Save to (P10); byline; More in this thread.
5. **••• menu (P6)** and **Transcript sheet (P7)** — transcript words coloured by segment type (card bold, loose end green, action orange, wake word grey).
6. **Save to (P10)** — picker with Top choices, Your projects, Create new project.
7. **My things (P4)** — From Ivy (merge suggestions + "you keep coming back"), To do with undo. No Loose ends section.
8. **To-do (P17)** + **Date sheet (P18)** — calendar icon only when `due_date` exists; sheet with Change date, Remind me, Add to Reminders (`expo-calendar`), Add to Calendar; `actions.synced_reminder_id`; local notification via `expo-notifications`.
9. **Project (P11)** — header actions, private chip, All ideas / More ideas tabs (More ideas = placeholder text), masonry, single **Talk to this project** pill → Record with `projectId`.
10. **Explore (P22)** — search over titles/gists; Ideas for you = tiles from her threads; Rising section = placeholder until the cohort exists.
11. **Phone capture stopgap** — Siri shortcut and lock-screen widget that open Record and start listening; document how to assign the Action button. Not part of the product story; pilot convenience only.
12. **First run** — three screens: what Ivy does · mic + notifications permission · the mic open. Ends on the mic.

## Job 5 — connections module (P15/P16)

Render on Home only when at least one `connections` row has a `tile_url`, and only for creators who have a thread with ≥1 framed card. Page from the row; **Connect** is a stub that records intent. Hidden otherwise. I'll add images with the upload script later.

## Definition of done

Typecheck, web build, iOS simulator and my phone; each screen visually compared to its Figma frame (screenshot both, note differences). A recording made on the phone appears on Home with a frame within a minute. Milk lands in My things with a date and a calendar icon. Cold start shows only the record prompt.
