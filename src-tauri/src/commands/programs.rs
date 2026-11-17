use tauri::State;

use crate::cache::notes::{self, ProgramNote};
use crate::cache::programs::{ProgramDetail, ProgramRow};
use crate::cache::search::{SearchHit, SearchKind};
use crate::cache::{self, Cached, now};
use crate::error::{CommandError, CommandResult};
use crate::state::AppState;
use crate::sync;

const MAX_SEARCH_RESULTS: u32 = 50;
const MAX_NOTE_CHARS: usize = 100_000;

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

fn note_get(state: &AppState, handle: &str) -> CommandResult<Option<ProgramNote>> {
    let handle = valid_handle(handle)?;
    Ok(state.cache.with(|conn| notes::note(conn, handle))?)
}

fn note_save(state: &AppState, handle: &str, body: &str) -> CommandResult<ProgramNote> {
    let handle = valid_handle(handle)?;
    if body.chars().count() > MAX_NOTE_CHARS {
        return Err(CommandError::invalid("notes are limited to 100,000 characters"));
    }
    Ok(state.cache.with(|conn| notes::save_note(conn, handle, body))?)
}

#[tauri::command]
pub(crate) fn program_note_get(state: State<'_, AppState>, handle: String) -> CommandResult<Option<ProgramNote>> {
    note_get(&state, &handle)
}

/// A blank `body` deletes the note and returns `{ body: "", updatedAt }`.
#[tauri::command]
pub(crate) fn program_note_save(
    state: State<'_, AppState>,
    handle: String,
    body: String,
) -> CommandResult<ProgramNote> {
    note_save(&state, &handle, &body)
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

    #[test]
    fn notes_are_keyed_by_validated_handle_and_size_limited() {
        let state = crate::commands::ai::testing::state(None);
        assert!(note_get(&state, " acme ").unwrap().is_none());
        assert!(matches!(note_save(&state, "../acme", "x"), Err(CommandError::Invalid { .. })));
        assert!(matches!(note_get(&state, "a b"), Err(CommandError::Invalid { .. })));
        let saved = note_save(&state, " acme ", "watch the GraphQL endpoint").unwrap();
        assert_eq!(note_get(&state, "acme").unwrap(), Some(saved));
        let too_long = "x".repeat(MAX_NOTE_CHARS + 1);
        assert!(matches!(note_save(&state, "acme", &too_long), Err(CommandError::Invalid { .. })));
        assert_eq!(note_save(&state, "acme", "").unwrap().body, "");
        assert!(note_get(&state, "acme").unwrap().is_none());
    }
}
