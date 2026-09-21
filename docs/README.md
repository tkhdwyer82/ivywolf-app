# Starter pack - how to use this

1. Create the repo: fork gamesfield-app -> ivywolf-app (squash history). Copy this folder's contents over the top.
2. New Supabase project (not the reservations one). `supabase db push` with 0001_graph.sql, 0002_ledger_and_helpers.sql, and the Vault helpers copied as 0003. Enable the Clerk integration so auth.jwt() carries the Clerk sub.
2b. Copy the files in docs/lift-list.md from Gamesfield-app into the paths given. Do not fork the repo.
3. Open Claude Code in the repo and start with:
   "Read CLAUDE.md. Implement packages/pipeline: Deepgram transcription with utterances + diarization, then
   classify_v1 with structured output, then write to the graph tables. Run the two eval memos and report the diff
   against expected.json."
4. Then: "Scaffold apps/mobile with Expo: Record (+), Notes (Profile), Threads list (Home), Life (inbox). TestFlight build."
5. Every new voice memo: check Ivy's output by hand, then add an expected.json to pipeline/eval/memos.
