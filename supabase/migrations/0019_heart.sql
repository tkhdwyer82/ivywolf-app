-- The heart on an idea (P9). A timestamp rather than a flag, so "ideas you've hearted" can be ordered by when.
alter table cards add column hearted_at timestamptz;
