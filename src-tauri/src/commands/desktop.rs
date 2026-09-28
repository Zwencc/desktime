use crate::desktop::{self, ShellEntry};

/// Everything on the desktop, with the shell's own icons. Called by the desktop
/// layer, which covers the real icons and has to put them back.
#[tauri::command]
pub fn desktop_entries() -> Vec<ShellEntry> {
    desktop::desktop_entries()
}

/// The launcher's index: desktop items plus Start Menu shortcuts, without icons.
/// Matching runs in the frontend — it is pure string work, and keeping it there
/// means typing never waits on IPC.
#[tauri::command]
pub fn launcher_index() -> Vec<ShellEntry> {
    desktop::launcher_index()
}

#[tauri::command]
pub fn launch_path(path: String) -> Result<(), String> {
    desktop::launch(&path).map_err(|error| error.to_string())
}
