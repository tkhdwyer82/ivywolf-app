// /todo/<id> — a to-do on the web, so the connector's links for to-dos open something (Job F2). Owner-only as /idea.

import { notFound } from 'next/navigation'
import { Cite, Frame, Heading, Meta, OpenInApp, Page } from '@/components/graph'
import { loadTodo } from '@/lib/web/graph'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'To-do · Ivy Wolf', robots: { index: false, follow: false } }

const dueLine = (d: string) =>
  `Due ${new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(`${d}T00:00:00Z`))}`

export default async function Todo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const todo = await loadTodo(id)
  if (!todo) notFound()

  return (
    <Page>
      <Frame url={todo.frame_url} title={todo.text} pill={todo.done ? 'Done' : 'To-do'} height={300} />
      <Heading title={todo.text} gist={todo.segments?.text ? `“${todo.segments.text}”` : null} />
      <Cite rec={todo.recordings} ms={todo.segments?.start_ms ?? null} fallback={todo.created_at} />
      {(todo.due_date || todo.projects) && <Meta>{[todo.due_date && dueLine(todo.due_date), todo.projects?.name].filter(Boolean).join(' · ')}</Meta>}
      <OpenInApp path={`todo/${todo.id}`} />
    </Page>
  )
}
