use tauri::State;

use crate::api::hacktivity::{self, HacktivityQuery};
use crate::cache::hacktivity::CachedPage;
use crate::cache::{self, now};
use crate::error::{CommandError, CommandResult};
use crate::state::AppState;

const MAX_QUERY_LENGTH: usize = 2_000;

fn validated(query: &HacktivityQuery) -> CommandResult<()> {
    if query.query_string.len() > MAX_QUERY_LENGTH {
        return Err(CommandError::invalid("the query is longer than 2,000 characters"));
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn hacktivity_cached(
    state: State<'_, AppState>,
    query: HacktivityQuery,
) -> CommandResult<Option<CachedPage>> {
    validated(&query)?;
    Ok(state.cache.with(|conn| cache::hacktivity::page(conn, &query.cache_key(), query.page_number.max(1)))?)
}

#[tauri::command]
pub(crate) async fn hacktivity_fetch(state: State<'_, AppState>, query: HacktivityQuery) -> CommandResult<CachedPage> {
    validated(&query)?;
    let client = state.client().await?;
    let page = hacktivity::search(&client, &query).await?;
    let fetched_at = now();
    state.cache.with(|conn| cache::hacktivity::store_page(conn, &query.cache_key(), &page, &fetched_at))?;
    Ok(CachedPage { page, fetched_at })
}
