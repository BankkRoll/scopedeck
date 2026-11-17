use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_notification::{NotificationExt, PermissionState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
use url::Url;

use crate::error::{CommandError, CommandResult};
use crate::files;

const ALLOWED_HOSTS: &[&str] = &["hackerone.com", "docs.hackerone.com", "api.hackerone.com"];

// SECURITY: only HTTPS links to HackerOne's own hosts leave the app; anything else a page
// (or a malicious markdown link in a report) asks to open is refused.
pub(crate) fn allowed_external_url(raw: &str) -> Option<Url> {
    let url = Url::parse(raw).ok()?;
    let host = url.host_str()?;
    let allowed = url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && ALLOWED_HOSTS.contains(&host);
    allowed.then_some(url)
}

#[tauri::command]
pub(crate) fn open_external(app: AppHandle, url: String) -> CommandResult<()> {
    let url = allowed_external_url(&url)
        .ok_or_else(|| CommandError::invalid("only https://hackerone.com links can be opened"))?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|error| CommandError::file(format!("could not open the browser: {error}")))
}

#[tauri::command]
pub(crate) async fn save_text_file(
    app: AppHandle,
    default_name: String,
    extension: String,
    contents: String,
) -> CommandResult<bool> {
    if !matches!(extension.as_str(), "csv" | "json" | "txt" | "md") {
        return Err(CommandError::invalid("unsupported export format"));
    }
    files::save_text(&app, &default_name, &extension, contents).await
}

#[tauri::command]
pub(crate) fn notifications_enable(app: AppHandle) -> CommandResult<bool> {
    let notifications = app.notification();
    let state = match notifications.permission_state() {
        Ok(PermissionState::Granted) => PermissionState::Granted,
        _ => notifications
            .request_permission()
            .map_err(|error| CommandError::file(format!("notifications are unavailable: {error}")))?,
    };
    Ok(state == PermissionState::Granted)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

fn update_error(error: impl std::fmt::Display) -> CommandError {
    CommandError::Update { message: error.to_string() }
}

#[tauri::command]
pub(crate) async fn update_check(app: AppHandle) -> CommandResult<Option<UpdateInfo>> {
    let update = app.updater().map_err(update_error)?.check().await.map_err(update_error)?;
    Ok(update.map(|update| UpdateInfo { version: update.version, notes: update.body }))
}

#[tauri::command]
pub(crate) async fn update_install(app: AppHandle) -> CommandResult<()> {
    let Some(update) = app.updater().map_err(update_error)?.check().await.map_err(update_error)? else {
        return Err(update_error("no update is available"));
    };
    update.download_and_install(|_, _| {}, || {}).await.map_err(update_error)?;
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_https_hackerone_links_are_allowed() {
        assert!(allowed_external_url("https://hackerone.com/reports/1337").is_some());
        assert!(allowed_external_url("https://hackerone.com/settings/api_token/edit").is_some());
        assert!(allowed_external_url("http://hackerone.com/").is_none());
        assert!(allowed_external_url("https://hackerone.com.evil.example/").is_none());
        assert!(allowed_external_url("https://evil.example/?https://hackerone.com").is_none());
        assert!(allowed_external_url("https://user@hackerone.com/").is_none());
        assert!(allowed_external_url("file:///etc/passwd").is_none());
        assert!(allowed_external_url("javascript:alert(1)").is_none());
    }
}
