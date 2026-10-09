// packages/pipeline/generate/routes/index.ts
// Every route the gateway knows: Higgsfield (H.0a) and fal (H.0b). direct is next (a Route implementation here, plus
// a ModelRoute entry with the same version in models.ts).

import type { Route, RouteName } from '../types'
import { higgsfield } from './higgsfield'
import { fal } from './fal'

export const ROUTES: Partial<Record<RouteName, Route>> = { higgsfield, fal }
