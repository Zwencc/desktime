//! Minute records: the aggregate, the table they live in, and the day summaries
//! the frontend asks for.
//!
//! A minute is the smallest thing that is ever kept. Raw ticks are counters that
//! are folded in and dropped, so there is nothing on disk that could be replayed
//! into a sequence of actions.
//!
//! Minutes are keyed by their **UTC** start, not by the app's time zone. The
//! backend has no time-zone setting (that lives in src/time.ts and is the
//! frontend's job), so it stores on a fixed grid and answers queries by epoch
//! range instead; a "day" in Shanghai is simply a range like any other.
//!
//! The rows live in DTCore's SQLite database rather than in one JSON file per
//! day. What that buys is the half-open range query below: a month used to mean
//! reading and parsing thirty-one whole files and then filtering the minutes
//! back down to the bounds, and now it is one statement.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::api::{ApiError, ApiErrorCode, ApiResult};
use crate::storage::repositories::{ActivityRepository, SqliteRepositories};

const MINUTE_MS: i64 = 60_000;
const DAY_MS: i64 = 86_400_000;

/// The repositories, shared between the sampling thread and the IPC handler that
/// answers the UI. One handle, so DTCore never becomes two writers of its own.
pub type SharedRepositories = Arc<Mutex<SqliteRepositories>>;

/// One minute of aggregated activity.
///
/// Note what is *not* here: no key identities beyond the two counted categories,
/// no window titles, and no record of which app held the microphone.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MinuteRecord {
    /// Start of the minute, epoch ms.
    pub ts: i64,
    pub active: bool,
    pub keys_total: u32,
    pub keys_copy: u32,
    pub keys_back: u32,
    pub mouse_px: u32,
    pub app_switches: u32,
    /// Executable name that held the foreground longest. Classification into
    /// chat/dev/office/… happens in the frontend, where the user can override it.
    #[serde(default)]
    pub top_app: String,
    pub distinct_apps: u32,
    pub mic: bool,
    pub cam: bool,
    pub audio: bool,
    pub fullscreen: bool,
    pub locked: bool,
    pub on_battery: bool,
    pub monitors: u8,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppMinutes {
    pub app: String,
    pub minutes: u32,
}

