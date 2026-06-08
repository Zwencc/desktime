//! Activity monitoring for the moo clock.
//!
//! Collection lives in Rust for the same reason reminder timing does: a WebView
//! that is hidden — or showing a plain clock — stops ticking, and a work day is
//! mostly made of minutes where nobody is looking at the widget.
//!
//! Three rules shape everything below, in this order:
//!
//! 1. **Nothing is collected until the user says so.** The default config is
//!    `enabled: false`; the frontend pushes a real one after the user reads what
//!    is being collected. A monitor that never hears from the frontend does
//!    nothing at all.
//! 2. **Each signal has its own switch.** `mic` and `audio` do not merely hide a
//!    result, they skip the query.
//! 3. **A minute is the finest grain kept.** Ticks are folded into counters and
//!    discarded, so what lands on disk cannot be replayed into actions.

mod names;
mod sample;
mod store;

pub use store::{import_legacy_days, ActivitySummary, MinuteRecord, SharedRepositories};

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use names::AppPaths;
use sample::{EnvSample, KeySample, Sampler};
use crate::api::ApiResult;

use store::{now_ms, summarize, Store};

const MINUTE_MS: i64 = 60_000;

/// Keyboard sweep interval. `GetAsyncKeyState` reports "pressed since you last
/// asked", so this is the resolution at which two presses of the same key merge.
const TICK: Duration = Duration::from_millis(100);

const TICKS_PER_SECOND: u32 = 10;
/// Registry, COM and desktop-handle probes are far more expensive than a key
/// sweep, and none of them change meaningfully inside ten seconds.
const TICKS_PER_ENV: u32 = 100;

/// How recently input must have happened for the current minute to count as
/// active. Sampling is once a second, so this catches any input in the minute.
const IDLE_ACTIVE_MS: u32 = 2_000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityConfig {
    pub enabled: bool,
    /// Microphone and camera occupancy — the meeting detector.
    pub mic: bool,
    pub audio: bool,
    /// Gap after which the user counts as having left the desk.
    pub away_minutes: u32,
    pub retain_days: u32,
    /// A present minute becomes an *effective* minute at either threshold.
    pub active_keys: u32,
    pub active_mouse_px: u32,
}

impl Default for ActivityConfig {
    fn default() -> Self {
        Self {
            // Off until the frontend has shown the user what this collects.
            enabled: false,
            mic: false,
            audio: true,
            away_minutes: 5,
            retain_days: 90,
            active_keys: 10,
            active_mouse_px: 300,
        }
    }
}

/// A live look at the sampler, for the developer-mode debug window.
///
/// It exists to answer one question that is otherwise pure guesswork: is
/// collection actually running? It is held in memory and never written anywhere.
///
/// Note the gate in `publish_idle`: while collection is off, only `sampled_at`
/// and `enabled` are filled in. Reporting a foreground executable here would be
/// collecting — the debug window would have quietly become a second collector
/// that ignores the switch the first one obeys.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugSnapshot {
    /// Epoch ms of the last sampler pass. A value that stops advancing means a
    /// dead or wedged thread — which a plain "running" boolean cannot show.
    pub sampled_at: i64,
    /// The backend's own view of the switch, not the frontend's stored setting.
    pub enabled: bool,
    /// Start of the minute being assembled.
    pub minute: i64,
    pub foreground_exe: String,
    pub idle_ms: u32,
    pub keys_total: u32,
    pub keys_copy: u32,
    pub keys_back: u32,
    pub mouse_px: u32,
    pub app_switches: u32,
    pub distinct_apps: u32,
    pub active: bool,
    pub mic: bool,
    pub cam: bool,
    pub audio: bool,
    pub fullscreen: bool,
    pub locked: bool,
    pub on_battery: bool,
    pub monitors: u8,
    /// Minutes committed since this process started, and when the last one
    /// landed. Separates "sampling but storing nothing" from "not sampling".
    pub committed: u32,
    pub last_commit: i64,
    /// The last write that failed, if one has. A commit that cannot reach the
    /// database is the one failure this window exists to make visible, and
    /// swallowing it would leave "committed stopped rising" as the only symptom.
    #[serde(default)]
    pub store_error: String,
}

/// Everything the debug window reads, in one round trip.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDebug {
    /// The config the backend is holding — the point of comparison for the
    /// frontend's stored one, which is what a "did my push arrive" check needs.
    pub config: ActivityConfig,
    pub snapshot: DebugSnapshot,
    pub recent_records: Vec<MinuteRecord>,
}

/// Counters for the minute currently being assembled. Reset on every rollover.
#[derive(Default)]
struct Accumulator {
    keys: KeySample,
    mouse_px: u32,
    active: bool,
    switches: u32,
    /// Foreground samples per executable, used only to pick the minute's winner.
    apps: BTreeMap<String, u32>,
    last_app: Option<String>,
    env: EnvSample,
}

