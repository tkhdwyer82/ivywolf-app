-- Job B.3 follow-up to 0040: Undo on Home stamps recordings.discarded_at with her own token, before deleting the take
-- (packages/schema/deletion.ts → discardRecording). 0006 limits her updates on recordings to named columns; this adds
-- the stamp. RLS still picks the rows: only her own recordings.
grant update (discarded_at) on recordings to authenticated;
