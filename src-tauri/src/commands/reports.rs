use tauri::State;

use crate::api::reports::{self, NewReport, Report};
use crate::cache::{self, Cached};
use crate::error::{CommandError, CommandResult};
use crate::state::AppState;
use crate::sync;

fn valid_report_id(id: &str) -> CommandResult<&str> {
    let trimmed = id.trim();
    if !trimmed.is_empty() && trimmed.len() <= 20 && trimmed.chars().all(|c| c.is_ascii_digit()) {
        Ok(trimmed)
    } else {
        Err(CommandError::invalid(format!("{id:?} is not a report id")))
    }
}

#[tauri::command]
pub(crate) fn reports_cached(state: State<'_, AppState>) -> CommandResult<Cached<Vec<Report>>> {
    sync::cached_reports(&state.cache)
}

#[tauri::command]
pub(crate) async fn reports_sync(state: State<'_, AppState>) -> CommandResult<Cached<Vec<Report>>> {
    let client = state.client().await?;
    let (reports, _) = sync::reports(&client, &state.cache).await?;
    Ok(reports)
}

#[tauri::command]
pub(crate) fn report_cached(state: State<'_, AppState>, id: String) -> CommandResult<Option<Report>> {
    let id = valid_report_id(&id)?;
    Ok(state.cache.with(|conn| cache::reports::detail(conn, id))?)
}

#[tauri::command]
pub(crate) async fn report_sync(state: State<'_, AppState>, id: String) -> CommandResult<Report> {
    let id = valid_report_id(&id)?;
    let client = state.client().await?;
    let report = reports::get(&client, id).await?;
    state.cache.with(|conn| cache::reports::store_detail(conn, &report))?;
    Ok(report)
}

/// Returns the exact JSON body `report_submit` would send, for the confirmation step.
#[tauri::command]
pub(crate) fn report_preview(input: NewReport) -> CommandResult<serde_json::Value> {
    Ok(input.request_body()?)
}

#[tauri::command]
pub(crate) async fn report_submit(state: State<'_, AppState>, input: NewReport) -> CommandResult<Report> {
    let body = input.request_body()?;
    let client = state.client().await?;
    let report = reports::create(&client, &body).await?;
    tracing::info!(report_id = %report.id, "report submitted");
    state.cache.with(|conn| cache::reports::store_detail(conn, &report))?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_numeric_report_ids() {
        assert_eq!(valid_report_id(" 1337 ").unwrap(), "1337");
        assert!(valid_report_id("13/37").is_err());
        assert!(valid_report_id("").is_err());
    }
}
