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

## In code (9 Oct 2026)
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

## In the schema (0036, applied 9 Oct 2026)
- Deleted the 2 stored Pinterest `suggestions`. They were the seeded placeholders on the test account. Their images
  in `frames/<test account>/fixture/` were removed through the storage API, and the PNGs are gone from
  `scripts/seed/frames`.
- `suggestions.source` and `cards.source` no longer allow `pinterest`, so a stored row or a card can't hold a pin.
  `cards_recording_unless_pinned` no longer exempts Pinterest.
- `style_signals_not_pinterest`: a style signal can never have source `pinterest`.
- `write_style_signal()` refuses a Pinterest source. `bridge_suggestion_signal()` skips one. `pin_suggestion()`
  refuses one.

Tested in a rolled-back transaction first (`scripts/test-0036.sql`, 8 checks, all pass).

The Pinterest connector itself (OAuth, live fetch, disconnect) isn't built. When it is, it follows rules 1–4 and
uses the helpers above.
