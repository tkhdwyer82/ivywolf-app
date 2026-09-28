// 404 for the web views: another creator's idea looks exactly like one that doesn't exist.
import { Heading, Page } from '@/components/graph'

export default function NotFound() {
  return (
    <Page>
      <div style={{ height: '2rem' }} />
      <Heading title="Nothing here" gist="This isn’t in your Ivy. It may have been deleted, or it belongs to someone else." />
    </Page>
  )
}
