-- To-do (P17) + Date sheet (P18): Remind me, Add to Reminders, and the heart.
--
-- actions.remind_at: when she asked to be reminded (Remind me). The phone schedules a local notification for it,
-- keyed by the action's id, so the row is the truth and any device can reschedule it. Null = no reminder.
-- actions.synced_reminder_id: the Apple Reminders item Add to Reminders made (EventKit calendarItemIdentifier).
-- It names an item in her phone's Reminders, so only the phone that made it can update or remove it. Null = not
-- synced. routed_to stays the pipeline's routing guess (0001); this is what she actually turned on.

alter table actions add column remind_at timestamptz;
alter table actions add column synced_reminder_id text;

-- The heart on a to-do (P17), as on an idea (0019).
alter table actions add column hearted_at timestamptz;
