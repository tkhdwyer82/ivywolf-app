# Ivy Wolf — AI Hero handover v1.0

**Date:** 23 September 2026
**Scope:** Everything decided about the app's shape, screens and rules across the 22–23 Sept sessions, so the next chat can wire the pages up and start dropping images into Supabase without re-deriving any of it.
**Figma:** *Ivy Ai Concepts* — `H9nRPbwfGDwkho3gacQT53`, page **Ai Hero**.
**Repo:** `tkhdwyer82/ivywolf-app` (Expo iOS, Next.js web, Supabase `rfzwtvysonwuuylveavq` Sydney, Clerk). Pipeline shipping `classify_v5`, migrations 0001–0010 live.

---

## 1. The reference sheet

Pinned before anything: `IVYWOLF_customer_mindmap_v1.pdf`. Her in the middle. If a feature can't be drawn as a line from her to a moment she'd feel, it waits.

- **Magic moment (only thing to obsess over):** she rambles in the car; by the time she's parked, a card says what she meant, better than she said it; the errand is already in My things. Day-two habit. Granola can't be in the car.
- **Pay-offs, in order, none before the one above:** thread map → board in her style → "make videos from this" via tools → outcome writes back → shared style packs.
- **Don't build:** prompt bar, blank state, a menu behind the ⊕, meetings as the front door, tool links before a board exists, Rising before a cohort, hardware before the map.
- **Granola line:** *Granola is for the meeting you scheduled; Ivy is for the idea you didn't.* Granola's MCP is read-only; Ivy's reads **and acts**. Granola gives notes; Ivy gives frames.

## 2. Two nav concepts explored, one chosen

**Concept A — tab bar** (section *Ivy Wolf · Nav concept v1*, node `58-129`): Threads · Library · ⊕ · Boards · Rising, Higgsfield's bar, white, lime centre mic. Still valid as the *rooms*.

**Concept B — Pinterest-shaped** (section *Ivy Wolf · Pinterest-style concept v1*, node `65-2`): **this is the direction.** One scrolling home; projects as chips; floating trio. It feels unique and easy to navigate, and it makes Ivy read as a visual creator tool rather than a productivity app.

Resolution: **B's home + B's project pages; A's rooms (Rising, a Sessions player) reached from within.** No Boards tab — *a project has a board*. No separate Life tab — *My things is the default project*.

## 3. The screens (all in section `65-2`, left to right)

| # | Screen | What it settles |
|---|---|---|
| P1 | **Home · masonry** | Pinterest grid of cards; **day dividers** (Yesterday, Sunday); project chips top (All · My things · Launch video · … · +); chat icon top-right = My things; floating trio Home · ⊕ · Search |
| P2 | Create sheet | Long-press ⊕ only. Talk (lime) / Import / Project. A plain tap **just listens** |
| P3 | Note · summary + transcript | Early version; superseded by P5/P7 |
| P4 | **My things** | From Ivy (merge suggestions, "you keep coming back") · To do · Loose ends. The one room Ivy speaks in |
| P5 | **Idea (Granola-shape)** | Summary *is* the heading; share + ••• top; project chip; siblings "In this thread"; one Ivy line citing the graph; **Talk to this idea** bar (voice correction, not a prompt) |
| P6 | Idea · ••• menu | Edit idea / **View transcript** / Copy / Move to trash — transcript lives behind the menu, never on the page |
| P7 | **Transcript sheet** | Words coloured by what Ivy did: bold = card, green = loose end, orange = My things, grey = wake word. "Show your working" |
| P8 | Share sheet | Granola layout; first action = **Send board** |
| P9 | **Idea · pin page** ← chosen idea layout | Visual on top (back, •••, sparkle), heading below, heart · **mic** · share, dark **project button ⌄** (chevron = save elsewhere), byline, "More in this thread" |
| P10 | Save to project | Pinterest picker; Top choices; lime **Create new project** |
| P11 | **Project · All ideas** | = the boards view. Add-people/share/•••, Private chip, All ideas / More ideas tabs, masonry, floating bar **Organise · Board · More ideas · Talk · See all** |
| P12 | Project · More ideas | Rising scoped to one project: suggestions from other creators + her style board, with pin buttons |
| P13 | **Idea · suggested connections** | Chip top-left says what it *is* ("Video idea"), not the tool. Verbs below: Make a video (via Higgsfield, lime), 3 more frames (Ivy), Send to a brand (via Gamma). **A verb appears only once earned** (frame + hook + thread) |
| P14 | Idea · video came back | 3 takes on the idea, credits shown, **Post take 2** → Ivy marks shipped, **Again, warmer** by voice. The write-back loop |
| P15 | **Connections you might love** | Pinterest's stacked column inside the masonry: Higgsfield · Canva · Figma · ClickUp · Gamma, each with an Ivy-verb subtitle. Appears once a thread has frames; ranked by relevance to her graph. **Not an onboarding step** |
| P16 | Connection page (Higgsfield) | Hero, one-line promise, 3 checks, **previews built from her own ideas**, privacy line, lime Connect, quiet Not now |
| P17 | **To-do · calendar icon** | Same pin shape. Calendar icon with orange dot **only when Ivy heard a date** |
| P18 | Date sheet | "Ivy heard *for Thursday* at 0:31" + Hear it; Change date · Remind me · **Add to Reminders** (to-dos) · Add to Calendar (ideas with a time) |
| P19 | **Ivy Mini · session player** | Spotify-podcast shape: video/audio switch, live-notes caption bar, chapter-segmented scrubber, 1×/−15/play/+15/timer, clip/share/queue, **then the same project row (Ivy Mini ⌄)**, Read-along card |
| P20 | Session · chapters | Ivy-cut chapters; **⊕ saves a chapter as an idea** into a project |
| P21 | Chapter actions | Save as idea (Ivy suggests) · Clip for a Reel · Share · Make a frame · Add a date |

