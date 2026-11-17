use serde::Serialize;
use tauri::State;

use crate::api::programs;
use crate::credentials::Credentials;
use crate::error::CommandResult;
use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AuthStatus {
    pub username: Option<String>,
}

#[tauri::command]
pub(crate) async fn auth_status(state: State<'_, AppState>) -> CommandResult<AuthStatus> {
    Ok(AuthStatus { username: state.restore().await? })
}

/// Validates the credentials with one authenticated request before anything is persisted, so a
/// typo never lands in the keychain. Switching to a different account clears the previous cache.
#[tauri::command]
pub(crate) async fn sign_in(state: State<'_, AppState>, username: String, token: String) -> CommandResult<AuthStatus> {
    let credentials = Credentials::new(&username, &token)?;
    let client = state.client_for(credentials.clone())?;
    programs::verify_access(&client).await?;
    let previous = state.restore().await.ok().flatten();
    if previous.as_deref().is_some_and(|previous| previous != credentials.username) {
        state.cache.wipe()?;
    }
    let username = credentials.username.clone();
    state.activate(credentials, client).await?;
    tracing::info!("signed in");
    Ok(AuthStatus { username: Some(username) })
}

#[tauri::command]
pub(crate) async fn sign_out(state: State<'_, AppState>) -> CommandResult<()> {
    state.sign_out().await?;
    tracing::info!("signed out and wiped local data");
    Ok(())
}
