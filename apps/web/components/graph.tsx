// apps/web/components/graph.tsx
// The pieces the web views share, drawn after the app (apps/mobile components/Tile.tsx, app/idea/[id].tsx): the
// frame (or, with none drawn, the title set on the fill with the lime rule), the heading and gist, the cite — where
// and when it was said — and "Open in the Ivy app".

import type { Rec } from '@/lib/web/graph'

export const hero = { room: '#FFFFFF', ink: '#1D1D1F', secondary: '#6E6E73', hairline: '#E8E8ED', fill: '#F0F0F0', lime: '#D8F27A' }
const font = 'system-ui, -apple-system, "SF Pro Text", sans-serif'

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ font: `16px/1.5 ${font}`, color: hero.ink, background: hero.room, maxWidth: 30 * 16, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      <a href="/" style={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: hero.secondary, textDecoration: 'none' }}>
        Ivy Wolf
      </a>
      {children}
    </main>
  )
}

export function Frame({ url, title, height = 380, pill }: { url: string | null; title: string; height?: number; pill?: string }) {
  return (
    <div style={{ position: 'relative', height, borderRadius: 28, overflow: 'hidden', background: hero.fill, margin: '1rem 0' }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ height: '100%', boxSizing: 'border-box', padding: 20, display: 'flex', alignItems: 'flex-end', borderLeft: `4px solid ${hero.lime}` }}>
          <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1.2 }}>{title}</span>
        </div>
      )}
      {pill && (
        <span style={{ position: 'absolute', left: 12, top: 12, background: hero.lime, borderRadius: 8, padding: '3px 8px', fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {pill}
        </span>
      )}
    </div>
  )
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** When it was said, in her own zone (the device's, 0009), else Melbourne. */
export function when(rec: Rec | null, fallback: string): string {
  const at = new Date(rec?.recorded_at ?? rec?.received_at ?? fallback)
  const tz = rec?.recorded_tz ?? 'Australia/Melbourne'
  try {
    return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(at)
  } catch {
    return at.toUTCString()
  }
}

/** "Said at 0:48 in “Drive home” · Sun 21 Sep, 12:04 pm" — or, for an idea added through Muse, "Added via Muse · …". */
export function Cite({ rec, ms, fallback }: { rec: Rec | null; ms: number | null; fallback: string }) {
  const at = when(rec, fallback)
  const title = rec?.title ? `“${rec.title}”` : 'a recording'
  const line =
    rec?.source === 'muse'
      ? `Added via Muse · ${at}`
      : ms === null
        ? `From ${title} · ${at}`
        : `Said at ${clock(ms)} in ${title} · ${at}`
  return <p style={{ fontSize: 13, color: hero.secondary, margin: '0.75rem 0 0' }}>{line}</p>
}

export function Heading({ title, gist, unsure }: { title: string; gist?: string | null; unsure?: boolean }) {
  return (
    <div style={{ opacity: unsure ? 0.5 : 1 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1.25, margin: 0 }}>{title}</h1>
      {gist && <p style={{ fontSize: 15, lineHeight: 1.45, color: hero.secondary, margin: '0.4rem 0 0' }}>{gist}</p>}
      {unsure && <p style={{ fontSize: 13, color: hero.secondary, margin: '0.4rem 0 0' }}>Ivy isn’t sure</p>}
    </div>
  )
}

/** The app's own address for this object (apps/mobile app.json scheme "ivywolf"). */
export function OpenInApp({ path }: { path: string }) {
  return (
    <a
      href={`ivywolf://${path}`}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 26, background: hero.ink, color: '#FFFFFF', fontWeight: 600, textDecoration: 'none', marginTop: '1.5rem' }}
    >
      Open in the Ivy app
    </a>
  )
}

export function Meta({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: hero.secondary, margin: '1.25rem 0 0' }}>{children}</p>
}

/** A small row linking to another idea: thumbnail, title, gist. */
export function IdeaRow({ id, title, gist, frame }: { id: string; title: string; gist: string; frame: string | null }) {
  return (
    <a href={`/idea/${id}`} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: `1px solid ${hero.hairline}`, color: hero.ink, textDecoration: 'none' }}>
      <span style={{ flex: '0 0 56px', height: 56, borderRadius: 14, background: frame ? `center / cover url(${JSON.stringify(frame)})` : hero.fill }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 13, color: hero.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gist}</span>
      </span>
    </a>
  )
}
