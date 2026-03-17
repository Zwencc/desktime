use std::path::PathBuf;

use crate::error::BackendResult;

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
