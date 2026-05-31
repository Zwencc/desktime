use tauri::State;

use crate::config::{Config, ConfigEntry, ConfigSnapshot};

/// Everything the frontend needs to bring localStorage up to date, in one call.
///
/// Answered from memory: the file was read once at startup, so nine windows
/// starting at once cost nine map clones rather than nine disk reads.
#[tauri::command]
pub fn read_config(config: State<'_, Config>) -> Result<ConfigSnapshot, String> {
    config.snapshot().map_err(|error| error.to_string())
}

/// Applies a batch of changes and puts the file back on disk.
///
/// A batch rather than one call per key, because the frontend debounces: a
/// window drag writes its position on every frame and arrives here once.
///
/// **`async` so the flush does not land on the main thread.** Saving ends in a
/// `sync_all` — `FlushFileBuffers` on Windows — and a synchronous command runs
/// on the thread that pumps the event loop, so every window's drag was paying
/// for a forced disk flush in the middle of the frame. Off that thread the wait
/// costs nothing anybody can see. `Config::apply` serialises itself, which is
/// what makes concurrent writers safe now that there can be any.
#[tauri::command]
pub async fn write_config(
    config: State<'_, Config>,
    entries: Vec<ConfigEntry>,
) -> Result<(), String> {
    config.apply(entries).map_err(|error| error.to_string())
}
