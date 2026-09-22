-- Actions carry the date they're for ("milk for the office for Thursday" → due 2026-09-24).
-- A calendar date, not a timestamp: "Thursday" names a day in the creator's own time zone, not an instant.
alter table actions add column due_date date;

-- Relative dates only resolve against the local day the recording was made. recorded_at is an instant; this is
-- the device's IANA zone at record time (e.g. 'Australia/Melbourne'). Null for recordings made before 0009 —
-- the pipeline then leaves relative due dates null rather than guessing a zone.
alter table recordings add column recorded_tz text;
