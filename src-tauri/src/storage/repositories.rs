//! The concrete SQLite repositories. DTCore owns them; the UI reaches them only
//! through IPC, which is what keeps `desktime.db` single-writer.
//!
//! Records are the domain types, not copies of them. An `ActivityMinuteRecord`
//! that merely resembled [`MinuteRecord`] would be a second definition of what a
//! minute is, and the two would drift the first time a signal was added.

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::activity::MinuteRecord;
use crate::api::{ApiError, ApiErrorCode, ApiResult};

use super::database::{storage_error, CoreDatabase};

/// The six environment booleans, packed. See the migration for why they are one
/// column.
mod flags {
    pub const MIC: i64 = 1 << 0;
    pub const CAM: i64 = 1 << 1;
    pub const AUDIO: i64 = 1 << 2;
    pub const FULLSCREEN: i64 = 1 << 3;
    pub const LOCKED: i64 = 1 << 4;
    pub const ON_BATTERY: i64 = 1 << 5;
}

fn pack_flags(record: &MinuteRecord) -> i64 {
    let mut packed = 0i64;
    for (set, bit) in [
        (record.mic, flags::MIC),
        (record.cam, flags::CAM),
        (record.audio, flags::AUDIO),
        (record.fullscreen, flags::FULLSCREEN),
        (record.locked, flags::LOCKED),
        (record.on_battery, flags::ON_BATTERY),
    ] {
        if set {
            packed |= bit;
        }
    }
    packed
}

/// Binds one minute and runs it.
///
/// A macro that performs the call rather than a function that returns the
/// parameters: `params!` borrows the packed flags, so a function handing them
/// back would be handing back a reference into its own stack frame.
macro_rules! execute_minute {
    ($statement:expr, $record:expr) => {{
        let record = $record;
        let packed = pack_flags(record);
        $statement.execute(params![
            record.ts,
            record.active,
            record.keys_total,
            record.keys_copy,
            record.keys_back,
            record.mouse_px,
            record.app_switches,
            record.top_app,
            record.distinct_apps,
            packed,
            record.monitors,
        ])
    }};
}

const MINUTE_COLUMNS: &str = "minute_utc_ms, active, keys_total, keys_copy, keys_back, mouse_px,
     app_switches, top_app, distinct_apps, flags, monitors";

const INSERT_MINUTE_IGNORE: &str = "INSERT OR IGNORE INTO activity_minute
     (minute_utc_ms, active, keys_total, keys_copy, keys_back, mouse_px,
      app_switches, top_app, distinct_apps, flags, monitors)
     VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)";

