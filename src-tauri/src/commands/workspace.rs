use tauri::{AppHandle, State};

use crate::cache::workspace::{self, Draft, DraftContent, SavedSearch, Settings, Template, TemplateContent};
use crate::error::{CommandError, CommandResult};
use crate::files;
use crate::state::AppState;

const MAX_NAME_LENGTH: usize = 120;

fn require_draft(state: &AppState, id: &str) -> CommandResult<Draft> {
    state
        .cache
        .with(|conn| workspace::draft(conn, id))?
        .ok_or_else(|| CommandError::NotFound { message: "that draft no longer exists".into() })
}

fn valid_name(name: &str) -> CommandResult<&str> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(CommandError::invalid("give it a name"));
    }
    if trimmed.chars().count() > MAX_NAME_LENGTH {
        return Err(CommandError::invalid("names are limited to 120 characters"));
    }
    Ok(trimmed)
}

#[tauri::command]
pub(crate) fn drafts_list(state: State<'_, AppState>) -> CommandResult<Vec<Draft>> {
    Ok(state.cache.with(|conn| workspace::drafts(conn))?)
}

#[tauri::command]
pub(crate) fn draft_get(state: State<'_, AppState>, id: String) -> CommandResult<Draft> {
    require_draft(&state, &id)
}

#[tauri::command]
pub(crate) fn draft_save(
    state: State<'_, AppState>,
    id: Option<String>,
    content: DraftContent,
) -> CommandResult<Draft> {
    Ok(state.cache.with(|conn| workspace::save_draft(conn, id.as_deref(), &content))?)
}

#[tauri::command]
pub(crate) fn draft_delete(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    Ok(state.cache.with(|conn| workspace::delete_draft(conn, &id))?)
}

/// The webview never supplies a file path: Rust opens the picker and keeps the path, so a
/// compromised page cannot ask the app to upload arbitrary files.
#[tauri::command]
pub(crate) async fn draft_attachments_pick(
    app: AppHandle,
    state: State<'_, AppState>,
    draft_id: String,
) -> CommandResult<Draft> {
    require_draft(&state, &draft_id)?;
    let picked = files::pick_files(&app).await?;
    state.cache.with(|conn| {
        for file in &picked {
            workspace::add_draft_attachment(
                conn,
                &draft_id,
                &file.path.to_string_lossy(),
                &file.file_name,
                file.size,
                &file.content_type,
            )?;
        }
        Ok(())
    })?;
    require_draft(&state, &draft_id)
}

#[tauri::command]
pub(crate) fn draft_attachment_remove(
    state: State<'_, AppState>,
    draft_id: String,
    attachment_id: String,
) -> CommandResult<Draft> {
    state.cache.with(|conn| workspace::remove_draft_attachment(conn, &draft_id, &attachment_id))?;
    require_draft(&state, &draft_id)
}

#[tauri::command]
pub(crate) fn templates_list(state: State<'_, AppState>) -> CommandResult<Vec<Template>> {
    Ok(state.cache.with(|conn| workspace::templates(conn))?)
}

#[tauri::command]
pub(crate) fn template_save(
    state: State<'_, AppState>,
    id: Option<String>,
    content: TemplateContent,
) -> CommandResult<Template> {
    let content = TemplateContent { name: valid_name(&content.name)?.to_owned(), ..content };
    Ok(state.cache.with(|conn| workspace::save_template(conn, id.as_deref(), &content))?)
}

#[tauri::command]
pub(crate) fn template_delete(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    Ok(state.cache.with(|conn| workspace::delete_template(conn, &id))?)
}

#[tauri::command]
pub(crate) fn saved_searches_list(state: State<'_, AppState>) -> CommandResult<Vec<SavedSearch>> {
    Ok(state.cache.with(|conn| workspace::saved_searches(conn))?)
}

#[tauri::command]
pub(crate) fn saved_search_save(
    state: State<'_, AppState>,
    name: String,
    builder: serde_json::Value,
) -> CommandResult<SavedSearch> {
    let name = valid_name(&name)?;
    Ok(state.cache.with(|conn| workspace::save_search(conn, name, builder))?)
}

#[tauri::command]
pub(crate) fn saved_search_delete(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    Ok(state.cache.with(|conn| workspace::delete_search(conn, &id))?)
}

#[tauri::command]
pub(crate) fn settings_get(state: State<'_, AppState>) -> CommandResult<Settings> {
    Ok(state.cache.with(|conn| workspace::settings(conn))?)
}

#[tauri::command]
pub(crate) fn settings_save(state: State<'_, AppState>, settings: Settings) -> CommandResult<Settings> {
    Ok(state.cache.with(|conn| workspace::save_settings(conn, settings))?)
}

#[tauri::command]
pub(crate) fn cache_clear(state: State<'_, AppState>) -> CommandResult<()> {
    Ok(state.cache.with(crate::cache::clear_synced_data)?)
}
