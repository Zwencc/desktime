use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

use crate::error::{BackendError, BackendResult};

/// Writes note contents to a path the user picked through the native save dialog.
/// The dialog owns location selection; this command only performs the write.
#[tauri::command]
pub fn save_text_file(path: String, contents: String) -> Result<(), String> {
    save_text_file_inner(path, contents).map_err(|error| error.to_string())
}

fn save_text_file_inner(path: String, contents: String) -> BackendResult<()> {
    std::fs::write(PathBuf::from(path), contents)?;
    Ok(())
}

/// Reads a text file the user picked through the native open dialog.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    read_text_file_inner(path).map_err(|error| error.to_string())
}

fn read_text_file_inner(path: String) -> BackendResult<String> {
    Ok(std::fs::read_to_string(PathBuf::from(path))?)
}

/// Renames a mapped note on disk so the sidebar name and the file name stay in
/// step. Refuses to overwrite: clobbering an unrelated file is never what a
/// rename meant.
#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    rename_path_inner(from, to).map_err(|error| error.to_string())
}

fn rename_path_inner(from: String, to: String) -> BackendResult<()> {
    let target = PathBuf::from(&to);
    if target.exists() {
        return Err(BackendError::TargetExists(to));
    }

    std::fs::rename(PathBuf::from(from), target)?;
    Ok(())
}

/// Deletes through the recycle bin rather than unlinking, so a mistake here stays
/// recoverable from the shell.
#[tauri::command]
pub fn move_to_recycle_bin(path: String) -> Result<(), String> {
    trash::delete(PathBuf::from(path)).map_err(|error| error.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub exists: bool,
    /// Epoch milliseconds, or 0 when the platform will not report it.
    pub modified_at: i64,
    pub size: u64,
}

/// Reports whether a mapped file is still where the notebook thinks it is.
#[tauri::command]
pub fn file_stat(path: String) -> Result<FileStat, String> {
    let Ok(metadata) = std::fs::metadata(PathBuf::from(path)) else {
        return Ok(FileStat {
            exists: false,
            modified_at: 0,
            size: 0,
        });
    };

    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0);

    Ok(FileStat {
        exists: true,
        modified_at,
        size: metadata.len(),
    })
}

/// Opens a path in the file manager, optionally selecting it.
#[tauri::command]
pub fn open_in_explorer<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    select: bool,
) -> Result<(), String> {
    let result = if select {
        app.opener().reveal_item_in_dir(PathBuf::from(path))
    } else {
        app.opener().open_path(path, None::<&str>)
    };

    result.map_err(|error| error.to_string())
}

// —— Drafts ——
//
// Unsaved notes live as real files under the app data directory rather than in
// localStorage: pasted images are inline base64, which blows past the 5 MB quota
// in a handful of screenshots, and a real file also survives a crash.

#[tauri::command]
pub fn drafts_directory<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    drafts_dir(&app)
        .map(|dir| dir.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

/// Returns an empty string when the draft has no file yet, so a fresh note and
/// an emptied one read the same.
#[tauri::command]
pub fn draft_read<R: Runtime>(app: AppHandle<R>, id: String) -> Result<String, String> {
    draft_read_inner(&app, &id).map_err(|error| error.to_string())
}

fn draft_read_inner<R: Runtime>(app: &AppHandle<R>, id: &str) -> BackendResult<String> {
    match std::fs::read_to_string(draft_path(app, id)?) {
        Ok(contents) => Ok(contents),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error.into()),
    }
}

#[tauri::command]
pub fn draft_write<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    contents: String,
) -> Result<(), String> {
    draft_write_inner(&app, &id, contents).map_err(|error| error.to_string())
}

fn draft_write_inner<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    contents: String,
) -> BackendResult<()> {
    std::fs::write(draft_path(app, id)?, contents)?;
    Ok(())
}

/// Deleting a draft that was never written is not an error — the caller only
/// wants it gone.
#[tauri::command]
pub fn draft_delete<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    draft_delete_inner(&app, &id).map_err(|error| error.to_string())
}

fn draft_delete_inner<R: Runtime>(app: &AppHandle<R>, id: &str) -> BackendResult<()> {
    match std::fs::remove_file(draft_path(app, id)?) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn drafts_dir<R: Runtime>(app: &AppHandle<R>) -> BackendResult<PathBuf> {
    let dir = app.path().app_data_dir()?.join("drafts");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn draft_path<R: Runtime>(app: &AppHandle<R>, id: &str) -> BackendResult<PathBuf> {
    if !is_safe_draft_id(id) {
        return Err(BackendError::InvalidDraftId(id.to_owned()));
    }

    Ok(drafts_dir(app)?.join(format!("{id}.md")))
}

// Ids arrive from the frontend, so anything that is not a plain UUID-shaped
// token is rejected: a `..` or a separator here would let a draft write itself
// anywhere on disk.
fn is_safe_draft_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 72
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

#[cfg(test)]
mod tests {
    use super::is_safe_draft_id;

    #[test]
    fn accepts_uuid_shaped_ids() {
        assert!(is_safe_draft_id("2f1c9d0e-4b7a-4f21-9a55-0c3d8e6b1a24"));
        assert!(is_safe_draft_id("2f1c9d0e-4b7a-4f21-9a55-0c3d8e6b1a24-backup"));
    }

    #[test]
    fn rejects_path_traversal_and_separators() {
        assert!(!is_safe_draft_id(".."));
        assert!(!is_safe_draft_id("../../secrets"));
        assert!(!is_safe_draft_id("nested/id"));
        assert!(!is_safe_draft_id("nested\\id"));
        assert!(!is_safe_draft_id("with.dot"));
        assert!(!is_safe_draft_id(""));
    }
}
