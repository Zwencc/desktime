use rusqlite::{params, Connection, OptionalExtension};

use crate::api::ApiResult;

use super::database::storage_error;

pub const CURRENT_SCHEMA_VERSION: i64 = 2;

struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

/// Applied in order, once each, and never edited afterwards. A schema change is
/// a new entry — rewriting an old one would leave installs that already ran it
/// with a shape nothing in this list describes.
const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "framework-baseline",
        sql: "CREATE TABLE IF NOT EXISTS schema_version (
                  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                  version INTEGER NOT NULL,
                  migration_name TEXT NOT NULL,
                  applied_at_ms INTEGER NOT NULL
              );",
    },
    Migration {
        version: 2,
        name: "core-repositories",
        // The minute start is the primary key, which is what makes importing
        // the same day file twice a no-op: re-running the JSON migration can
        // only ever rewrite a minute with itself.
        //
        // The six environment booleans are one bitfield rather than six
        // columns. They are read together, written together and never queried
        // individually, and a column each would be six more names for the
        // migration and the repository to keep in step for no gain.
        sql: "CREATE TABLE IF NOT EXISTS activity_minute (
                  minute_utc_ms INTEGER PRIMARY KEY,
                  active INTEGER NOT NULL,
                  keys_total INTEGER NOT NULL,
                  keys_copy INTEGER NOT NULL,
                  keys_back INTEGER NOT NULL,
                  mouse_px INTEGER NOT NULL,
                  app_switches INTEGER NOT NULL,
                  top_app TEXT NOT NULL,
                  distinct_apps INTEGER NOT NULL,
                  flags INTEGER NOT NULL,
                  monitors INTEGER NOT NULL
              );

              CREATE TABLE IF NOT EXISTS schedule_item (
                  id TEXT PRIMARY KEY,
                  revision INTEGER NOT NULL,
                  payload TEXT NOT NULL,
                  updated_at_ms INTEGER NOT NULL
              );

              CREATE TABLE IF NOT EXISTS reminder_item (
                  id TEXT PRIMARY KEY,
                  revision INTEGER NOT NULL,
                  payload TEXT NOT NULL,
                  updated_at_ms INTEGER NOT NULL
              );

              CREATE TABLE IF NOT EXISTS import_marker (
                  source TEXT PRIMARY KEY,
                  imported_rows INTEGER NOT NULL,
                  completed_at_ms INTEGER NOT NULL
              );",
    },
];

pub fn apply(connection: &mut Connection) -> ApiResult<()> {
    connection
        .execute_batch(MIGRATIONS[0].sql)
        .map_err(storage_error)?;

    let current = current_version(connection)?;
    for migration in MIGRATIONS.iter().filter(|migration| migration.version > current) {
        let transaction = connection.transaction().map_err(storage_error)?;
        transaction.execute_batch(migration.sql).map_err(storage_error)?;
        transaction
            .execute(
                "INSERT INTO schema_version(singleton, version, migration_name, applied_at_ms)
                 VALUES(1, ?1, ?2, ?3)
                 ON CONFLICT(singleton) DO UPDATE SET
                   version = excluded.version,
                   migration_name = excluded.migration_name,
                   applied_at_ms = excluded.applied_at_ms",
                params![migration.version, migration.name, crate::reminder::now_ms()],
            )
            .map_err(storage_error)?;
        transaction.commit().map_err(storage_error)?;
    }
    Ok(())
}

pub fn current_version(connection: &Connection) -> ApiResult<i64> {
    connection
        .query_row(
            "SELECT version FROM schema_version WHERE singleton = 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map(|version| version.unwrap_or(0))
        .map_err(storage_error)
}

#[cfg(test)]
mod tests {
    use super::{current_version, CURRENT_SCHEMA_VERSION};

    #[test]
    fn baseline_migration_is_idempotent() {
        let mut database = crate::storage::database::CoreDatabase::in_memory().unwrap();
        super::apply(database.connection()).unwrap();
        assert_eq!(
            current_version(database.connection()).unwrap(),
            CURRENT_SCHEMA_VERSION
        );
    }

    #[test]
    fn every_table_the_repositories_use_exists_after_migration() {
        let mut database = crate::storage::database::CoreDatabase::in_memory().unwrap();
        for table in [
            "activity_minute",
            "schedule_item",
            "reminder_item",
            "import_marker",
        ] {
            let found: i64 = database
                .connection()
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(found, 1, "{table} is missing");
        }
    }
}
