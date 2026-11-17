use tauri::{AppHandle, Emitter, State};

use crate::api::attachments::Attachment;
use crate::api::error::ApiError;
use crate::api::report_intents::{self, PollPolicy, ReportIntent};
use crate::api::reports;
use crate::cache::{self, programs::IntentSupport};
use crate::error::{CommandError, CommandResult};
use crate::files;
use crate::state::AppState;

pub(crate) const INTENT_UPDATED_EVENT: &str = "report-intent-updated";

fn valid_id<'a>(id: &'a str, label: &str) -> CommandResult<&'a str> {
    let trimmed = id.trim();
    if !trimmed.is_empty()
        && trimmed.len() <= 64
        && trimmed.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        Ok(trimmed)
    } else {
        Err(CommandError::invalid(format!("{id:?} is not a valid {label} id")))
    }
}

#[tauri::command]
pub(crate) async fn intents_list(state: State<'_, AppState>) -> CommandResult<Vec<ReportIntent>> {
    let client = state.client().await?;
    Ok(report_intents::list(&client).await?)
}

#[tauri::command]
pub(crate) async fn intent_get(state: State<'_, AppState>, id: String) -> CommandResult<ReportIntent> {
    let client = state.client().await?;
    Ok(report_intents::get(&client, valid_id(&id, "intent")?).await?)
}

/// Creates the intent and uploads the draft's attachments. A 403 or 422 from the create call is
/// how the API signals the program has no Report Assistant, so that answer is remembered.
#[tauri::command]
pub(crate) async fn intent_create(
    state: State<'_, AppState>,
    draft_id: String,
    team_handle: String,
    description: String,
) -> CommandResult<ReportIntent> {
    if description.trim().is_empty() {
        return Err(CommandError::invalid("the description is empty"));
    }
    let draft_id = valid_id(&draft_id, "draft")?;
    let team_handle = team_handle.trim().to_owned();
    let client = state.client().await?;
    let created = match report_intents::create(&client, &team_handle, &description).await {
        Ok(intent) => intent,
        Err(error @ (ApiError::Forbidden { .. } | ApiError::Unprocessable { .. })) => {
            state
                .cache
                .with(|conn| cache::programs::set_intent_support(conn, &team_handle, IntentSupport::Unsupported))?;
            return Err(error.into());
        }
        Err(error) => return Err(error.into()),
    };
    state.cache.with(|conn| {
        cache::programs::set_intent_support(conn, &team_handle, IntentSupport::Supported)?;
        cache::workspace::set_draft_intent(conn, draft_id, Some(&created.id))
    })?;
    let stored = state.cache.with(|conn| cache::workspace::stored_attachments(conn, draft_id))?;
    let mut uploads = Vec::with_capacity(stored.len());
    for attachment in &stored {
        uploads.push(files::read_upload(&attachment.path, &attachment.file_name, &attachment.content_type).await?);
    }
    for file in uploads {
        report_intents::upload_attachments(&client, &created.id, std::slice::from_ref(&file)).await?;
    }
    Ok(report_intents::get(&client, &created.id).await?)
}

#[tauri::command]
pub(crate) async fn intent_update(
    state: State<'_, AppState>,
    id: String,
    description: String,
) -> CommandResult<ReportIntent> {
    if description.trim().is_empty() {
        return Err(CommandError::invalid("the description is empty"));
    }
    let client = state.client().await?;
    Ok(report_intents::update(&client, valid_id(&id, "intent")?, &description).await?)
}

#[tauri::command]
pub(crate) async fn intent_delete(state: State<'_, AppState>, id: String) -> CommandResult<ReportIntent> {
    let id = valid_id(&id, "intent")?;
    let client = state.client().await?;
    let deleted = report_intents::delete(&client, id).await?;
    state.cache.with(|conn| cache::workspace::forget_intent(conn, id))?;
    Ok(deleted)
}

#[tauri::command]
pub(crate) async fn intent_submit(state: State<'_, AppState>, id: String) -> CommandResult<ReportIntent> {
    let id = valid_id(&id, "intent")?;
    let client = state.client().await?;
    let current = report_intents::get(&client, id).await?;
    if !current.can_submit() {
        return Err(CommandError::invalid("the intent is not ready to submit yet"));
    }
    let submitted = report_intents::submit(&client, id).await?;
    tracing::info!(intent_id = %id, "report intent submitted");
    let refreshed = report_intents::get(&client, id).await.unwrap_or(submitted);
    if let Some(report_id) = &refreshed.report_id
        && let Ok(report) = reports::get(&client, report_id).await
    {
        state.cache.with(|conn| cache::reports::store_detail(conn, &report))?;
    }
    Ok(refreshed)
}

#[tauri::command]
pub(crate) async fn intent_watch(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<ReportIntent> {
    let id = valid_id(&id, "intent")?;
    let client = state.client().await?;
    Ok(report_intents::wait_until_settled(&client, id, PollPolicy::default(), |intent| {
        let _ = app.emit(INTENT_UPDATED_EVENT, intent);
    })
    .await?)
}

#[tauri::command]
pub(crate) async fn intent_attachments(state: State<'_, AppState>, id: String) -> CommandResult<Vec<Attachment>> {
    let client = state.client().await?;
    Ok(report_intents::attachments(&client, valid_id(&id, "intent")?).await?)
}

#[tauri::command]
pub(crate) async fn intent_attachments_add(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> CommandResult<Vec<Attachment>> {
    let id = valid_id(&id, "intent")?;
    let client = state.client().await?;
    let picked = files::pick_files(&app).await?;
    for file in &picked {
        let upload = files::read_upload(&file.path, &file.file_name, &file.content_type).await?;
        report_intents::upload_attachments(&client, id, &[upload]).await?;
    }
    Ok(report_intents::attachments(&client, id).await?)
}

#[tauri::command]
pub(crate) async fn intent_attachment_delete(
    state: State<'_, AppState>,
    id: String,
    attachment_id: String,
) -> CommandResult<Vec<Attachment>> {
    let client = state.client().await?;
    Ok(report_intents::delete_attachment(&client, valid_id(&id, "intent")?, valid_id(&attachment_id, "attachment")?)
        .await?)
}
