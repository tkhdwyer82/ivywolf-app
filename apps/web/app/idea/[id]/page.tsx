// /idea/<id> — one idea on the web (app.ivywolf.com.au).
//   Her own (signed in, RLS finds it): the full view — what the connector's links open.
//   Anyone else, once she has shared it (Copy link, Job C+): the card alone — title, form and credit — from
//   shared_card() (0034). Never the recording, transcript, context or linked ideas.
//   Neither: signed out → /sign-in and back (her own link before she's signed in); signed in → 404.
// The route is public in proxy.ts so the shared card can answer; this page makes the decision.

import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'
import { Cite, Frame, Heading, Meta, OpenInApp, Page } from '@/components/graph'
import { SharedCardView, type SharedCard } from '@/components/shared-card'
import { isId, loadIdea } from '@/lib/web/graph'
import { supabaseAnon } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function loadShared(id: string): Promise<SharedCard | null> {
  if (!isId(id)) return null
  const { data, error } = await supabaseAnon().rpc('shared_card', { p_card_id: id })
  if (error) throw new Error(error.message)
  return (data as SharedCard | null) ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const shared = await loadShared(id).catch(() => null)
  const robots = { index: false, follow: false }
  if (!shared) return { title: 'Idea · Ivy Wolf', robots }
  return {
    title: `${shared.title} · Ivy Wolf`,
    robots,
    openGraph: { title: shared.title, siteName: 'Ivy Wolf', images: shared.frame_url ? [shared.frame_url] : undefined },
  }
}

export default async function Idea({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId, redirectToSignIn } = await auth()

  const idea = userId ? await loadIdea(id) : null
  if (!idea) {
    const shared = await loadShared(id)
    if (shared) return <SharedCardView card={shared} />
    if (!userId) return redirectToSignIn()
    notFound()
  }
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
