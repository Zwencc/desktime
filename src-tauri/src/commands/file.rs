use std::path::PathBuf;

use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

use crate::error::{BackendError, BackendResult};

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
