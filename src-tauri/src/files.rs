use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

use crate::api::client::UploadFile;
use crate::error::{CommandError, CommandResult};

pub(crate) const MAX_ATTACHMENT_BYTES: u64 = 100 * 1024 * 1024;

pub(crate) struct PickedFile {
    pub path: PathBuf,
    pub file_name: String,
    pub size: u64,
    pub content_type: String,
}

pub(crate) fn content_type_for(path: &Path) -> &'static str {
    let extension = path.extension().and_then(|ext| ext.to_str()).map(str::to_ascii_lowercase).unwrap_or_default();
    match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "pdf" => "application/pdf",
        "json" | "har" => "application/json",
        "zip" => "application/zip",
        "txt" | "log" | "md" => "text/plain",
        "html" | "htm" => "text/html",
        _ => "application/octet-stream",
    }
}

/// The dialog runs on the main thread and reports back through a callback; bridging it to a
/// channel keeps async commands from blocking the runtime while the user picks.
pub(crate) async fn pick_files<R: Runtime>(app: &AppHandle<R>) -> CommandResult<Vec<PickedFile>> {
    let (sender, receiver) = oneshot::channel();
    app.dialog().file().set_title("Attach files").pick_files(move |files| {
        let _ = sender.send(files);
    });
    let picked =
        receiver.await.map_err(|_| CommandError::file("the file dialog closed unexpectedly"))?.unwrap_or_default();
    let mut files = Vec::with_capacity(picked.len());
    for entry in picked {
        let path =
            entry.into_path().map_err(|_| CommandError::file("that file cannot be attached from this location"))?;
        let metadata = tokio::fs::metadata(&path)
            .await
            .map_err(|error| CommandError::file(format!("could not read {}: {error}", path.display())))?;
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_owned)
            .ok_or_else(|| CommandError::file("file names must be valid UTF-8"))?;
        if metadata.len() > MAX_ATTACHMENT_BYTES {
            return Err(CommandError::file(format!("{file_name} is larger than 100 MB")));
        }
        files.push(PickedFile {
            content_type: content_type_for(&path).to_owned(),
            size: metadata.len(),
            file_name,
            path,
        });
    }
    Ok(files)
}

pub(crate) async fn read_upload(path: &Path, file_name: &str, content_type: &str) -> CommandResult<UploadFile> {
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|error| CommandError::file(format!("{file_name} could not be read: {error}")))?;
    Ok(UploadFile { file_name: file_name.to_owned(), content_type: content_type.to_owned(), bytes })
}

pub(crate) async fn save_text<R: Runtime>(
    app: &AppHandle<R>,
    default_name: &str,
    extension: &str,
    contents: String,
) -> CommandResult<bool> {
    let (sender, receiver) = oneshot::channel();
    app.dialog().file().set_file_name(default_name).add_filter(extension.to_uppercase(), &[extension]).save_file(
        move |path| {
            let _ = sender.send(path);
        },
    );
    let Some(target) = receiver.await.map_err(|_| CommandError::file("the save dialog closed unexpectedly"))? else {
        return Ok(false);
    };
    let path = target.into_path().map_err(|_| CommandError::file("that location cannot be written to"))?;
    tokio::fs::write(&path, contents)
        .await
        .map_err(|error| CommandError::file(format!("could not write {}: {error}", path.display())))?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn infers_content_types_case_insensitively() {
        assert_eq!(content_type_for(Path::new("poc.PNG")), "image/png");
        assert_eq!(content_type_for(Path::new("trace.har")), "application/json");
        assert_eq!(content_type_for(Path::new("binary")), "application/octet-stream");
    }
}
