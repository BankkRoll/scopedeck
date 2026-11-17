use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::cache::reports::ReportChange;
use crate::cache::workspace;
use crate::state::AppState;
use crate::sync;

pub(crate) const REPORTS_UPDATED_EVENT: &str = "reports-updated";
pub(crate) const SYNC_FAILED_EVENT: &str = "background-sync-failed";
const MAX_NOTIFICATIONS_PER_SYNC: usize = 5;

fn state_label(state: Option<&str>) -> String {
    state.map_or_else(|| "unknown".to_owned(), |state| state.replace('-', " "))
}

pub(crate) fn notification_text(change: &ReportChange) -> (String, String) {
    match change {
        ReportChange::StateChanged { id, title, from, to } => (
            format!("Report #{id} is now {}", state_label(to.as_deref())),
            format!("{title} (was {})", state_label(from.as_deref())),
        ),
        ReportChange::NewActivity { id, title } => (format!("New activity on report #{id}"), title.clone()),
    }
}

pub(crate) fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let minutes = app
                .state::<AppState>()
                .cache
                .with(|conn| workspace::settings(conn))
                .map_or(15, |settings| settings.sync_interval_minutes);
            tokio::time::sleep(Duration::from_secs(u64::from(minutes) * 60)).await;
            refresh_reports(&app).await;
        }
    });
}

async fn refresh_reports(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Some(client) = state.try_client().await else {
        return;
    };
    let changes = match sync::reports(&client, &state.cache).await {
        Ok((_, changes)) => changes,
        Err(error) => {
            tracing::warn!(error = %error, "background report sync failed");
            let _ = app.emit(SYNC_FAILED_EVENT, &error);
            return;
        }
    };
    let _ = app.emit(REPORTS_UPDATED_EVENT, &changes);
    let notify = state.cache.with(|conn| workspace::settings(conn)).is_ok_and(|settings| settings.notifications);
    if !notify {
        return;
    }
    for change in changes.iter().take(MAX_NOTIFICATIONS_PER_SYNC) {
        let (title, body) = notification_text(change);
        if let Err(error) = app.notification().builder().title(title).body(body).show() {
            tracing::warn!(error = %error, "could not show notification");
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notification_copy_names_the_report_and_state() {
        let (title, body) = notification_text(&ReportChange::StateChanged {
            id: "7".into(),
            title: "IDOR".into(),
            from: Some("new".into()),
            to: Some("needs-more-info".into()),
        });
        assert_eq!(title, "Report #7 is now needs more info");
        assert_eq!(body, "IDOR (was new)");
    }
}