impl Accumulator {
    fn note_app(&mut self, app: String) {
        if self.last_app.as_deref() != Some(app.as_str()) {
            if self.last_app.is_some() {
                self.switches += 1;
            }
            self.last_app = Some(app.clone());
        }
        *self.apps.entry(app).or_default() += 1;
    }

    fn into_record(self, ts: i64) -> MinuteRecord {
        let top_app = self
            .apps
            .iter()
            .max_by_key(|(_, samples)| **samples)
            .map(|(app, _)| app.clone())
            .unwrap_or_default();

        MinuteRecord {
            ts,
            active: self.active,
            keys_total: self.keys.total,
            keys_copy: self.keys.copy,
            keys_back: self.keys.back,
            mouse_px: self.mouse_px,
            app_switches: self.switches,
            distinct_apps: self.apps.len() as u32,
            top_app,
            mic: self.env.mic,
            cam: self.env.cam,
            audio: self.env.audio,
            fullscreen: self.env.fullscreen,
            locked: self.env.locked,
            on_battery: self.env.on_battery,
            monitors: self.env.monitors,
        }
    }
}

pub struct Monitor {
    config: Mutex<ActivityConfig>,
    store: Mutex<Store>,
    debug: Mutex<DebugSnapshot>,
    /// Where the foreground executables live, so their product names can be read
    /// on request. Filled by sampling, never stored, never handed out.
    paths: AppPaths,
    stopped: AtomicBool,
}

