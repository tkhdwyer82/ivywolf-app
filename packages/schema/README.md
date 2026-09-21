# packages/schema

Zod types shared by `apps/mobile`, `apps/web` and `packages/pipeline`. One definition per noun, matching the
vocabulary in `CLAUDE.md` — Recording, Segment, Card, Thread, Board — and the enums in
`supabase/migrations/0001_graph.sql` (`recording_source`, `segment_type`, `thread_stage`, `action_scope`,
`request_kind`).

The classifier's structured output is validated against the `Segment` and `Card` schemas here before anything
is written to the graph, so these types and the SQL enums must not drift apart.

Empty placeholder — nothing implemented yet.
