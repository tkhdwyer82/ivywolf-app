// RFC 8414 authorization-server metadata (Job F2; lib/oauth/server.ts).
import { authorizationServerMetadata, origin } from '@/lib/oauth/server'

export function GET(req: Request) {
  return Response.json(authorizationServerMetadata(origin(req)), { headers: { 'Cache-Control': 'public, max-age=300' } })
}
