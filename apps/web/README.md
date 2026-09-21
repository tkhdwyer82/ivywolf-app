# apps/web

Next.js. Three jobs, none of them the creator-facing app:

1. **Marketing** — the public site.
2. **Admin** — pilot management, eval review.
3. **MCP server** — `/api/mcp`. The "open at the edges" half of rule 6: any tool out, the graph never exposed
   to a competitor's app.

The creator-facing app is `apps/mobile` (Expo, iOS first). Not this.

Lifted from gamesfield-app per `docs/lift-list.md`: Clerk auth via `proxy.ts`, API keys (`iv_` prefix),
Vault helpers, Stripe billing. See that file before adding anything else from the old repo.
