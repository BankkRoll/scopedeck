use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use std::collections::HashMap;

use super::{CacheError, from_json, to_json};
use crate::api::reports::Report;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub(crate) enum ReportChange {
    StateChanged { id: String, title: String, from: Option<String>, to: Option<String> },
    NewActivity { id: String, title: String },
}

/// Replaces the inbox with the latest list and reports what changed for reports that were
/// already known; reports seen for the first time are not announced.
pub(crate) fn replace_list(conn: &mut Connection, reports: &[Report]) -> Result<Vec<ReportChange>, CacheError> {
    let tx = conn.transaction()?;
    let previous: HashMap<String, (Option<String>, Option<String>)> = {
        let mut statement = tx.prepare("SELECT id, state, last_activity_at FROM reports")?;
        statement
            .query_map([], |row| Ok((row.get::<_, String>(0)?, (row.get(1)?, row.get(2)?))))?
            .collect::<Result<_, _>>()?
    };
    let mut changes = Vec::new();
    for report in reports {
        if let Some((state, last_activity)) = previous.get(&report.id) {
            if state != &report.state {
                changes.push(ReportChange::StateChanged {
                    id: report.id.clone(),
                    title: report.title.clone(),
                    from: state.clone(),
                    to: report.state.clone(),
                });
            } else if last_activity != &report.last_activity_at && report.last_activity_at.is_some() {
                changes.push(ReportChange::NewActivity { id: report.id.clone(), title: report.title.clone() });
            }
        }
        tx.execute(
            "INSERT INTO reports (id, body, state, last_activity_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET body = excluded.body, state = excluded.state, last_activity_at = excluded.last_activity_at",
            params![report.id, to_json(report)?, report.state, report.last_activity_at],
        )?;
    }
    let keep: Vec<&str> = reports.iter().map(|report| report.id.as_str()).collect();
    let stale: Vec<String> = previous.keys().filter(|id| !keep.contains(&id.as_str())).cloned().collect();
    for id in stale {
        tx.execute("DELETE FROM reports WHERE id = ?1", [id])?;
    }
    tx.commit()?;
    Ok(changes)
}

pub(crate) fn store_detail(conn: &Connection, report: &Report) -> Result<(), CacheError> {
    let body = to_json(report)?;
    conn.execute(
        "INSERT INTO reports (id, body, detail, state, last_activity_at) VALUES (?1, ?2, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET detail = excluded.detail",
        params![report.id, body, report.state, report.last_activity_at],
    )?;
    Ok(())
}

fn freshest(list: Report, detail: Option<Report>) -> Report {
    match detail {
        Some(detail) if detail.last_activity_at >= list.last_activity_at => {
            Report { state: list.state, last_activity_at: list.last_activity_at, ..detail }
        }
        _ => list,
    }
}

pub(crate) fn list(conn: &Connection) -> Result<Vec<Report>, CacheError> {
    let mut statement =
        conn.prepare("SELECT body, detail FROM reports ORDER BY last_activity_at DESC, CAST(id AS INTEGER) DESC")?;
    let rows = statement
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    rows.into_iter()
        .map(|(body, detail)| Ok(freshest(from_json(&body)?, detail.as_deref().map(from_json).transpose()?)))
        .collect()
}

pub(crate) fn detail(conn: &Connection, id: &str) -> Result<Option<Report>, CacheError> {
    let raw: Option<String> =
        conn.query_row("SELECT detail FROM reports WHERE id = ?1", [id], |row| row.get(0)).optional()?.flatten();
    raw.as_deref().map(from_json).transpose()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cache::Cache;

    fn report(id: &str, state: &str, activity: &str) -> Report {
        serde_json::from_value(serde_json::json!({
            "id": id, "title": format!("Report {id}"), "vulnerabilityInformation": null, "state": state,
            "createdAt": null, "submittedAt": null, "triagedAt": null, "closedAt": null,
            "lastActivityAt": activity, "lastReporterActivityAt": null, "firstProgramActivityAt": null,
            "lastProgramActivityAt": null, "bountyAwardedAt": null, "disclosedAt": null, "cveIds": [],
            "program": null, "weakness": null, "severity": null, "structuredScope": null,
            "activities": [], "attachments": [], "bounties": [], "summaries": []
        }))
        .unwrap()
    }

    #[test]
    fn detects_state_changes_and_new_activity_only_for_known_reports() {
        let cache = Cache::in_memory().unwrap();
        let first = cache.with(|conn| replace_list(conn, &[report("1", "new", "a"), report("2", "new", "a")])).unwrap();
        assert!(first.is_empty());
        let changes = cache
            .with(|conn| {
                replace_list(conn, &[report("1", "triaged", "b"), report("2", "new", "b"), report("3", "new", "a")])
            })
            .unwrap();
        assert_eq!(
            changes,
            [
                ReportChange::StateChanged {
                    id: "1".into(),
                    title: "Report 1".into(),
                    from: Some("new".into()),
                    to: Some("triaged".into())
                },
                ReportChange::NewActivity { id: "2".into(), title: "Report 2".into() },
            ]
        );
        cache.with(|conn| replace_list(conn, &[report("3", "new", "a")])).unwrap();
        assert_eq!(cache.with(|conn| list(conn)).unwrap().len(), 1);
    }

    #[test]
    fn list_prefers_cached_detail_but_keeps_latest_state() {
        let cache = Cache::in_memory().unwrap();
        let mut detailed = report("1", "new", "a");
        detailed.vulnerability_information = Some("body".into());
        cache.with(|conn| store_detail(conn, &detailed)).unwrap();
        cache.with(|conn| replace_list(conn, &[report("1", "triaged", "a")])).unwrap();
        let rows = cache.with(|conn| list(conn)).unwrap();
        assert_eq!(rows[0].vulnerability_information.as_deref(), Some("body"));
        assert_eq!(rows[0].state.as_deref(), Some("triaged"));
    }
}
