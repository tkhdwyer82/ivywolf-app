// /recording/<id> — one recording on the web: what Ivy made from it. Where the connector links when there is no
// single idea to open — a capture still being sorted, a session with no chapters yet, a transcript. Owner-only as
// /idea. In the app it lives in Voice notes.

import { notFound } from 'next/navigation'
import { Cite, Heading, IdeaRow, Meta, OpenInApp, Page } from '@/components/graph'
import { loadRecording } from '@/lib/web/graph'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Recording · Ivy Wolf', robots: { index: false, follow: false } }

const STATUS: Record<string, string> = {
  queued: 'Ivy is still listening to this one. Refresh in a minute.',
  processing: 'Ivy is still listening to this one. Refresh in a minute.',
  junk: 'Nothing to keep in this one.',
  failed: 'Ivy couldn’t finish this one. Retry it from the app.',
}

export default async function Recording({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rec = await loadRecording(id)
  if (!rec) notFound()
  const title = rec.title ?? (rec.source === 'muse' ? 'An idea from Muse' : rec.kind === 'session' ? 'A session' : 'A voice note')

  return (
    <Page>
      <div style={{ height: '1rem' }} />
      <Heading title={title} gist={STATUS[rec.status] ?? null} />
      <Cite rec={rec} ms={null} fallback={rec.received_at} />
      {rec.cards.length > 0 && <Meta>Ideas</Meta>}
      {rec.cards.map((c) => (
        <IdeaRow key={c.id} id={c.id} title={c.title} gist={c.gist} frame={c.frame_status === 'done' ? c.frame_url : null} />
      ))}
      {rec.actions.length > 0 && <Meta>To-dos</Meta>}
      {rec.actions.map((a) => (
        <a key={a.id} href={`/todo/${a.id}`} style={{ display: 'block', padding: '10px 0', borderTop: '1px solid #E8E8ED', color: 'inherit', textDecoration: 'none' }}>
          {a.done ? '✓ ' : ''}
          {a.text}
        </a>
      ))}
      <OpenInApp path={rec.cards[0] ? `idea/${rec.cards[0].id}` : 'notes'} />
    </Page>
  )
}
