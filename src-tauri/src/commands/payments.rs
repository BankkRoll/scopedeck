use tauri::State;

use crate::cache::Cached;
use crate::cache::payments::EarningsSnapshot;
use crate::error::CommandResult;
use crate::state::AppState;
use crate::sync;

#[tauri::command]
pub(crate) fn earnings_cached(state: State<'_, AppState>) -> CommandResult<Cached<EarningsSnapshot>> {
    sync::cached_earnings(&state.cache)
}

#[tauri::command]
pub(crate) async fn earnings_sync(state: State<'_, AppState>) -> CommandResult<Cached<EarningsSnapshot>> {
    let client = state.client().await?;
    sync::earnings(&client, &state.cache).await
}
