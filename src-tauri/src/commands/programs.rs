use tauri::State;

use crate::cache::programs::{ProgramDetail, ProgramRow};
use crate::cache::search::{SearchHit, SearchKind};
use crate::cache::{self, Cached, now};
use crate::error::{CommandError, CommandResult};
use crate::state::AppState;
use crate::sync;

const MAX_SEARCH_RESULTS: u32 = 50;

fn valid_handle(handle: &str) -> CommandResult<&str> {
    let trimmed = handle.trim();
    let well_formed = !trimmed.is_empty()
        && trimmed.len() <= 100
        && trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.');
    if well_formed {
        Ok(trimmed)
    } else {
        Err(CommandError::invalid(format!("{handle:?} is not a valid program handle")))
    }
}

#[tauri::command]
pub(crate) fn programs_cached(state: State<'_, AppState>) -> CommandResult<Cached<Vec<ProgramRow>>> {
    sync::cached_programs(&state.cache)
}

#[tauri::command]
pub(crate) async fn programs_sync(state: State<'_, AppState>) -> CommandResult<Cached<Vec<ProgramRow>>> {
    let client = state.client().await?;
    sync::programs(&client, &state.cache).await
}

#[tauri::command]
pub(crate) fn program_cached(state: State<'_, AppState>, handle: String) -> CommandResult<Cached<ProgramDetail>> {
    sync::cached_program(&state.cache, valid_handle(&handle)?)
}

#[tauri::command]
pub(crate) async fn program_sync(state: State<'_, AppState>, handle: String) -> CommandResult<Cached<ProgramDetail>> {
    let handle = valid_handle(&handle)?;
    let client = state.client().await?;
    sync::program(&client, &state.cache, handle).await
}

#[tauri::command]
pub(crate) fn program_set_pinned(state: State<'_, AppState>, handle: String, pinned: bool) -> CommandResult<()> {
    let handle = valid_handle(&handle)?;
    Ok(state.cache.with(|conn| cache::programs::set_pinned(conn, handle, pinned, &now()))?)
}

#[tauri::command]
pub(crate) fn local_search(
    state: State<'_, AppState>,
    query: String,
    kinds: Vec<SearchKind>,
    limit: Option<u32>,
) -> CommandResult<Vec<SearchHit>> {
    let limit = limit.unwrap_or(20).clamp(1, MAX_SEARCH_RESULTS);
    Ok(state.cache.with(|conn| cache::search::search(conn, &query, &kinds, limit))?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_handles_that_could_escape_the_path() {
        assert_eq!(valid_handle(" acme-corp_1.io ").unwrap(), "acme-corp_1.io");
        assert!(valid_handle("../payments").is_err());
        assert!(valid_handle("a b").is_err());
        assert!(valid_handle("").is_err());
    }
}
