pub(crate) mod hacktivity;
mod migrations;
pub(crate) mod payments;
pub(crate) mod programs;
pub(crate) mod reports;
pub(crate) mod search;
pub(crate) mod workspace;

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::path::PathBuf;
use std::sync::{Mutex, PoisonError};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

#[derive(Debug, thiserror::Error)]
pub(crate) enum CacheError {
    #[error("local database error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("local data is corrupt: {0}")]
    Corrupt(#[from] serde_json::Error),
    #[error("could not reset the local database: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Cached<T> {
    pub data: T,
    pub synced_at: Option<String>,
}

pub(crate) struct Cache {
    path: Option<PathBuf>,
    conn: Mutex<Connection>,
}

impl Cache {
    pub(crate) fn open(path: PathBuf) -> Result<Self, CacheError> {
        let conn = Self::connect(Some(&path))?;
        Ok(Self { path: Some(path), conn: Mutex::new(conn) })
    }

    #[cfg(test)]
    pub(crate) fn in_memory() -> Result<Self, CacheError> {
        Ok(Self { path: None, conn: Mutex::new(Self::connect(None)?) })
    }

    fn connect(path: Option<&PathBuf>) -> Result<Connection, CacheError> {
        let mut conn = match path {
            Some(path) => Connection::open(path)?,
            None => Connection::open_in_memory()?,
        };
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        migrations::run(&mut conn)?;
        Ok(conn)
    }

    pub(crate) fn with<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, CacheError>,
    ) -> Result<T, CacheError> {
        let mut conn = self.conn.lock().unwrap_or_else(PoisonError::into_inner);
        operation(&mut conn)
    }

    /// Deletes the database file and its WAL sidecars, then starts again from an empty schema.
    pub(crate) fn wipe(&self) -> Result<(), CacheError> {
        let mut conn = self.conn.lock().unwrap_or_else(PoisonError::into_inner);
        let Some(path) = &self.path else {
            *conn = Self::connect(None)?;
            return Ok(());
        };
        let placeholder = Connection::open_in_memory()?;
        let previous = std::mem::replace(&mut *conn, placeholder);
        previous.close().map_err(|(_, error)| error)?;
        for suffix in ["", "-wal", "-shm"] {
            let mut file = path.clone().into_os_string();
            file.push(suffix);
            match std::fs::remove_file(&file) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            }
        }
        *conn = Self::connect(Some(path))?;
        Ok(())
    }
}

/// Drops everything fetched from the API while keeping drafts, templates, saved searches,
/// pins and settings, which only exist locally.
pub(crate) fn clear_synced_data(conn: &mut Connection) -> Result<(), CacheError> {
    let tx = conn.transaction()?;
    tx.execute_batch(
        "DELETE FROM sync_state;
         DELETE FROM programs;
         DELETE FROM program_capabilities;
         DELETE FROM structured_scopes;
         DELETE FROM scope_exclusions;
         DELETE FROM weaknesses;
         DELETE FROM reports;
         DELETE FROM hacktivity_pages;
         DELETE FROM earnings;
         DELETE FROM payouts;
         DELETE FROM kv WHERE key <> 'settings';
         DELETE FROM search_index;",
    )?;
    tx.commit()?;
    Ok(())
}

pub(crate) fn now() -> String {
    OffsetDateTime::now_utc().format(&Rfc3339).unwrap_or_default()
}

pub(crate) fn sql_int(value: usize) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

pub(crate) fn new_id() -> String {
    format!("{:032x}", rand::random::<u128>())
}

pub(crate) fn to_json<T: Serialize>(value: &T) -> Result<String, CacheError> {
    Ok(serde_json::to_string(value)?)
}

pub(crate) fn from_json<T: DeserializeOwned>(raw: &str) -> Result<T, CacheError> {
    Ok(serde_json::from_str(raw)?)
}

pub(crate) fn synced_at(conn: &Connection, resource: &str) -> Result<Option<String>, CacheError> {
    Ok(conn
        .query_row("SELECT synced_at FROM sync_state WHERE resource = ?1", [resource], |row| row.get(0))
        .optional()?)
}

pub(crate) fn mark_synced(conn: &Connection, resource: &str, at: &str) -> Result<(), CacheError> {
    conn.execute(
        "INSERT INTO sync_state (resource, synced_at) VALUES (?1, ?2)
         ON CONFLICT(resource) DO UPDATE SET synced_at = excluded.synced_at",
        params![resource, at],
    )?;
    Ok(())
}

pub(crate) fn read_bodies<T: DeserializeOwned>(
    conn: &Connection,
    sql: &str,
    args: impl rusqlite::Params,
) -> Result<Vec<T>, CacheError> {
    let mut statement = conn.prepare(sql)?;
    let raws = statement.query_map(args, |row| row.get::<_, String>(0))?.collect::<Result<Vec<_>, _>>()?;
    raws.iter().map(|raw| from_json(raw)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wipe_removes_the_database_file_and_recreates_schema() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cache.sqlite3");
        let cache = Cache::open(path.clone()).unwrap();
        cache.with(|conn| mark_synced(conn, "programs", "2026-01-01T00:00:00Z")).unwrap();
        cache.wipe().unwrap();
        assert!(path.exists());
        let synced = cache.with(|conn| synced_at(conn, "programs")).unwrap();
        assert!(synced.is_none());
    }
}