/// The tail of the window, used for "what is happening right now" rather than
/// "how did today go".
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentActivity {
    pub minutes: u32,
    pub keys_total: u32,
    pub keys_copy: u32,
    pub keys_back: u32,
    pub mouse_px: u64,
    pub app_switches: u32,
    pub distinct_apps: u32,
    pub top_app: String,
    pub mic: bool,
    pub cam: bool,
    pub audio: bool,
    pub fullscreen: bool,
    pub locked: bool,
    pub on_battery: bool,
    pub monitors: u8,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySummary {
    /// Minutes at the desk: active minutes plus the short gaps between them.
    pub present_minutes: u32,
    /// Present minutes that cleared the typing or mouse threshold.
    pub effective_minutes: u32,
    pub meeting_minutes: u32,
    pub locked_minutes: u32,
    pub keys_total: u32,
    pub keys_copy: u32,
    pub keys_back: u32,
    pub mouse_px: u64,
    pub app_switches: u32,
    pub apps: Vec<AppMinutes>,
    /// Epoch ms of the first and last active minute; 0 when the range is empty.
    pub first_active: i64,
    pub last_active: i64,
    pub recent: RecentActivity,
}

/// The sampler's view of storage. Holds no records itself: the buffered day was
/// what made the old file layout affordable, and a table does not need one.
pub struct Store {
    repositories: SharedRepositories,
    /// UTC day the retention sweep last ran for. Sweeping on every commit would
    /// be a `DELETE` that matches nothing 1,439 minutes out of 1,440.
    pruned_day: i64,
}

impl Store {
    pub fn new(repositories: SharedRepositories) -> Self {
        Self {
            repositories,
            pruned_day: 0,
        }
    }

    /// Commits one minute, sweeping expired ones when the UTC day turns over.
    pub fn push(&mut self, record: MinuteRecord, retain_days: u32) -> ApiResult<()> {
        let day = record.ts.div_euclid(DAY_MS);
        let sweep = (day != self.pruned_day).then(|| {
            self.pruned_day = day;
            (day - i64::from(retain_days)) * DAY_MS
        });

        self.with(|repositories| {
            if let Some(cutoff) = sweep {
                repositories.prune_before(cutoff)?;
            }
            repositories.append_minute(&record)
        })
    }

    /// The newest minutes, oldest first — what the debug window shows.
    pub fn tail(&self, limit: usize) -> ApiResult<Vec<MinuteRecord>> {
        self.with(|repositories| repositories.tail_minutes(limit))
    }

    /// Every record in `[start, end)`, in order.
    pub fn range(&self, start: i64, end: i64) -> ApiResult<Vec<MinuteRecord>> {
        self.with(|repositories| repositories.query_minutes(start, end))
    }

    pub fn clear(&mut self) -> ApiResult<()> {
        self.pruned_day = 0;
        self.with(|repositories| repositories.clear_minutes())
    }

    fn with<T>(
        &self,
        operation: impl FnOnce(&mut SqliteRepositories) -> ApiResult<T>,
    ) -> ApiResult<T> {
        // Recovered rather than propagated: a panic in one caller must not stop
        // collection for the rest of the session.
        let mut repositories = self
            .repositories
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        operation(&mut repositories)
    }
}

/// The one-off import of the day files written before the move to SQLite.
///
/// Idempotent twice over: a marker row records that it ran, and the insert
/// ignores minutes that are already there — so being killed half way through
/// costs nothing but a repeat. **The JSON is left where it is.** Those files are
/// the only copy of this history that predates the new schema, and deleting them
/// would turn a migration that went wrong into a permanent loss.
pub fn import_legacy_days(
    repositories: &SharedRepositories,
    dir: &std::path::Path,
) -> ApiResult<usize> {
    const SOURCE: &str = "activity-day-json";

    let mut repositories = repositories
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if repositories.import_completed(SOURCE)? {
        return Ok(0);
    }

    let mut imported = 0;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_none_or(|extension| extension != "json") {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(&path) else {
                continue;
            };
            // A day file that will not parse stops the import rather than being
            // skipped. It is someone's collected history, and passing over it
            // is how a migration loses data with nobody noticing.
            let records: Vec<MinuteRecord> = serde_json::from_str(&text).map_err(|error| {
                ApiError::new(
                    ApiErrorCode::StorageUnavailable,
                    format!("{} could not be read: {error}", path.display()),
                )
            })?;
            imported += repositories.import_minutes(&records)?;
        }
    }

    repositories.mark_import_completed(SOURCE, imported as i64)?;
    Ok(imported)
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

/// Folds a range of minutes into the numbers the mood engine and the settings
/// page read. `away_minutes` is how long a gap has to be before it stops counting
/// as "still at the desk".
pub fn summarize(
    records: &[MinuteRecord],
    away_minutes: u32,
    active_keys: u32,
    active_px: u32,
    recent_from: i64,
) -> ActivitySummary {
    let mut summary = ActivitySummary::default();
    let mut apps: BTreeMap<String, u32> = BTreeMap::new();
    let mut recent_apps: BTreeMap<String, u32> = BTreeMap::new();
    let mut previous_active: Option<i64> = None;

    for record in records {
        summary.keys_total += record.keys_total;
        summary.keys_copy += record.keys_copy;
        summary.keys_back += record.keys_back;
        summary.mouse_px += u64::from(record.mouse_px);
        summary.app_switches += record.app_switches;

        if record.locked {
            summary.locked_minutes += 1;
        }
        if record.mic {
            summary.meeting_minutes += 1;
        }
        if !record.top_app.is_empty() {
            *apps.entry(record.top_app.clone()).or_default() += 1;
        }

        if record.active && !record.locked {
            // Short gaps are bridged: stepping away for coffee is still "at work",
            // a two-hour gap is not.
            let bridged = previous_active
                .map(|previous| (record.ts - previous) / MINUTE_MS)
                .filter(|gap| *gap > 1 && *gap <= i64::from(away_minutes))
                .unwrap_or(1);
            summary.present_minutes += bridged.max(1) as u32;
            previous_active = Some(record.ts);

            if record.keys_total >= active_keys || record.mouse_px >= active_px {
                summary.effective_minutes += 1;
            }
            if summary.first_active == 0 {
                summary.first_active = record.ts;
            }
            summary.last_active = record.ts;
        }

        if record.ts >= recent_from {
            let recent = &mut summary.recent;
            recent.minutes += 1;
            recent.keys_total += record.keys_total;
            recent.keys_copy += record.keys_copy;
            recent.keys_back += record.keys_back;
            recent.mouse_px += u64::from(record.mouse_px);
            recent.app_switches += record.app_switches;
            if !record.top_app.is_empty() {
                *recent_apps.entry(record.top_app.clone()).or_default() += 1;
            }
            // The environment flags describe a moment, so the newest record wins.
            recent.mic = record.mic;
            recent.cam = record.cam;
            recent.audio = record.audio;
            recent.fullscreen = record.fullscreen;
            recent.locked = record.locked;
            recent.on_battery = record.on_battery;
            recent.monitors = record.monitors;
        }
    }

    summary.recent.distinct_apps = recent_apps.len() as u32;
    summary.recent.top_app = top_of(&recent_apps);
    summary.apps = rank(apps);
    summary
}

fn top_of(counts: &BTreeMap<String, u32>) -> String {
    counts
        .iter()
        .max_by_key(|(_, minutes)| **minutes)
        .map(|(app, _)| app.clone())
        .unwrap_or_default()
}

fn rank(counts: BTreeMap<String, u32>) -> Vec<AppMinutes> {
    let mut ranked: Vec<AppMinutes> = counts
        .into_iter()
        .map(|(app, minutes)| AppMinutes { app, minutes })
        .collect();
    ranked.sort_by(|a, b| b.minutes.cmp(&a.minutes).then_with(|| a.app.cmp(&b.app)));
    ranked.truncate(12);
    ranked
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minute(ts: i64, active: bool, keys: u32) -> MinuteRecord {
        MinuteRecord {
            ts,
            active,
            keys_total: keys,
            top_app: "code.exe".to_owned(),
            ..MinuteRecord::default()
        }
    }

    #[test]
    fn short_gaps_count_as_present_and_long_ones_do_not() {
        let records = vec![
            minute(0, true, 50),
            // Three-minute gap: still at the desk.
            minute(3 * MINUTE_MS, true, 50),
            // Twenty-minute gap: went away.
            minute(23 * MINUTE_MS, true, 50),
        ];

        let summary = summarize(&records, 5, 10, 200, i64::MAX);
        assert_eq!(summary.present_minutes, 1 + 3 + 1);
        assert_eq!(summary.effective_minutes, 3);
    }

    #[test]
    fn quiet_minutes_are_present_but_not_effective() {
        let records = vec![minute(0, true, 50), minute(MINUTE_MS, true, 0)];

        let summary = summarize(&records, 5, 10, 200, i64::MAX);
        assert_eq!(summary.present_minutes, 2);
        assert_eq!(summary.effective_minutes, 1);
    }

    #[test]
    fn recent_window_only_counts_its_own_tail() {
        let records = vec![minute(0, true, 40), minute(MINUTE_MS, true, 7)];

        let summary = summarize(&records, 5, 10, 200, MINUTE_MS);
        assert_eq!(summary.recent.minutes, 1);
        assert_eq!(summary.recent.keys_total, 7);
        assert_eq!(summary.recent.top_app, "code.exe");
    }

    #[test]
    fn locked_minutes_never_count_towards_presence() {
        let mut locked = minute(0, true, 90);
        locked.locked = true;

        let summary = summarize(&[locked], 5, 10, 200, i64::MAX);
        assert_eq!(summary.present_minutes, 0);
        assert_eq!(summary.locked_minutes, 1);
    }
}
