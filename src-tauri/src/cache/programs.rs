use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use super::search::{self, IndexEntry, SearchKind};
use super::{CacheError, from_json, read_bodies, to_json};
use crate::api::programs::{Program, ScopeExclusion, StructuredScope, Weakness};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProgramRow {
    #[serde(flatten)]
    pub program: Program,
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScopeRow {
    #[serde(flatten)]
    pub scope: StructuredScope,
    pub changed_since_last_sync: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum IntentSupport {
    Unknown,
    Supported,
    Unsupported,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProgramDetail {
    pub program: Option<ProgramRow>,
    pub scopes: Vec<ScopeRow>,
    pub exclusions: Vec<ScopeExclusion>,
    pub weaknesses: Vec<Weakness>,
    pub report_intents: IntentSupport,
}

pub(crate) fn scope_resource(handle: &str) -> String {
    format!("program:{handle}")
}

pub(crate) fn replace_all(conn: &mut Connection, programs: &[Program]) -> Result<(), CacheError> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM programs", [])?;
    {
        let mut insert =
            tx.prepare_cached("INSERT INTO programs (handle, id, name, body, position) VALUES (?1, ?2, ?3, ?4, ?5)")?;
        for (position, program) in programs.iter().enumerate() {
            insert.execute(params![
                program.handle,
                program.id,
                program.name,
                to_json(program)?,
                super::sql_int(position)
            ])?;
        }
    }
    let entries: Vec<IndexEntry<'_>> = programs
        .iter()
        .map(|program| IndexEntry {
            reference: &program.handle,
            program: Some(&program.handle),
            title: &program.name,
            detail: &program.handle,
        })
        .collect();
    search::replace(&tx, SearchKind::Program, None, &entries)?;
    tx.commit()?;
    Ok(())
}

pub(crate) fn upsert(conn: &Connection, program: &Program) -> Result<(), CacheError> {
    conn.execute(
        "INSERT INTO programs (handle, id, name, body, position)
         VALUES (?1, ?2, ?3, ?4, COALESCE((SELECT MAX(position) + 1 FROM programs), 0))
         ON CONFLICT(handle) DO UPDATE SET id = excluded.id, name = excluded.name, body = excluded.body",
        params![program.handle, program.id, program.name, to_json(program)?],
    )?;
    search::insert(
        conn,
        SearchKind::Program,
        &[IndexEntry {
            reference: &program.handle,
            program: Some(&program.handle),
            title: &program.name,
            detail: &program.handle,
        }],
    )
}

pub(crate) fn list(conn: &Connection) -> Result<Vec<ProgramRow>, CacheError> {
    let mut statement = conn.prepare(
        "SELECT p.body, pin.handle IS NOT NULL FROM programs p
         LEFT JOIN program_pins pin ON pin.handle = p.handle ORDER BY p.position",
    )?;
    let rows = statement
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, bool>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    rows.into_iter().map(|(body, pinned)| Ok(ProgramRow { program: from_json(&body)?, pinned })).collect()
}

fn get(conn: &Connection, handle: &str) -> Result<Option<ProgramRow>, CacheError> {
    let row: Option<(String, bool)> = conn
        .query_row(
            "SELECT p.body, EXISTS(SELECT 1 FROM program_pins WHERE handle = p.handle) FROM programs p WHERE p.handle = ?1",
            [handle],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    row.map(|(body, pinned)| Ok(ProgramRow { program: from_json(&body)?, pinned })).transpose()
}

pub(crate) fn set_pinned(conn: &Connection, handle: &str, pinned: bool, at: &str) -> Result<(), CacheError> {
    if pinned {
        conn.execute(
            "INSERT INTO program_pins (handle, pinned_at) VALUES (?1, ?2) ON CONFLICT(handle) DO NOTHING",
            params![handle, at],
        )?;
    } else {
        conn.execute("DELETE FROM program_pins WHERE handle = ?1", [handle])?;
    }
    Ok(())
}

pub(crate) enum ScopeSync<'a> {
    Full { scopes: &'a [StructuredScope], changed_after: Option<&'a str> },
    Incremental { changed: &'a [StructuredScope] },
}

impl ScopeSync<'_> {
    fn scopes(&self) -> &[StructuredScope] {
        match self {
            Self::Full { scopes, .. } => scopes,
            Self::Incremental { changed } => changed,
        }
    }

    fn is_changed(&self, scope: &StructuredScope) -> bool {
        let parse = |raw: &str| OffsetDateTime::parse(raw, &Rfc3339).ok();
        match self {
            Self::Incremental { .. } => true,
            Self::Full { changed_after, .. } => {
                match (changed_after.and_then(parse), scope.updated_at.as_deref().and_then(parse)) {
                    (Some(threshold), Some(updated)) => updated > threshold,
                    _ => false,
                }
            }
        }
    }
}

pub(crate) fn store_scopes(
    conn: &mut Connection,
    handle: &str,
    sync: &ScopeSync<'_>,
    sync_stamp: &str,
) -> Result<(), CacheError> {
    let tx = conn.transaction()?;
    tx.execute("UPDATE structured_scopes SET changed_in_sync = NULL WHERE program_handle = ?1", [handle])?;
    if matches!(sync, ScopeSync::Full { .. }) {
        tx.execute("DELETE FROM structured_scopes WHERE program_handle = ?1", [handle])?;
    }
    let scopes = sync.scopes();
    {
        let mut upsert = tx.prepare_cached(
            "INSERT INTO structured_scopes (program_handle, id, body, changed_in_sync) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(program_handle, id) DO UPDATE SET body = excluded.body, changed_in_sync = excluded.changed_in_sync",
        )?;
        for scope in scopes {
            let stamp = sync.is_changed(scope).then_some(sync_stamp);
            upsert.execute(params![handle, scope.id, to_json(scope)?, stamp])?;
        }
    }
    let all: Vec<StructuredScope> =
        read_bodies(&tx, "SELECT body FROM structured_scopes WHERE program_handle = ?1", [handle])?;
    let entries: Vec<IndexEntry<'_>> = all
        .iter()
        .map(|scope| IndexEntry {
            reference: &scope.id,
            program: Some(handle),
            title: &scope.asset_identifier,
            detail: &scope.asset_type,
        })
        .collect();
    search::replace(&tx, SearchKind::Scope, Some(handle), &entries)?;
    tx.commit()?;
    Ok(())
}

pub(crate) fn store_exclusions_and_weaknesses(
    conn: &mut Connection,
    handle: &str,
    exclusions: &[ScopeExclusion],
    weaknesses: &[Weakness],
) -> Result<(), CacheError> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM scope_exclusions WHERE program_handle = ?1", [handle])?;
    tx.execute("DELETE FROM weaknesses WHERE program_handle = ?1", [handle])?;
    for exclusion in exclusions {
        tx.execute(
            "INSERT INTO scope_exclusions (program_handle, id, body) VALUES (?1, ?2, ?3)",
            params![handle, exclusion.id, to_json(exclusion)?],
        )?;
    }
    for weakness in weaknesses {
        tx.execute(
            "INSERT INTO weaknesses (program_handle, id, body) VALUES (?1, ?2, ?3)",
            params![handle, weakness.id, to_json(weakness)?],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub(crate) fn set_intent_support(conn: &Connection, handle: &str, support: IntentSupport) -> Result<(), CacheError> {
    let value = match support {
        IntentSupport::Supported => "supported",
        IntentSupport::Unsupported => "unsupported",
        IntentSupport::Unknown => {
            conn.execute("DELETE FROM program_capabilities WHERE handle = ?1", [handle])?;
            return Ok(());
        }
    };
    conn.execute(
        "INSERT INTO program_capabilities (handle, report_intents) VALUES (?1, ?2)
         ON CONFLICT(handle) DO UPDATE SET report_intents = excluded.report_intents",
        params![handle, value],
    )?;
    Ok(())
}

fn intent_support(conn: &Connection, handle: &str) -> Result<IntentSupport, CacheError> {
    let value: Option<String> = conn
        .query_row("SELECT report_intents FROM program_capabilities WHERE handle = ?1", [handle], |row| row.get(0))
        .optional()?;
    Ok(match value.as_deref() {
        Some("supported") => IntentSupport::Supported,
        Some("unsupported") => IntentSupport::Unsupported,
        _ => IntentSupport::Unknown,
    })
}

pub(crate) fn detail(conn: &Connection, handle: &str) -> Result<ProgramDetail, CacheError> {
    let mut statement = conn.prepare(
        "SELECT body, changed_in_sync IS NOT NULL FROM structured_scopes WHERE program_handle = ?1 ORDER BY CAST(id AS INTEGER), id",
    )?;
    let rows = statement
        .query_map([handle], |row| Ok((row.get::<_, String>(0)?, row.get::<_, bool>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    let scopes = rows
        .into_iter()
        .map(|(body, changed)| Ok(ScopeRow { scope: from_json(&body)?, changed_since_last_sync: changed }))
        .collect::<Result<Vec<_>, CacheError>>()?;
    Ok(ProgramDetail {
        program: get(conn, handle)?,
        scopes,
        exclusions: read_bodies(
            conn,
            "SELECT body FROM scope_exclusions WHERE program_handle = ?1 ORDER BY id",
            [handle],
        )?,
        weaknesses: read_bodies(conn, "SELECT body FROM weaknesses WHERE program_handle = ?1", [handle])?,
        report_intents: intent_support(conn, handle)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::Cache;

    fn scope(id: &str, updated: &str) -> StructuredScope {
        StructuredScope {
            id: id.into(),
            asset_identifier: format!("{id}.acme.com"),
            asset_type: "URL".into(),
            eligible_for_bounty: true,
            eligible_for_submission: true,
            instruction: None,
            max_severity: Some("critical".into()),
            confidentiality_requirement: None,
            integrity_requirement: None,
            availability_requirement: None,
            reference: None,
            created_at: None,
            updated_at: Some(updated.into()),
        }
    }

    #[test]
    fn flags_scopes_changed_since_previous_sync() {
        let cache = Cache::in_memory().unwrap();
        let scopes = [scope("1", "2026-01-01T00:00:00Z"), scope("2", "2026-03-01T00:00:00Z")];
        cache
            .with(|conn| {
                store_scopes(
                    conn,
                    "acme",
                    &ScopeSync::Full { scopes: &scopes, changed_after: Some("2026-02-01T00:00:00Z") },
                    "s1",
                )
            })
            .unwrap();
        let loaded = cache.with(|conn| detail(conn, "acme")).unwrap();
        let flags: Vec<_> =
            loaded.scopes.iter().map(|row| (row.scope.id.as_str(), row.changed_since_last_sync)).collect();
        assert_eq!(flags, [("1", false), ("2", true)]);

        let changed = [scope("1", "2026-04-01T00:00:00Z")];
        cache.with(|conn| store_scopes(conn, "acme", &ScopeSync::Incremental { changed: &changed }, "s2")).unwrap();
        let loaded = cache.with(|conn| detail(conn, "acme")).unwrap();
        let flags: Vec<_> =
            loaded.scopes.iter().map(|row| (row.scope.id.as_str(), row.changed_since_last_sync)).collect();
        assert_eq!(flags, [("1", true), ("2", false)]);
    }

    #[test]
    fn remembers_pins_and_intent_support() {
        let cache = Cache::in_memory().unwrap();
        cache
            .with(|conn| {
                set_pinned(conn, "acme", true, "now")?;
                set_intent_support(conn, "acme", IntentSupport::Unsupported)
            })
            .unwrap();
        let loaded = cache.with(|conn| detail(conn, "acme")).unwrap();
        assert_eq!(loaded.report_intents, IntentSupport::Unsupported);
        assert!(loaded.program.is_none());
    }
}
