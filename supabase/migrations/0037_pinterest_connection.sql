-- 0037 — Pinterest as a connection (Job H.0c). creator_connections.slug references the connections catalogue (0013),
-- so the Pinterest connector needs its catalogue row before anyone can connect. No new table: her tokens live in
-- Supabase Vault (adapter_cred_<creator>_pinterest, apps/web/lib/pinterest.ts) and her connection is a
-- creator_connections row, as for any tool. Nothing else from Pinterest is stored (packages/schema/pinterest.ts).
--
-- The app keeps Pinterest out of the "tools Ivy can hand your ideas to" list (it's read from, never handed to) and
-- shows it as its own Connect row instead. Copy by Tim (9 Oct 2026).

insert into connections (slug, name, verb_line, what_it_does, privacy_line, sort_weight)
values (
  'pinterest',
  'Pinterest',
  'Your boards, beside your ideas',
  array['Shows pins from your own boards as references. Fetched live, never stored, never used to make anything.'],
  null,
  0
)
on conflict (slug) do nothing;
