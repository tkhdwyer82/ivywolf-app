// packages/pipeline/generate/routes/index.ts
// Every route the gateway knows. Job H.0a: only Higgsfield is live; fal and direct are the next routes to add (a
// Route implementation here, plus a ModelRoute entry with the same version in models.ts).

import type { Route, RouteName } from '../types'
import { higgsfield } from './higgsfield'

export const ROUTES: Partial<Record<RouteName, Route>> = { higgsfield }
