//! Backend reminder scheduling.
//!
//! Timing lives here rather than in the widgets because WebView2 throttles JS
//! timers once a window is hidden — exactly when a desktop reminder matters
//! most. The frontend owns the time-zone setting, so it resolves wall-clock
//! times to epoch milliseconds and hands over a plan; this module owns the
//! clock, the repeat counters, and putting the reminder on screen.

mod queue;

use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;

use queue::{now_ms, Queue};

pub const REMINDER_WINDOW: &str = "reminder";
pub const SCHEDULE_WINDOW: &str = "schedule";

const EVENT_FIRE: &str = "reminder://fire";
const EVENT_INAPP: &str = "reminder://inapp";
const EVENT_FIRED: &str = "reminder://fired";

const REMIND_TITLE: &str = "日程提醒";

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

#[derive(Default)]
pub struct Scheduler {
    queue: Mutex<Queue>,
    wake: Condvar,
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
        drop(queue);
        self.wake.notify_all();
    }

    pub fn sync_notices(&self, jobs: Vec<NoticeJob>) {
        self.lock().replace_notices(jobs);
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
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let scheduler = Arc::new(Scheduler::default());
    app.manage(Arc::clone(&scheduler));

    let handle = app.clone();
    std::thread::Builder::new()
        .name("desktime-reminder".to_owned())
        .spawn(move || {
            while let Some(jobs) = scheduler.wait_for_due() {
                for job in jobs {
                    dispatch(&handle, &scheduler, job);
                }
            }
        })
        .ok();
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
                    REMIND_TITLE,
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