const INSERT_MINUTE_REPLACE: &str = "INSERT OR REPLACE INTO activity_minute
     (minute_utc_ms, active, keys_total, keys_copy, keys_back, mouse_px,
      app_switches, top_app, distinct_apps, flags, monitors)
     VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleRecord {
    pub id: String,
    /// The revision the caller believes it is replacing. The stored row moves to
    /// `revision + 1`, so a second writer working from a stale copy is refused
    /// rather than silently winning.
    pub revision: u64,
    pub payload: serde_json::Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderRecord {
    pub id: String,
    pub revision: u64,
    pub payload: serde_json::Value,
}

pub trait ActivityRepository {
    fn append_minute(&mut self, record: &MinuteRecord) -> ApiResult<()>;
    fn query_minutes(&mut self, from_ms: i64, to_ms: i64) -> ApiResult<Vec<MinuteRecord>>;
    /// The newest minutes, oldest first — what the debug window shows.
    fn tail_minutes(&mut self, limit: usize) -> ApiResult<Vec<MinuteRecord>>;
    fn prune_before(&mut self, cutoff_ms: i64) -> ApiResult<()>;
    fn clear_minutes(&mut self) -> ApiResult<()>;
}

pub trait ScheduleRepository {
    fn list(&mut self) -> ApiResult<Vec<ScheduleRecord>>;
    fn upsert(&mut self, record: &ScheduleRecord) -> ApiResult<ScheduleRecord>;
    fn delete(&mut self, id: &str, expected_revision: u64) -> ApiResult<()>;
}

pub trait ReminderRepository {
    fn list(&mut self) -> ApiResult<Vec<ReminderRecord>>;
    fn upsert(&mut self, record: &ReminderRecord) -> ApiResult<ReminderRecord>;
    fn delete(&mut self, id: &str, expected_revision: u64) -> ApiResult<()>;
}

/// Every repository over one connection.
///
/// One handle rather than one per table: SQLite serialises writers anyway, and a
/// second connection would only add a way for two of DTCore's own threads to sit
/// in `SQLITE_BUSY` against each other.
pub struct SqliteRepositories {
    database: CoreDatabase,
}

impl SqliteRepositories {
    pub fn new(database: CoreDatabase) -> Self {
        Self { database }
    }

    pub fn database(&self) -> &CoreDatabase {
        &self.database
    }

    /// Whether a one-off import has already been run to completion.
    pub fn import_completed(&mut self, source: &str) -> ApiResult<bool> {
        self.database
            .connection()
            .query_row(
                "SELECT imported_rows FROM import_marker WHERE source = ?1",
                [source],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map(|found| found.is_some())
            .map_err(storage_error)
    }

    pub fn mark_import_completed(&mut self, source: &str, rows: i64) -> ApiResult<()> {
        self.database
            .connection()
            .execute(
                "INSERT INTO import_marker(source, imported_rows, completed_at_ms)
                 VALUES(?1, ?2, ?3)
                 ON CONFLICT(source) DO UPDATE SET
                   imported_rows = excluded.imported_rows,
                   completed_at_ms = excluded.completed_at_ms",
                params![source, rows, crate::reminder::now_ms()],
            )
            .map(|_| ())
            .map_err(storage_error)
    }

    /// Imports many minutes in one transaction.
    ///
    /// `INSERT OR IGNORE` on the minute key is what makes the JSON migration
    /// idempotent: running it twice, or being killed half way and running it
    /// again, can only ever leave the same rows behind.
    pub fn import_minutes(&mut self, records: &[MinuteRecord]) -> ApiResult<usize> {
        let transaction = self
            .database
            .connection()
            .transaction()
            .map_err(storage_error)?;
        {
            let mut statement = transaction
                .prepare(INSERT_MINUTE_IGNORE)
                .map_err(storage_error)?;
            for record in records {
                execute_minute!(statement, record).map_err(storage_error)?;
            }
        }
        transaction.commit().map_err(storage_error)?;
        Ok(records.len())
    }

    pub fn count_minutes(&mut self) -> ApiResult<i64> {
        self.database
            .connection()
            .query_row("SELECT count(*) FROM activity_minute", [], |row| row.get(0))
            .map_err(storage_error)
    }
}

fn minute_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MinuteRecord> {
    let packed: i64 = row.get(9)?;
    Ok(MinuteRecord {
        ts: row.get(0)?,
        active: row.get(1)?,
        keys_total: row.get(2)?,
        keys_copy: row.get(3)?,
        keys_back: row.get(4)?,
        mouse_px: row.get(5)?,
        app_switches: row.get(6)?,
        top_app: row.get(7)?,
        distinct_apps: row.get(8)?,
        mic: packed & flags::MIC != 0,
        cam: packed & flags::CAM != 0,
        audio: packed & flags::AUDIO != 0,
        fullscreen: packed & flags::FULLSCREEN != 0,
        locked: packed & flags::LOCKED != 0,
        on_battery: packed & flags::ON_BATTERY != 0,
        monitors: row.get(10)?,
    })
}

impl ActivityRepository for SqliteRepositories {
    fn append_minute(&mut self, record: &MinuteRecord) -> ApiResult<()> {
        // Replace rather than ignore: the live sampler is the authority for the
        // minute it just finished, and a repeated minute key can only come from
        // the clock having moved backwards under it.
        let mut statement = self
            .database
            .connection()
            .prepare(INSERT_MINUTE_REPLACE)
            .map_err(storage_error)?;
        execute_minute!(statement, record)
            .map(|_| ())
            .map_err(storage_error)
    }

    fn query_minutes(&mut self, from_ms: i64, to_ms: i64) -> ApiResult<Vec<MinuteRecord>> {
        let connection = self.database.connection();
        let mut statement = connection
            .prepare(&format!(
                "SELECT {MINUTE_COLUMNS} FROM activity_minute
                 WHERE minute_utc_ms >= ?1 AND minute_utc_ms < ?2
                 ORDER BY minute_utc_ms"
            ))
            .map_err(storage_error)?;
        let rows = statement
            .query_map(params![from_ms, to_ms], minute_from_row)
            .map_err(storage_error)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(storage_error)
    }

    fn tail_minutes(&mut self, limit: usize) -> ApiResult<Vec<MinuteRecord>> {
        let connection = self.database.connection();
        let mut statement = connection
            .prepare(&format!(
                "SELECT {MINUTE_COLUMNS} FROM activity_minute
                 ORDER BY minute_utc_ms DESC LIMIT ?1"
            ))
            .map_err(storage_error)?;
        let rows = statement
            .query_map(params![limit as i64], minute_from_row)
            .map_err(storage_error)?;
        let mut records = rows
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(storage_error)?;
        records.reverse();
        Ok(records)
    }

    fn prune_before(&mut self, cutoff_ms: i64) -> ApiResult<()> {
        self.database
            .connection()
            .execute(
                "DELETE FROM activity_minute WHERE minute_utc_ms < ?1",
                params![cutoff_ms],
            )
            .map(|_| ())
            .map_err(storage_error)
    }

    fn clear_minutes(&mut self) -> ApiResult<()> {
        self.database
            .connection()
            .execute("DELETE FROM activity_minute", [])
            .map(|_| ())
            .map_err(storage_error)
    }
}

/// Both item repositories are the same three statements over a different table,
/// so they are written once here and named twice below.
macro_rules! item_repository {
    ($trait_name:ident, $record:ident, $table:literal) => {
        impl $trait_name for SqliteRepositories {
            fn list(&mut self) -> ApiResult<Vec<$record>> {
                let connection = self.database.connection();
                let mut statement = connection
                    .prepare(concat!(
                        "SELECT id, revision, payload FROM ",
                        $table,
                        " ORDER BY id"
                    ))
                    .map_err(storage_error)?;
                let rows = statement
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                        ))
                    })
                    .map_err(storage_error)?;

                rows.collect::<rusqlite::Result<Vec<_>>>()
                    .map_err(storage_error)?
                    .into_iter()
                    .map(|(id, revision, payload)| {
                        Ok($record {
                            id,
                            revision: revision as u64,
                            payload: decode_payload(&payload)?,
                        })
                    })
                    .collect()
            }

            fn upsert(&mut self, record: &$record) -> ApiResult<$record> {
                let payload = encode_payload(&record.payload)?;
                let transaction = self
                    .database
                    .connection()
                    .transaction()
                    .map_err(storage_error)?;

                let stored: Option<i64> = transaction
                    .query_row(
                        concat!("SELECT revision FROM ", $table, " WHERE id = ?1"),
                        [&record.id],
                        |row| row.get(0),
                    )
                    .optional()
                    .map_err(storage_error)?;

                // Dropping the transaction here rolls it back; nothing was
                // written before the check.
                if stored.unwrap_or(0) as u64 != record.revision {
                    return Err(revision_conflict(&record.id, stored));
                }

                let next = record.revision + 1;
                transaction
                    .execute(
                        concat!(
                            "INSERT INTO ",
                            $table,
                            "(id, revision, payload, updated_at_ms) VALUES(?1, ?2, ?3, ?4)
                             ON CONFLICT(id) DO UPDATE SET
                               revision = excluded.revision,
                               payload = excluded.payload,
                               updated_at_ms = excluded.updated_at_ms"
                        ),
                        params![record.id, next as i64, payload, crate::reminder::now_ms()],
                    )
                    .map_err(storage_error)?;
                transaction.commit().map_err(storage_error)?;

                Ok($record {
                    id: record.id.clone(),
                    revision: next,
                    payload: record.payload.clone(),
                })
            }

            fn delete(&mut self, id: &str, expected_revision: u64) -> ApiResult<()> {
                let removed = self
                    .database
                    .connection()
                    .execute(
                        concat!("DELETE FROM ", $table, " WHERE id = ?1 AND revision = ?2"),
                        params![id, expected_revision as i64],
                    )
                    .map_err(storage_error)?;

                if removed == 0 {
                    return Err(revision_conflict(id, None));
                }
                Ok(())
            }
        }
    };
}

