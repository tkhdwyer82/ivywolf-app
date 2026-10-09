// apps/mobile/app/pinterest.tsx
// ivywolf://pinterest — where Pinterest's consent hands back (lib/pinterest.ts). The auth session normally catches it;
// if the link opens the app instead, it lands on Connect, which shows the connection as it now is.
import { Redirect } from 'expo-router'

export default function PinterestReturn() {
  return <Redirect href="/connections" />
}
