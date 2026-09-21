# Lift list — what comes from Gamesfield-app, verbatim or reshaped
Source: Claude Code inventory of /Users/gamesfield/Gamesfield-app @ f72b7e0 (21 Sept 2026). Copy files, never fork.

## Take verbatim
| Gamesfield file | Ivy destination | Note |
|---|---|---|
| lib/vault.ts + supabase/migrations/20260526130000_vault_helper_functions.sql | apps/web/lib/vault.ts + supabase/migrations/0003_vault.sql | zero coupling |
| lib/storage.ts (uploadBuffer, fetchAndUpload) | packages/pipeline/storage.ts | bucket → `recordings` (raw, untouched) + `frames` |
| app/api/api-keys/route.ts, app/api/api-keys/[id]/route.ts, lib/mcp/handlers.ts:11-28 resolveApiKey | apps/web/app/api/api-keys/*, apps/web/lib/mcp/auth.ts | prefix `iv_` not `gf_` |
| proxy.ts (clerkMiddleware + route matcher) | apps/web/proxy.ts | rewrite the public allowlist from scratch; drop /mobile-gate |
| Clerk publicMetadata attribution pattern (app/api/play/community/route.ts) | Rising attribution | batch getUserList, non-fatal |
| update_updated_at_column() from 20260527000000_scene_builder_schema.sql | 0002 | already included |
| Stripe: app/api/webhook, checkout, billing-portal | apps/web/app/api/billing/* | PLAN_CREDITS → Ivy plans; write to credit_ledger, not a balance column |

## Take the shape, rewrite the body
| Gamesfield | Ivy | What changes |
|---|---|---|
| app/api/mcp/route.ts + sse/route.ts + lib/mcp/tools.ts | apps/web/app/api/mcp/* | collapse the two dispatch switches into one dispatcher; use @modelcontextprotocol/sdk (it's already a dep, unused); tools: search_threads, get_thread, get_board, list_actions, mark_shipped |
| projects pattern (per-user workspace, one active, JSON context injected into every AI call) | creators.style_pack + threads | the pattern is aesthetic memory; the fields are all game-worldbuilding — none carry over |
| publish connectors' connect half (PLATFORM_SLUG → verify → storeSecret → upsert platform_connections) | packages/adapters/connect.ts | this becomes the real adapter interface; the push half (Godot zips, wharf) does not come |
| app/api/explore/route.ts query shape; game_votes toggle | Rising ranking | community_games has no writer — do not copy the table; rank on remixes (0002) |
| rpc('increment_play_count') pattern | all counters | every counter is an RPC; no read-modify-write anywhere |

## Do not take
characters/*, scenes/*, code-studio/*, code-run/godot, trailers/*, pixellab, packs/*, LoRA training, analytics_snapshots,
game_builds, publish_jobs, community_games, npc_messages, middleware.ts.backup, the 15 copy-pasted check-and-deduct blocks.

## Fixed on the way in
- RLS: auth.jwt() ->> 'sub' everywhere (0001, 0002). Routes use the user JWT; service role only in the pipeline worker.
- Credits: append-only ledger + atomic spend_credits() RPC (0002) instead of credits_remaining read-modify-write.
- One storage module; the seven direct uploaders in Gamesfield are not repeated.
- Every table has a migration from day one. `supabase db reset` must produce a working database.
