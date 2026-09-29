// RFC 9728 protected-resource metadata for /mcp: how a client finds Ivy's authorization server (Job F2).
// Also at /.well-known/oauth-protected-resource/mcp (the path-inserted form, RFC 9728 §3.1).
import { origin, protectedResourceMetadata } from '@/lib/oauth/server'

export function GET(req: Request) {
  return Response.json(protectedResourceMetadata(origin(req)), { headers: { 'Cache-Control': 'public, max-age=300' } })
}
