use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

use super::{CacheError, now};

/// A free-form, local-only note attached to a program handle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProgramNote {
    pub body: String,
    pub updated_at: String,
}

pub(crate) fn note(conn: &Connection, handle: &str) -> Result<Option<ProgramNote>, CacheError> {
    Ok(conn
        .query_row("SELECT body, updated_at FROM program_notes WHERE handle = ?1", [handle], |row| {
            Ok(ProgramNote { body: row.get(0)?, updated_at: row.get(1)? })
        })
        .optional()?)
}

/// Upserts the note, or deletes it when `body` is blank so empty notes never linger.
pub(crate) fn save_note(conn: &Connection, handle: &str, body: &str) -> Result<ProgramNote, CacheError> {
    let updated_at = now();
    if body.trim().is_empty() {
        conn.execute("DELETE FROM program_notes WHERE handle = ?1", [handle])?;
        return Ok(ProgramNote { body: String::new(), updated_at });
    }
    conn.execute(
        "INSERT INTO program_notes (handle, body, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(handle) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at",
        params![handle, body, updated_at],
    )?;
    Ok(ProgramNote { body: body.to_owned(), updated_at })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::Cache;

    #[test]
    fn notes_upsert_and_blank_bodies_delete() {
        let cache = Cache::in_memory().unwrap();
        assert!(cache.with(|conn| note(conn, "acme")).unwrap().is_none());
        cache.with(|conn| save_note(conn, "acme", "first")).unwrap();
        let saved = cache.with(|conn| save_note(conn, "acme", "## Scope\n- api.acme.com")).unwrap();
        assert_eq!(cache.with(|conn| note(conn, "acme")).unwrap(), Some(saved));
        assert!(cache.with(|conn| note(conn, "other")).unwrap().is_none());
        let cleared = cache.with(|conn| save_note(conn, "acme", "  \n ")).unwrap();
        assert_eq!(cleared.body, "");
        assert!(cache.with(|conn| note(conn, "acme")).unwrap().is_none());
    }
}
