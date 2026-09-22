-- 0006 limits what the app may insert on recordings to named columns; 0009's recorded_tz joins them so the app can
-- send the device's zone with a new recording.
grant insert (recorded_tz) on recordings to authenticated;
