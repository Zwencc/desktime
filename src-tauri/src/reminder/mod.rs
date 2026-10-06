//! Backend reminder scheduling.
//!
//! Timing lives here rather than in the widgets because WebView2 throttles JS
//! timers once a window is hidden — exactly when a desktop reminder matters
//! most. The frontend owns the time-zone setting, so it resolves wall-clock
//! times to epoch milliseconds and hands over a plan; this module owns the
//! clock, the repeat counters, and putting the reminder on screen.

mod queue;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;

use queue::Queue;
// Re-exported: DTCore needs the same clock to decide how far off the next
// reminder is, and there should be exactly one definition of "now".
pub use queue::now_ms;

pub const REMINDER_WINDOW: &str = "reminder";
pub const SCHEDULE_WINDOW: &str = "schedule";

const EVENT_FIRE: &str = "reminder://fire";
const EVENT_INAPP: &str = "reminder://inapp";
const EVENT_FIRED: &str = "reminder://fired";


/// Longest single sleep. Bounds how stale the queue can get when the machine
/// suspends, since a timed wait cannot be trusted to measure real elapsed time.
const MAX_SLEEP: Duration = Duration::from_secs(60);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderJob {
    /// Occurrence key (`itemId|date|time`), stable across repeats of one ring.
    pub id: String,
    pub item_id: String,
    pub title: String,
    pub time_label: String,
    #[serde(default)]
    pub tag: Option<String>,
    pub trigger_at: i64,
    pub channel: String,
    #[serde(default)]
    pub topmost: bool,
    #[serde(default)]
    pub focus: bool,
    pub visual: String,
    #[serde(default)]
    pub repeat_every_min: u32,
    #[serde(default)]
    pub repeat_max: u32,
    #[serde(default)]
    pub auto_dismiss_sec: u32,
    #[serde(default)]
    pub overdue_minutes: i64,
    #[serde(default)]
    pub round: u32,
}

/// A plain timed notification (hourly chime, pomodoro completion). Scheduled
/// here for the same reason reminders are: hidden windows stop ticking.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoticeJob {
    pub id: String,
    pub trigger_at: i64,
    pub title: String,
    pub body: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FiredEvent {
    id: String,
    round: u32,
}

pub enum Job {
    Reminder(ReminderJob),
    Notice(NoticeJob),
}

impl Job {
    fn trigger_at(&self) -> i64 {
        match self {
            Self::Reminder(job) => job.trigger_at,
            Self::Notice(job) => job.trigger_at,
        }
    }
}

enum Channel {
    Off,
    Inapp,
    Desktop,
    Toast,
}

/// What the developer-mode panel reads. Nothing here is a reminder's contents —
/// counts and one timestamp, enough to answer "is the queue alive and what is it
/// waiting for".
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerStatus {
    pub worker_running: bool,
    pub queued: usize,
    pub ringing: usize,
    pub next_trigger: Option<i64>,
    pub inapp_fallback: bool,
}

#[derive(Default)]
pub struct Scheduler {
    queue: Mutex<Queue>,
    wake: Condvar,
    /// Set once the worker thread is actually spawned. `stopped` alone cannot
    /// stand in for this: a thread that failed to spawn leaves it false too.
    worker: AtomicBool,
}

impl Scheduler {
    // A panicking handler must not wedge reminders for the rest of the session,
    // so a poisoned lock is recovered rather than propagated.
    fn lock(&self) -> MutexGuard<'_, Queue> {
        self.queue.lock().unwrap_or_else(|error| error.into_inner())
    }

    pub fn sync_reminders(&self, jobs: Vec<ReminderJob>, inapp_fallback: bool) {
        let mut queue = self.lock();
        queue.set_inapp_fallback(inapp_fallback);
        queue.replace_reminders(jobs);
        let next = queue.next_trigger();
        drop(queue);
        publish_next_wake(next);
        self.wake.notify_all();
    }

    pub fn sync_notices(&self, jobs: Vec<NoticeJob>) {
        let mut queue = self.lock();
        queue.replace_notices(jobs);
        let next = queue.next_trigger();
        drop(queue);
        publish_next_wake(next);
        self.wake.notify_all();
    }

    pub fn stop(&self, id: Option<&str>) {
        self.lock().stop(id);
        self.wake.notify_all();
    }

    pub fn snooze(&self, id: &str, minutes: u32) -> bool {
        let requeued = self.lock().snooze(id, minutes);
        self.wake.notify_all();
        requeued
    }

    pub fn shutdown(&self) {
        self.lock().stop_worker();
        self.wake.notify_all();
    }

    pub fn status(&self) -> SchedulerStatus {
        let queue = self.lock();
        SchedulerStatus {
            worker_running: self.worker.load(Ordering::Relaxed) && !queue.is_stopped(),
            queued: queue.queued(),
            ringing: queue.ringing(),
            next_trigger: queue.next_trigger(),
            inapp_fallback: queue.inapp_fallback(),
        }
    }

    fn inapp_fallback(&self) -> bool {
        self.lock().inapp_fallback()
    }

    fn after_fire(&self, job: ReminderJob) {
        self.lock().after_fire(job);
        self.wake.notify_all();
    }

    /// Blocks until at least one job is due. Returns `None` once shut down.
    fn wait_for_due(&self) -> Option<Vec<Job>> {
        let mut queue = self.lock();
        loop {
            if queue.is_stopped() {
                return None;
            }

            // Real time is re-read on every pass, so a suspended machine simply
            // wakes up to a batch of overdue jobs instead of drifting.
            let now = now_ms();
            let due = queue.take_due(now);
            if !due.is_empty() {
                return Some(due);
            }

            let wait = queue
                .next_trigger()
                .map(|trigger| Duration::from_millis(trigger.saturating_sub(now).max(0) as u64))
                .unwrap_or(MAX_SLEEP)
                .min(MAX_SLEEP);
            let (guard, _) = self
                .wake
                .wait_timeout(queue, wait)
                .unwrap_or_else(|error| error.into_inner());
            queue = guard;
        }
    }
}

