use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

use super::search::{self, IndexEntry, SearchKind};
use super::{CacheError, from_json, to_json};
use crate::api::hacktivity::HacktivityPage;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CachedPage {
    pub page: HacktivityPage,
    pub fetched_at: String,
}

pub(crate) fn store_page(
    conn: &Connection,
    query_key: &str,
    page: &HacktivityPage,
    fetched_at: &str,
) -> Result<(), CacheError> {
    conn.execute(
        "INSERT INTO hacktivity_pages (query_key, page_number, body, fetched_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(query_key, page_number) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at",
        params![query_key, page.page_number, to_json(page)?, fetched_at],
    )?;
    let details: Vec<String> = page
        .items
        .iter()
        .map(|item| {
            [item.program_name.as_deref(), item.cwe.as_deref(), item.reporter_username.as_deref()]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect();
    let entries: Vec<IndexEntry<'_>> = page
        .items
        .iter()
        .zip(&details)
        .filter_map(|(item, detail)| {
            item.title.as_deref().map(|title| IndexEntry {
                reference: &item.id,
                program: item.program_handle.as_deref(),
                title,
                detail,
            })
        })
        .collect();
    search::insert(conn, SearchKind::Hacktivity, &entries)
}

pub(crate) fn page(conn: &Connection, query_key: &str, page_number: u32) -> Result<Option<CachedPage>, CacheError> {
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT body, fetched_at FROM hacktivity_pages WHERE query_key = ?1 AND page_number = ?2",
            params![query_key, page_number],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    row.map(|(body, fetched_at)| Ok(CachedPage { page: from_json(&body)?, fetched_at })).transpose()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::Cache;

    #[test]
    fn round_trips_pages_and_indexes_titles() {
        let cache = Cache::in_memory().unwrap();
        let page_value: HacktivityPage = serde_json::from_value(serde_json::json!({
            "items": [{
                "id": "7", "title": "Stored XSS in markdown", "substate": "resolved", "url": null, "disclosed": true,
                "disclosedAt": null, "submittedAt": null, "cveIds": [], "cwe": "Cross-site Scripting", "severityRating": "high",
                "votes": 3, "totalAwardedAmount": 500.0, "latestDisclosableAction": null, "latestDisclosableActivityAt": null,
                "summary": null, "reporterUsername": "finder", "programHandle": "acme", "programName": "Acme", "programUrl": null
            }],
            "pageNumber": 1, "hasNextPage": false
        }))
        .unwrap();
        cache.with(|conn| store_page(conn, "k", &page_value, "t")).unwrap();
        let cached = cache.with(|conn| page(conn, "k", 1)).unwrap().unwrap();
        assert_eq!(cached.page.items.len(), 1);
        assert!(cache.with(|conn| page(conn, "k", 2)).unwrap().is_none());
        let hits = cache.with(|conn| search::search(conn, "markd", &[SearchKind::Hacktivity], 5)).unwrap();
        assert_eq!(hits[0].reference, "7");
    }
}
