// /thread/<id> — a thread on the web: its name, how often she's come back to it, and its ideas, newest first.
// Owner-only as /idea. The app has no thread screen, so "Open in the Ivy app" opens the newest idea, whose page
// shows the thread (apps/mobile app/idea/[id].tsx).

import { notFound } from 'next/navigation'
import { Cite, Frame, Heading, IdeaRow, Meta, OpenInApp, Page } from '@/components/graph'
import { loadThread } from '@/lib/web/graph'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Thread · Ivy Wolf', robots: { index: false, follow: false } }

export default async function Thread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const thread = await loadThread(id)
  if (!thread) notFound()
  const [newest, ...rest] = thread.cards

  return (
    <Page>
      <Frame url={newest?.frame_status === 'done' ? newest.frame_url : null} title={thread.title} pill={thread.stage} />
      <Heading
        title={thread.title}
        gist={thread.return_count > 1 ? `You’ve come back to this ${thread.return_count} times.` : `${thread.cards.length} idea${thread.cards.length === 1 ? '' : 's'}.`}
      />
      {newest && <Cite rec={newest.recordings} ms={newest.play_from_ms} fallback={newest.created_at} />}
      <Meta>Ideas in this thread</Meta>
      {[newest, ...rest].filter(Boolean).map((c) => (
        <IdeaRow key={c.id} id={c.id} title={c.title} gist={c.gist} frame={c.frame_status === 'done' ? c.frame_url : null} />
      ))}
      {newest && <OpenInApp path={`idea/${newest.id}`} />}
    </Page>
  )
}