/// Registers the scheduler and starts its worker thread.
/// File DTCore reads to know when this machine next has something to ring.
///
/// Reminders are scheduled, dispatched and dismissed entirely inside the UI
/// process — it owns the time zone, the repeat state and the windows. Moving all
/// of that into DTCore would mean a second copy of logic that is already
/// subtle, and two queues that could disagree about whether a reminder had been
/// handled.
///
/// So DTCore is given one number instead: the next moment a reminder is due.
/// If the UI is not running by then, DTCore starts it, and the UI does what
/// it has always done. The service ends up guaranteeing that DeskTime is there
/// when it needs to be, rather than reimplementing DeskTime.
pub fn next_wake_path() -> std::path::PathBuf {
    crate::config::dir().join("next-wake")
}

/// Writes the next due time out, or clears it when nothing is scheduled.
///
/// Quiet on failure: a missed write costs a reminder that only fires if the app
/// happens to be open, which is exactly the behaviour without a service at all.
fn publish_next_wake(next: Option<i64>) {
    let path = next_wake_path();
    let _ = std::fs::create_dir_all(crate::config::dir());

    match next {
        Some(at) => {
            let _ = std::fs::write(path, at.to_string());
        }
        None => {
            let _ = std::fs::remove_file(path);
        }
    }
}

pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let scheduler = Arc::new(Scheduler::default());
    app.manage(Arc::clone(&scheduler));

    let handle = app.clone();
    let worker = Arc::clone(&scheduler);
    let spawned = std::thread::Builder::new()
        .name("desktime-reminder".to_owned())
        .spawn(move || {
            while let Some(jobs) = worker.wait_for_due() {
                for job in jobs {
                    dispatch(&handle, &worker, job);
                }
            }
        })
        .is_ok();
    scheduler.worker.store(spawned, Ordering::Relaxed);
}

fn dispatch<R: Runtime>(app: &AppHandle<R>, scheduler: &Scheduler, job: Job) {
    match job {
        Job::Notice(notice) => notify(app, &notice.title, &notice.body),
        Job::Reminder(reminder) => {
            match resolve_channel(app, scheduler, &reminder) {
                Channel::Desktop => show_reminder(app, &reminder),
                Channel::Inapp => {
                    let _ = app.emit_to(SCHEDULE_WINDOW, EVENT_INAPP, &reminder);
                }
                Channel::Toast => notify(
                    app,
                    crate::i18n::strings(app).reminder_title,
                    &format!("{}（{}）", reminder.title, reminder.time_label),
                ),
                Channel::Off => {}
            }

            let _ = app.emit(
                EVENT_FIRED,
                FiredEvent {
                    id: reminder.id.clone(),
                    round: reminder.round,
                },
            );
            scheduler.after_fire(reminder);
        }
    }
}

/// An in-app reminder is useless while its widget is hidden, so it falls back to
/// the popup window unless the user turned that off.
fn resolve_channel<R: Runtime>(
    app: &AppHandle<R>,
    scheduler: &Scheduler,
    job: &ReminderJob,
) -> Channel {
    match job.channel.as_str() {
        "desktop" => Channel::Desktop,
        "toast" => Channel::Toast,
        "inapp" => {
            let visible = app
                .get_webview_window(SCHEDULE_WINDOW)
                .and_then(|window| window.is_visible().ok())
                .unwrap_or(false);

            if visible {
                Channel::Inapp
            } else if scheduler.inapp_fallback() {
                Channel::Desktop
            } else {
                Channel::Off
            }
        }
        _ => Channel::Off,
    }
}

// Showing the window from here (rather than asking the frontend to do it) is the
// whole point of backend scheduling: it works even when the WebView is throttled.
fn show_reminder<R: Runtime>(app: &AppHandle<R>, job: &ReminderJob) {
    let _ = app.emit_to(REMINDER_WINDOW, EVENT_FIRE, job);

    let Some(window) = app.get_webview_window(REMINDER_WINDOW) else {
        return;
    };

    let _ = window.set_always_on_top(job.topmost);
    let _ = window.show();
    if job.focus {
        let _ = window.set_focus();
    }
}

fn notify<R: Runtime>(app: &AppHandle<R>, title: &str, body: &str) {
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
}
