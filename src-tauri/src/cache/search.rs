use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

use super::CacheError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SearchKind {
    Program,
    Scope,
    Hacktivity,
}

impl SearchKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Program => "program",
            Self::Scope => "scope",
            Self::Hacktivity => "hacktivity",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "program" => Some(Self::Program),
            "scope" => Some(Self::Scope),
            "hacktivity" => Some(Self::Hacktivity),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchHit {
    pub kind: SearchKind,
    pub reference: String,
    pub program: Option<String>,
    pub title: String,
    pub detail: String,
}

pub(crate) struct IndexEntry<'a> {
    pub reference: &'a str,
    pub program: Option<&'a str>,
    pub title: &'a str,
    pub detail: &'a str,
}

pub(crate) fn replace(
    conn: &Connection,
    kind: SearchKind,
    program: Option<&str>,
    entries: &[IndexEntry<'_>],
) -> Result<(), CacheError> {
    match program {
        Some(program) => {
            conn.execute("DELETE FROM search_index WHERE kind = ?1 AND program = ?2", params![kind.as_str(), program])?
        }
        None => conn.execute("DELETE FROM search_index WHERE kind = ?1", [kind.as_str()])?,
    };
    insert(conn, kind, entries)
}

pub(crate) fn insert(conn: &Connection, kind: SearchKind, entries: &[IndexEntry<'_>]) -> Result<(), CacheError> {
    let mut remove = conn.prepare_cached("DELETE FROM search_index WHERE kind = ?1 AND ref = ?2")?;
    let mut add = conn
        .prepare_cached("INSERT INTO search_index (kind, ref, program, title, detail) VALUES (?1, ?2, ?3, ?4, ?5)")?;
    for entry in entries {
        remove.execute(params![kind.as_str(), entry.reference])?;
        add.execute(params![kind.as_str(), entry.reference, entry.program, entry.title, entry.detail])?;
    }
    Ok(())
}

/// Turns free text into an FTS5 prefix query. Every token is quoted so user input can never be
/// interpreted as FTS syntax (`NEAR`, `*`, column filters, unbalanced quotes).
pub(crate) fn fts_query(input: &str) -> Option<String> {
    let tokens: Vec<String> = input
        .split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-' && c != '.')
        .map(|token| token.trim_matches(|c: char| c == '-' || c == '.'))
        .filter(|token| !token.is_empty())
        .map(|token| format!("\"{}\"*", token.replace('"', "")))
        .collect();
    (!tokens.is_empty()).then(|| tokens.join(" "))
}

pub(crate) fn search(
    conn: &Connection,
    input: &str,
    kinds: &[SearchKind],
    limit: u32,
) -> Result<Vec<SearchHit>, CacheError> {
    let Some(query) = fts_query(input) else {
        return Ok(Vec::new());
    };
    let mut statement = conn.prepare_cached(
        "SELECT kind, ref, program, title, detail FROM search_index
         WHERE search_index MATCH ?1 ORDER BY bm25(search_index, 0, 0, 0, 4.0, 1.0) LIMIT ?2",
    )?;
    let rows = statement.query_map(params![query, limit.saturating_mul(3)], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
        ))
    })?;
    let mut hits = Vec::new();
    for row in rows {
        let (kind, reference, program, title, detail) = row?;
        let Some(kind) = SearchKind::parse(&kind) else { continue };
        if !kinds.is_empty() && !kinds.contains(&kind) {
            continue;
        }
        hits.push(SearchHit { kind, reference, program, title, detail });
        if hits.len() >= limit as usize {
            break;
        }
    }
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::Cache;

    #[test]
    fn quotes_tokens_to_neutralise_fts_syntax() {
        assert_eq!(fts_query("api.acme NEAR \"x"), Some("\"api.acme\"* \"NEAR\"* \"x\"*".into()));
        assert_eq!(fts_query("  ** ()"), None);
    }

    #[test]
    fn finds_prefix_matches_filtered_by_kind() {
        let cache = Cache::in_memory().unwrap();
        cache
            .with(|conn| {
                replace(
                    conn,
                    SearchKind::Program,
                    None,
                    &[IndexEntry { reference: "acme", program: Some("acme"), title: "Acme Corp", detail: "acme" }],
                )?;
                replace(
                    conn,
                    SearchKind::Scope,
                    Some("acme"),
                    &[IndexEntry { reference: "1", program: Some("acme"), title: "api.acme.com", detail: "URL" }],
                )?;
                Ok(())
            })
            .unwrap();
        let all = cache.with(|conn| search(conn, "acm", &[], 10)).unwrap();
        assert_eq!(all.len(), 2);
        let scopes = cache.with(|conn| search(conn, "api.acme", &[SearchKind::Scope], 10)).unwrap();
        assert_eq!(scopes[0].reference, "1");
        cache.with(|conn| replace(conn, SearchKind::Scope, Some("acme"), &[])).unwrap();
        assert!(cache.with(|conn| search(conn, "api", &[SearchKind::Scope], 10)).unwrap().is_empty());
    }
}
