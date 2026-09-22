import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // apps/web is a workspace package; trace from the repo root so the monorepo
  // resolves correctly on Vercel.
  outputFileTracingRoot: require('path').join(__dirname, '../../'),
  // Workspace packages ship TypeScript source; the recordings process route imports the pipeline.
  transpilePackages: ['@ivywolf/pipeline', '@ivywolf/schema'],
  // `next dev` otherwise writes its own CLAUDE.md/AGENTS.md into apps/web; the repo's CLAUDE.md governs.
  agentRules: false,
}

export default nextConfig
