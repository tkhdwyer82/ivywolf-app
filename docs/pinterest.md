# Pinterest: the terms Ivy keeps

From Pinterest's developer terms. The rules live in code in `packages/schema/pinterest.ts`, which every Pinterest
touchpoint imports. Its guards enforce them.

1. **Store nothing but the OAuth token.** Never cache or store pins, pin images or board data: no rows, and no files
   in Supabase storage or `frames/`. Fetch live from the Pinterest API each time something is shown. The token lives
   only in Supabase Vault (`apps/web/lib/vault.ts`, `vaultSecretName(creatorId, 'pinterest')`).
2. **Pins are never inputs**, to generation or to `style_signals`.
3. **Shown unaltered, with a link back.** A pin appears exactly as Pinterest serves it (no crop, filter, overlay,
   re-encode or regenerated frame), and every pin links to its own Pinterest URL.
4. **Disconnect deletes the token.** Delete the Vault secret and the `creator_connections` row in the same request.
   Nothing else needs deleting, because rule 1 means nothing else was kept.

## Enforced in code (9 Oct 2026)
| Where | What |
|---|---|
| `packages/schema/pinterest.ts` | The rules; `isPinterestUrl` (pinterest.*, pinimg.com, pin.it), `isPinterestSource`, `refusePinterest` |
| `packages/pipeline/generate` | `generate()` refuses a Pinterest card (source or source URL), a Pinterest image ref, or a pin link in the brief, before anything is estimated or sent |
| `apps/mobile/lib/styleSignals.ts` | A signal whose source is Pinterest is dropped before it reaches Postgres |
| `apps/mobile/lib/suggestions.ts` | Stored Pinterest suggestions are never shown (More ideas and the suggestion page) |
| `scripts/seed-suggestions.ts` | `pinterest` is not an allowed source; the two placeholder Pinterest suggestions are gone from the fixture |
| `apps/mobile/lib/idea.ts`, `apps/web/lib/mcp/handlers.ts` | Comments: no pin becomes a card; none goes out through MCP |

Tests: `npx tsx scripts/test-pinterest.ts` (11 checks), `scripts/test-gateway.ts` (two `generate()` refusals), and
`apps/mobile/lib/__tests__/pinterest.test.ts`.

## Not done yet (needs a production schema/data change)
Today production holds **2 stored Pinterest suggestions**. They're the seeded placeholders, with images copied
into `frames/<test account>/fixture/`. Nothing Pinterest-sourced is in `cards`, `style_signals`,
`suggestion_signals` or `generation_runs`. Proposed migration 0036:

- Delete the 2 Pinterest `suggestions` rows and their image files in `frames/`.
- `suggestions`: `check (source <> 'pinterest')`, since a stored row is a cached pin.
- `cards.source`: drop `pinterest` from the allowed values, so no pin becomes a card.
- `pin_suggestion()`: refuse a Pinterest suggestion.
- `bridge_suggestion_signal()` (0032) and `write_style_signal()`: skip or refuse source `pinterest`.

The Pinterest connector itself (OAuth, live fetch, disconnect) isn't built. When it is, it follows rules 1–4 and
uses the helpers above.
