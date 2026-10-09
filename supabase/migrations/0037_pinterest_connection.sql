-- 0037 — Pinterest as a connection (Job H.0c). creator_connections.slug references the connections catalogue (0013),
-- so the Pinterest connector needs its catalogue row before anyone can connect. No new table: her tokens live in
-- Supabase Vault (adapter_cred_<creator>_pinterest, apps/web/lib/pinterest.ts) and her connection is a
-- creator_connections row, as for any tool. Nothing else from Pinterest is stored (packages/schema/pinterest.ts).
--
-- The app keeps Pinterest out of the "tools Ivy can hand your ideas to" list (it's read from, never handed to) and
-- shows it as its own Connect row instead. verb_line is required; its copy is a placeholder until Tim writes it.

insert into connections (slug, name, verb_line, what_it_does, privacy_line, sort_weight)
values (
  'pinterest',
  'Pinterest',
  'your pins → references',
  '{}',
  'Only your OAuth token is kept. Your pins are fetched live when Ivy shows them and never stored.',
  0
)
on conflict (slug) do nothing;