item_repository!(ScheduleRepository, ScheduleRecord, "schedule_item");
item_repository!(ReminderRepository, ReminderRecord, "reminder_item");

fn encode_payload(payload: &serde_json::Value) -> ApiResult<String> {
    serde_json::to_string(payload).map_err(|error| {
        ApiError::new(
            ApiErrorCode::InvalidRequest,
            format!("record payload could not be stored: {error}"),
        )
    })
}

fn decode_payload(payload: &str) -> ApiResult<serde_json::Value> {
    serde_json::from_str(payload).map_err(|error| {
        ApiError::new(
            ApiErrorCode::StorageUnavailable,
            format!("stored record payload is not valid JSON: {error}"),
        )
    })
}

fn revision_conflict(id: &str, stored: Option<i64>) -> ApiError {
    ApiError::new(
        ApiErrorCode::RevisionConflict,
        match stored {
            Some(revision) => format!("record {id} has moved on to revision {revision}"),
            None => format!("record {id} is not at the revision the caller expected"),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repositories() -> SqliteRepositories {
        SqliteRepositories::new(CoreDatabase::in_memory().unwrap())
    }

    fn minute(ts: i64) -> MinuteRecord {
        MinuteRecord {
            ts,
            active: true,
            keys_total: 12,
            top_app: "code.exe".to_owned(),
            mic: true,
            on_battery: true,
            monitors: 2,
            ..MinuteRecord::default()
        }
    }

    #[test]
    fn a_minute_survives_the_flag_bitfield_intact() {
        let mut store = repositories();
        store.append_minute(&minute(60_000)).unwrap();

        let read = store.query_minutes(0, 120_000).unwrap();
        assert_eq!(read.len(), 1);
        assert!(read[0].mic && read[0].on_battery);
        assert!(!read[0].cam && !read[0].audio && !read[0].locked && !read[0].fullscreen);
        assert_eq!(read[0].top_app, "code.exe");
        assert_eq!(read[0].monitors, 2);
    }

    #[test]
    fn importing_the_same_day_twice_neither_loses_nor_duplicates() {
        let mut store = repositories();
        let day = vec![minute(0), minute(60_000), minute(120_000)];

        store.import_minutes(&day).unwrap();
        store.import_minutes(&day).unwrap();

        assert_eq!(store.query_minutes(0, 180_000).unwrap().len(), 3);
        assert_eq!(store.count_minutes().unwrap(), 3);
    }

    #[test]
    fn ranges_are_half_open_and_pruning_respects_the_cutoff() {
        let mut store = repositories();
        for index in 0..5 {
            store.append_minute(&minute(index * 60_000)).unwrap();
        }

        assert_eq!(store.query_minutes(60_000, 180_000).unwrap().len(), 2);
        store.prune_before(120_000).unwrap();
        assert_eq!(store.query_minutes(0, 300_000).unwrap().len(), 3);
    }

    #[test]
    fn the_tail_is_the_newest_minutes_in_reading_order() {
        let mut store = repositories();
        for index in 0..5 {
            store.append_minute(&minute(index * 60_000)).unwrap();
        }

        let tail = store.tail_minutes(2).unwrap();
        assert_eq!(
            tail.iter().map(|record| record.ts).collect::<Vec<_>>(),
            vec![3 * 60_000, 4 * 60_000]
        );
    }

    #[test]
    fn a_stale_writer_is_refused_rather_than_winning() {
        let mut store = repositories();
        let first = ScheduleRecord {
            id: "item".to_owned(),
            revision: 0,
            payload: serde_json::json!({ "title": "standup" }),
        };

        let stored = ScheduleRepository::upsert(&mut store, &first).unwrap();
        assert_eq!(stored.revision, 1);

        // A second writer still holding revision 0.
        let refused = ScheduleRepository::upsert(&mut store, &first);
        assert_eq!(refused.unwrap_err().code, ApiErrorCode::RevisionConflict);

        assert!(ScheduleRepository::delete(&mut store, "item", 0).is_err());
        ScheduleRepository::delete(&mut store, "item", 1).unwrap();
        assert!(ScheduleRepository::list(&mut store).unwrap().is_empty());
    }
}
