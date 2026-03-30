use std::sync::Arc;

use tauri::State;

use crate::reminder::{NoticeJob, ReminderJob, Scheduler};

/// Replaces the whole reminder plan. The frontend re-syncs whenever the
/// schedule, the time zone, or the mute switch changes — it owns the wall-clock
/// to epoch conversion, so the backend never has to know about time zones.
#[tauri::command]
pub fn sync_reminders(
    scheduler: State<'_, Arc<Scheduler>>,
    jobs: Vec<ReminderJob>,
    inapp_fallback: bool,
) {
    scheduler.sync_reminders(jobs, inapp_fallback);
}

/// Replaces the plain notification plan (hourly chime, pomodoro). Kept separate
/// from reminders because a different widget window owns each list.
#[tauri::command]
pub fn sync_notices(scheduler: State<'_, Arc<Scheduler>>, jobs: Vec<NoticeJob>) {
    scheduler.sync_notices(jobs);
}

/// Stops one ringing reminder, or every one of them when `id` is omitted.
#[tauri::command]
pub fn stop_reminder(scheduler: State<'_, Arc<Scheduler>>, id: Option<String>) {
    scheduler.stop(id.as_deref());
}

#[tauri::command]
pub fn snooze_reminder(scheduler: State<'_, Arc<Scheduler>>, id: String, minutes: u32) -> bool {
    scheduler.snooze(&id, minutes)
}
