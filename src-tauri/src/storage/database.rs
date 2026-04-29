use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::Connection;

use crate::api::{ApiError, ApiErrorCode, ApiResult};

use super::migrations;

pub const DATABASE_FILE: &str = "desktime.db";

pub struct CoreDatabase {
    connection: Connection,
    path: PathBuf,
}

impl CoreDatabase {
    pub fn open(root: &Path) -> ApiResult<Self> {
        std::fs::create_dir_all(root)?;
        let path = root.join(DATABASE_FILE);
        let connection = Connection::open(&path).map_err(storage_error)?;
        configure(&connection)?;
        let mut database = Self { connection, path };
        migrations::apply(&mut database.connection)?;
        Ok(database)
    }

    #[cfg(test)]
    pub fn in_memory() -> ApiResult<Self> {
        let connection = Connection::open_in_memory().map_err(storage_error)?;
        configure(&connection)?;
        let mut database = Self {
            connection,
            path: PathBuf::from(":memory:"),
        };
        migrations::apply(&mut database.connection)?;
        Ok(database)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn connection(&mut self) -> &mut Connection {
        &mut self.connection
    }
}

fn configure(connection: &Connection) -> ApiResult<()> {
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(storage_error)?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;",
        )
        .map_err(storage_error)?;
    Ok(())
}

pub(crate) fn storage_error(error: rusqlite::Error) -> ApiError {
    ApiError::new(ApiErrorCode::StorageUnavailable, error.to_string())
}
