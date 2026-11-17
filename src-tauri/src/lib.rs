#![deny(clippy::all)]
#![warn(clippy::pedantic)]

mod ai;
mod api;
mod background;
mod cache;
mod commands;
mod credentials;
mod error;
mod files;
mod logging;
mod redaction;
mod state;
mod sync;

#[cfg(test)]
mod leak_tests;

use tauri::Manager;
use url::Url;

use crate::cache::Cache;
use crate::credentials::KeychainStore;
use crate::redaction::SecretRegistry;
use crate::state::AppState;

const API_BASE_URL_ENV: &str = "SCOPEDECK_API_BASE_URL";

/// Tests and local development may point the client at a mock server, but only over HTTPS or
/// at loopback, so a stray environment variable cannot send credentials across the network.
fn api_base_url() -> Url {
    let production =
        || Url::parse(api::client::PRODUCTION_BASE_URL).unwrap_or_else(|_| unreachable!("constant URL parses"));
    let Ok(raw) = std::env::var(API_BASE_URL_ENV) else {
        return production();
    };
    match Url::parse(&raw) {
        Ok(url)
            if url.scheme() == "https"
                || url.host_str().is_some_and(|host| host == "127.0.0.1" || host == "localhost") =>
        {
            url
        }
        _ => {
            tracing::warn!("ignoring {API_BASE_URL_ENV}: only https or loopback URLs are accepted");
            production()
        }
    }
}

/// Builds and runs the Tauri application.
///
/// # Panics
///
/// Panics if the Tauri runtime fails to start, which leaves nothing to recover into.
pub fn run() {
    let secrets = SecretRegistry::default();
    logging::init(secrets.clone());

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let cache = Cache::open(data_dir.join("cache.sqlite3"))?;
            app.manage(AppState::new(api_base_url(), cache, Box::new(KeychainStore), Box::new(KeychainStore), secrets));
            background::spawn(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::auth_status,
            commands::auth::sign_in,
            commands::auth::sign_out,
            commands::programs::programs_cached,
            commands::programs::programs_sync,
            commands::programs::program_cached,
            commands::programs::program_sync,
            commands::programs::program_set_pinned,
            commands::programs::program_note_get,
            commands::programs::program_note_save,
            commands::programs::local_search,
            commands::reports::reports_cached,
            commands::reports::reports_sync,
            commands::reports::report_cached,
            commands::reports::report_sync,
            commands::reports::report_preview,
            commands::reports::report_submit,
            commands::intents::intents_list,
            commands::intents::intent_get,
            commands::intents::intent_create,
            commands::intents::intent_update,
            commands::intents::intent_delete,
            commands::intents::intent_submit,
            commands::intents::intent_watch,
            commands::intents::intent_attachments,
            commands::intents::intent_attachments_add,
            commands::intents::intent_attachment_delete,
            commands::hacktivity::hacktivity_cached,
            commands::hacktivity::hacktivity_fetch,
            commands::payments::earnings_cached,
            commands::payments::earnings_sync,
            commands::workspace::drafts_list,
            commands::workspace::draft_get,
            commands::workspace::draft_save,
            commands::workspace::draft_delete,
            commands::workspace::draft_attachments_pick,
            commands::workspace::draft_attachment_remove,
            commands::workspace::templates_list,
            commands::workspace::template_save,
            commands::workspace::template_delete,
            commands::workspace::saved_searches_list,
            commands::workspace::saved_search_save,
            commands::workspace::saved_search_delete,
            commands::workspace::settings_get,
            commands::workspace::settings_save,
            commands::workspace::cache_clear,
            commands::ai::ai_settings_get,
            commands::ai::ai_settings_save,
            commands::ai::ai_test,
            commands::ai::ai_complete,
            commands::system::open_external,
            commands::system::save_text_file,
            commands::system::notifications_enable,
            commands::system::update_check,
            commands::system::update_install,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        tracing::error!(error = %error, "the application exited with an error");
        panic!("failed to run Scopedeck: {error}");
    }
}
