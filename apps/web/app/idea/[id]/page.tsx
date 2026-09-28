// /idea/<id> — one idea on the web (app.ivywolf.com.au): what the connector's links open. Her own only: signed out,
// proxy.ts sends her to sign in and back; anyone else's (or no such idea) is a 404, by RLS (lib/web/graph.ts).

import { notFound } from 'next/navigation'
import { Cite, Frame, Heading, Meta, OpenInApp, Page } from '@/components/graph'
import { loadIdea } from '@/lib/web/graph'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Idea · Ivy Wolf', robots: { index: false, follow: false } }

export default async function Idea({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const idea = await loadIdea(id)
  if (!idea) notFound()
  const thread = idea.thread_cards.find((tc) => tc.threads)?.threads ?? null

  return (
    <Page>
      <Frame url={idea.frame_status === 'done' ? idea.frame_url : null} title={idea.title} pill={idea.recordings?.source === 'muse' ? 'via Muse' : undefined} />
      <Heading title={idea.title} gist={idea.gist} unsure={idea.confidence < 0.6} />
      <Cite rec={idea.recordings} ms={idea.play_from_ms} fallback={idea.created_at} />
      {idea.projects && <Meta>{idea.projects.name}</Meta>}
      {thread && (
        <p style={{ margin: '0.75rem 0 0' }}>
          <a href={`/thread/${thread.id}`} style={{ color: 'inherit' }}>
            {thread.title}
          </a>
          {thread.return_count > 1 ? ` — you’ve come back to this ${thread.return_count} times` : ''}
        </p>
      )}
      <OpenInApp path={`idea/${idea.id}`} />
    </Page>
  )
}
