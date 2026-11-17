use rusqlite::Connection;

const MIGRATIONS: &[&str] = &[r"
CREATE TABLE sync_state (
    resource TEXT PRIMARY KEY,
    synced_at TEXT NOT NULL
);

CREATE TABLE programs (
    handle TEXT PRIMARY KEY,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    position INTEGER NOT NULL
);

CREATE TABLE program_pins (
    handle TEXT PRIMARY KEY,
    pinned_at TEXT NOT NULL
);

CREATE TABLE program_capabilities (
    handle TEXT PRIMARY KEY,
    report_intents TEXT NOT NULL CHECK (report_intents IN ('supported', 'unsupported'))
);

CREATE TABLE structured_scopes (
    program_handle TEXT NOT NULL,
    id TEXT NOT NULL,
    body TEXT NOT NULL,
    changed_in_sync TEXT,
    PRIMARY KEY (program_handle, id)
);

CREATE TABLE scope_exclusions (
    program_handle TEXT NOT NULL,
    id TEXT NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (program_handle, id)
);

CREATE TABLE weaknesses (
    program_handle TEXT NOT NULL,
    id TEXT NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (program_handle, id)
);

CREATE TABLE reports (
    id TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    detail TEXT,
    state TEXT,
    last_activity_at TEXT
);

CREATE TABLE hacktivity_pages (
    query_key TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    body TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (query_key, page_number)
);

CREATE TABLE earnings (
    id TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    position INTEGER NOT NULL
);

CREATE TABLE payouts (
    position INTEGER PRIMARY KEY,
    body TEXT NOT NULL
);

CREATE TABLE kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE drafts (
    id TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    intent_id TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE draft_attachments (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    size INTEGER NOT NULL,
    content_type TEXT NOT NULL
);

CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE saved_searches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE search_index USING fts5(
    kind UNINDEXED,
    ref UNINDEXED,
    program UNINDEXED,
    title,
    detail,
    tokenize = 'unicode61 remove_diacritics 2'
);
"];

pub(crate) fn run(conn: &mut Connection) -> rusqlite::Result<()> {
    let current: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let applied = usize::try_from(current).unwrap_or(0);
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(applied) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", i64::try_from(index + 1).unwrap_or(i64::MAX))?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_idempotent_and_set_user_version() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn).unwrap();
        run(&mut conn).unwrap();
        let version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0)).unwrap();
        assert_eq!(usize::try_from(version).unwrap(), MIGRATIONS.len());
        conn.execute(
            "INSERT INTO search_index (kind, ref, program, title, detail) VALUES ('program', 'a', 'a', 'Acme', '')",
            [],
        )
        .unwrap();
    }
}
