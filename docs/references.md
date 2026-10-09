# References (Job H.0c)

`findReferences(card, { sources, limit })` in `packages/pipeline/references` returns a small set of free visual
references for More ideas to show beside a suggestion. **References steer. They are never a frame, a take or a
generation input,** and nothing in the module writes to the database or storage.

## How a call works
1. **Query.** The card's `visual_query` (the classifier's 2–6 plain words, as Job B's Unsplash lane uses), or else
   its title and gist reduced to at most 6 content words: no stop words, no quoted speech. Names heard in the
   recording are stripped first (`redact.ts`).
2. **Orientation from the card's form.** Photo and text cards are portrait, boards and comparisons are landscape,
   and a quote takes either.
3. **Sources run in parallel.** A source that's unavailable is skipped without a call. One that fails or times out
   is logged and skipped, never fatal.
4. **Results.** They interleave (one from each source in turn), duplicates drop (the same source and ID, or the same
   image), and the first `limit` are returned (default 6). Every source returns only on-topic results: Pixabay
   filters by its tags, and Unsplash's own ranking is trusted. Each source is asked for the full `limit`, so a source
   with fewer than 2 on-topic results is filled from the other source, never padded with off-topic ones. If there
   aren't `limit` on-topic results in all, fewer come back.

| Source | Key | What it returns | Credit (`credit.name` → `credit.url`) | Link |
|---|---|---|---|---|
| Unsplash | `UNSPLASH_ACCESS_KEY` | the Job B client (`searchPhotos`), content filter high | "Photo by <name> on Unsplash" → photographer (utm) | photo page (utm) |
| Pixabay | `PIXABAY_API_KEY` | photos only, safesearch on; the first 3 query words ANDed (`a+b+c`); results whose tags share no query word dropped | "via Pixabay" → image page | image page |
| Pinterest | `PINTEREST_APP_ID` + `PINTEREST_APP_SECRET` + her token | her own boards' pins, ranked locally against the query | the pin's board name → the pin | the pin |

- **Unsplash download events.** `trackReferenceUse(ref)` sends the download event, for when she *uses* a reference
  (opens it full). Showing one doesn't count (Unsplash API guidelines).
- **Pexels** isn't used anywhere.

## Pinterest
The rules are in `packages/schema/pinterest.ts` and `docs/pinterest.md`.
- **Live and stateless.** On each call the web app reads her token from Vault, refreshing it first if it's near
  expiry, and passes it in. The pipeline lists her boards (at most 8) and a page of 25 pins from each, ranks them by
  shared query words (title, description, alt text, board name), and returns the best. The API has no search over her
  pins. Nothing outlives the request.
- **Unaltered.** Only Pinterest's uncropped width-fitted images (`600x` thumb, `1200x` full), never the `150x150` or
  `400x300` crops, and only from Pinterest's own image hosts. A pin with no uncropped image, or a video pin, is left
  out rather than cropped.
- **Never an input.** `generate()` refuses pin images and pin links. The app's style-signal writer drops a Pinterest
  source, and Postgres refuses one (0036).

**Connector** (`apps/web/lib/pinterest.ts`):
- **Authorization.** OAuth 2.0 authorization code, scopes `boards:read`, `pins:read`, redirect
  `https://app.ivywolf.com.au/api/pinterest/callback`.
- **State and PKCE.** `state` carries the creator ID, the PKCE verifier, a nonce and a 10-minute expiry, sealed with
  AES-256-GCM under a key derived from the app secret. That's how the public callback knows who she is, with no table.
  Pinterest's docs don't mention PKCE; the S256 challenge and verifier are sent anyway.
- **Tokens.** The access and refresh tokens are stored as one Vault secret, `adapter_cred_<creator>_pinterest`; her
  connection is a `creator_connections` row.
- **Disconnect** deletes both.

**Routes:**
- `GET /api/pinterest/start`: the consent URL. It returns 503 `available: false` until the secret is set.
- `GET /api/pinterest/callback`: public, authenticated by the sealed state. It returns her to
  `ivywolf://pinterest?status=…`.
- `GET /api/pinterest`: `{ available, connected }`. `DELETE /api/pinterest` disconnects.

**Missing secret (now).** `PINTEREST_APP_SECRET` isn't set (trial access pending). Until it is, the app's Connect
screen shows "Connect Pinterest · coming soon", `start` refuses, and `findReferences` skips Pinterest.

**Migration 0037** adds the `pinterest` row to the `connections` catalogue, because `creator_connections.slug`
references it. Tagline "Your boards, beside your ideas"; description "Shows pins from your own boards as references.
Fetched live, never stored, never used to make anything." Applied 9 Oct 2026.

## API
`GET /api/references?card_id=<uuid>` → `Reference[]`.
- **Creator-scoped:** the card is read with her own token, so another creator's card is a 404.
- **Rate limit:** 60 calls a minute per creator. The counter is in memory per server instance, so it isn't a global
  count.

## Tests
- `npx tsx --tsconfig apps/web/tsconfig.json scripts/test-references.ts`: 45 checks, no network. Covers query
  building, orientation, interleave and dedupe, failing and missing sources, the missing-secret fallback, the sealed
  state and PKCE, unaltered pins, and the Pinterest guards (no `generate()`, no `style_signals`).
- `npx tsx --env-file=.env.local scripts/smoke-references.ts`: live Unsplash and Pixabay for the test account's
  rooftop card. Prints the 6 references with their credits.