impl Monitor {
    // A poisoned lock must not silently stop collection for the rest of the
    // session, so it is recovered rather than propagated — as the scheduler does.
    fn config_lock(&self) -> MutexGuard<'_, ActivityConfig> {
        self.config.lock().unwrap_or_else(|error| error.into_inner())
    }

    fn store_lock(&self) -> MutexGuard<'_, Store> {
        self.store.lock().unwrap_or_else(|error| error.into_inner())
    }

    fn debug_lock(&self) -> MutexGuard<'_, DebugSnapshot> {
        self.debug.lock().unwrap_or_else(|error| error.into_inner())
    }

    /// The debug window's whole payload, in one round trip.
    ///
    /// A failed read is reported as an empty list rather than an error: the
    /// snapshot beside it is the part that answers "is collection running", and
    /// losing the whole window because the tail query failed would hide it.
    pub fn debug(&self, records: usize) -> ActivityDebug {
        ActivityDebug {
            config: self.config(),
            snapshot: self.debug_lock().clone(),
            recent_records: self.store_lock().tail(records).unwrap_or_default(),
        }
    }

    pub fn config(&self) -> ActivityConfig {
        self.config_lock().clone()
    }

    pub fn set_config(&self, config: ActivityConfig) {
        *self.config_lock() = config;
    }

    /// Aggregates one `[start, end)` range per entry. The frontend passes the
    /// bounds because it owns the time zone — "today" in Shanghai is not a UTC
    /// day — and passes a month's worth at once because the loss rate is a
    /// month-to-date sum of per-day overtime.
    ///
    /// The whole span is read once and then sliced, so asking for 31 days costs
    /// the same file reads as asking for one.
    pub fn summaries(&self, ranges: &[(i64, i64)], recent_minutes: u32) -> ApiResult<Vec<ActivitySummary>> {
        let config = self.config();
        let Some(span_start) = ranges.iter().map(|(start, _)| *start).min() else {
            return Ok(Vec::new());
        };
        let span_end = ranges.iter().map(|(_, end)| *end).max().unwrap_or(span_start);
        let records = self.store_lock().range(span_start, span_end)?;

        Ok(ranges
            .iter()
            .map(|(start, end)| {
                let slice: Vec<MinuteRecord> = records
                    .iter()
                    .filter(|record| record.ts >= *start && record.ts < *end)
                    .cloned()
                    .collect();
                summarize(
                    &slice,
                    config.away_minutes,
                    config.active_keys,
                    config.active_mouse_px,
                    end - i64::from(recent_minutes.max(1)) * MINUTE_MS,
                )
            })
            .collect())
    }

    pub fn clear(&self) -> ApiResult<()> {
        self.store_lock().clear()
    }

    /// The product name behind each executable, for the ones this run has seen
    /// in the foreground. Executables it cannot answer for are simply absent —
    /// the caller already has the file name to fall back on.
    pub fn app_names(&self, exes: &[String]) -> BTreeMap<String, String> {
        self.paths.resolve(exes)
    }

    /// Stops the sampling thread. Nothing is flushed: every minute was
    /// committed as it finished, so the only record that can be lost is the one
    /// still being assembled — which was never complete.
    pub fn shutdown(&self) {
        self.stopped.store(true, Ordering::Relaxed);
    }

    fn run(self: Arc<Self>) {
        let mut sampler = Sampler::new();
        let mut accumulator = Accumulator::default();
        let mut minute = now_ms().div_euclid(MINUTE_MS);
        let mut tick: u32 = 0;

        while !self.stopped.load(Ordering::Relaxed) {
            std::thread::sleep(TICK);
            let config = self.config();

            let current = now_ms().div_euclid(MINUTE_MS);
            if current != minute {
                let finished = std::mem::take(&mut accumulator);
                if config.enabled {
                    self.commit(finished.into_record(minute * MINUTE_MS), config.retain_days);
                }
                minute = current;
                tick = 0;
            }

            if !config.enabled {
                // A heartbeat is still published: from the outside "switched off"
                // and "thread died" look identical, and telling them apart is the
                // first thing anyone debugging collection needs.
                self.publish_idle();
                continue;
            }

            accumulator.keys.add(sampler.keys());
            if tick % TICKS_PER_ENV == 0 {
                accumulator.env = sampler.environment(config.mic, config.audio);
            }
            if tick % TICKS_PER_SECOND == 0 {
                accumulator.mouse_px += sampler.cursor_delta();
                let idle_ms = sampler.idle_ms();
                if idle_ms <= IDLE_ACTIVE_MS {
                    accumulator.active = true;
                }
                if let Some(app) = sampler.foreground_app() {
                    // The path stops here; only the file name goes any further.
                    self.paths.remember(&app.exe, &app.path);
                    accumulator.note_app(app.exe);
                }
                self.publish(&accumulator, minute, idle_ms);
            }
            tick = tick.wrapping_add(1);
        }
    }

    /// Republishes the debug view from what this pass already gathered. It makes
    /// no probe of its own — a debug window that sampled independently would be
    /// reporting on itself rather than on collection.
    fn publish(&self, accumulator: &Accumulator, minute: i64, idle_ms: u32) {
        let mut debug = self.debug_lock();
        *debug = DebugSnapshot {
            sampled_at: now_ms(),
            enabled: true,
            minute: minute * MINUTE_MS,
            foreground_exe: accumulator.last_app.clone().unwrap_or_default(),
            idle_ms,
            keys_total: accumulator.keys.total,
            keys_copy: accumulator.keys.copy,
            keys_back: accumulator.keys.back,
            mouse_px: accumulator.mouse_px,
            app_switches: accumulator.switches,
            distinct_apps: accumulator.apps.len() as u32,
            active: accumulator.active,
            mic: accumulator.env.mic,
            cam: accumulator.env.cam,
            audio: accumulator.env.audio,
            fullscreen: accumulator.env.fullscreen,
            locked: accumulator.env.locked,
            on_battery: accumulator.env.on_battery,
            monitors: accumulator.env.monitors,
            // Carried across, since these count the whole session rather than
            // the minute this snapshot describes.
            committed: debug.committed,
            last_commit: debug.last_commit,
            store_error: debug.store_error.clone(),
        };
    }

    /// The heartbeat kept while collection is off: proof the thread is alive,
    /// and nothing that would itself amount to collecting.
    fn publish_idle(&self) {
        let mut debug = self.debug_lock();
        debug.sampled_at = now_ms();
        debug.enabled = false;
    }

    /// Minutes with nothing in them are dropped. A meeting still counts even with
    /// no keystrokes at all — that combination is the whole point of the signal.
    fn commit(&self, record: MinuteRecord, retain_days: u32) {
        if !record.active && !record.mic && !record.cam && !record.audio {
            return;
        }
        let ts = record.ts;
        let stored = self.store_lock().push(record, retain_days);

        let mut debug = self.debug_lock();
        match stored {
            Ok(()) => {
                debug.committed += 1;
                debug.last_commit = ts;
                debug.store_error.clear();
            }
            Err(error) => debug.store_error = error.message,
        }
    }
}

/// Starts the sampling thread and hands back the monitor driving it.
///
/// Free of Tauri on purpose. Collection is the one piece of background work with
/// no user interface at all, so it runs in DTCore — which is where it has to
/// run, because every signal the sampler reads is session-bound and answers for
/// nobody at all from session 0.
///
/// `config` comes from the config file rather than from a window pushing it
/// over. Collection used to start off on every launch and wait for the moo
/// clock's webview to mount — which made it depend on a window that starts
/// hidden and that nobody has to open.
pub fn spawn(config: ActivityConfig, repositories: SharedRepositories) -> Arc<Monitor> {
    let monitor = Arc::new(Monitor {
        paths: AppPaths::default(),
        config: Mutex::new(config),
        store: Mutex::new(Store::new(repositories)),
        debug: Mutex::new(DebugSnapshot::default()),
        stopped: AtomicBool::new(false),
    });

    let worker = Arc::clone(&monitor);
    std::thread::Builder::new()
        .name("desktime-activity".to_owned())
        .spawn(move || worker.run())
        .ok();

    monitor
}