Also on the page: **Type guide · SF Pro** (node `60-18`) — 16 text styles; edit a style, every screen follows. SF Pro in the app, Fraunces only in marketing.

## 4. Rules that survived the whole exploration

1. **The ⊕ listens; it never asks.** Tap = mic. Long-press = Talk / Import / Project.
2. **Actions are verbs, tools are footnotes.** "Make a video" big; "via Higgsfield" small. Never a logo wall.
3. **A verb appears only when the idea has earned it.** Bare card → heading + project, nothing else.
4. **Ivy speaks in one room (My things) and in one line elsewhere, always citing a recording + time.**
5. **The summary is the heading; the transcript is evidence, behind •••.**
6. **Every card gets a frame in her style.** Colour block is the placeholder, never the destination. This moves image gen *up* the build order.
7. **To-dos → Reminders. Ideas with a time → Calendar.**
8. **Light rooms everywhere; Rising is the one dark room.** Ivy's lime is within a shade of Granola's — differentiation is what's *in* the rooms, not the paint.
9. **"My things" and "Ivy Mini" are default projects**, not tabs.

## 5. Data the screens need (for the wiring chat)

Already there: recordings, segments, cards (title, gist, play_from_ms, confidence, embedding), threads (purpose-named), actions (+ `due_date`, `recorded_tz`), loose_ends, entities, merge_suggestions, style_signals, `status`, deletion cascade, junk cleanup.

New, in likely order:
- **`projects`** table (creator_id, name, is_default, kind: `things|mini|user`), and `cards.project_id` / `threads.project_id`. Seed *My things* and *Ivy Mini* per creator. Chips = projects.
- **`cards.frame_url`** + a generation job (Nano Banana / Flux, cents each) → the masonry stops being colour blocks.
- **`connections`** table: `slug, name, verb_line, what_it_does[], privacy_line, sort_weight`; storage bucket `connections/<slug>/tile.jpg, hero.jpg, example-1..3.jpg`. P15/P16 become rows + images.
- **`creator_connections`**: which she's connected, tokens in Vault.
- **`actions.synced_reminder_id`**, local notifications (`expo-calendar`, `expo-notifications`).
- **Sessions**: `recordings.kind = session`, `chapters` table (recording_id, start_ms, end_ms, title), word timestamps already kept from Deepgram; clip export later.
- **Home query**: cards + actions unioned, ordered by recorded_at, grouped by local day, filtered by project chip.

## 6. Build order suggested by the screens

1. Projects + chips + masonry home with day dividers (P1) and the pin-style idea page (P9/P6/P7).
2. My things as a project (P4) + calendar/reminders (P17/P18).
3. Card frames — image gen on every card (unlocks the whole look).
4. Project page + board verb (P11), Save-to (P10).
5. Connections table/images + module + page (P15/P16); first live verb = Higgsfield (P13/P14).
6. Ivy Mini session player + chapters (P19–P21), gated on Mini hardware / DJI import.
7. Project "More ideas" = Rising, once the cohort exists (P12).

## 7. Still open (owner: Tim)

- Entity for the privacy page / App Store (Lumen Pty Ltd trading as Ivy Wolf?) — gates the deploy.
- Negative memo for CA2 experiment 3 (echo vs judgement).
- Pricing tiers; Renat's Phase 1 brief should now point at section `65-2`, not the tab-bar concept.
- Whether to nudge the lime away from Granola's.
