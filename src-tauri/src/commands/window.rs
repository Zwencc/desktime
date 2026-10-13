use tauri::{AppHandle, Manager, WebviewWindow};

use crate::error::{BackendError, BackendResult};

#[tauri::command]
pub fn set_window_to_bottom(
    app: AppHandle,
    window: WebviewWindow,
    label: Option<String>,
) -> Result<(), String> {
    set_window_to_bottom_inner(app, window, label).map_err(|error| error.to_string())
}

fn set_window_to_bottom_inner(
    app: AppHandle,
    window: WebviewWindow,
    label: Option<String>,
) -> BackendResult<()> {
    let target = match label {
        Some(label) => app
            .get_webview_window(&label)
            .ok_or(BackendError::WindowNotFound(label))?,
        None => window,
    };

    crate::platform::set_window_to_bottom(&target)
}

/// Builds an app-driven window if the deferred pass has not reached it yet.
///
/// The frontend cannot use `Window.getByLabel` on its own for these any more:
/// for the first couple of seconds of a run the answer is null because the
/// window has not been built, not because the label is wrong. Callers ask for it
/// by name and get one either way.
///
/// **`async` is load-bearing.** A synchronous command runs on the main thread,
/// and `send_user_message` builds the window in place when it is called from
/// that thread — which means creating a WebView2 from inside the event loop
/// callback. wry then waits for `CreateCoreWebView2Controller` in a nested
/// message loop: native messages still pump, so the tray menu goes on working,
/// but Tauri's own event queue is stuck one level up and every webview's
/// `invoke` hangs with it. Off the main thread the same call goes through the
/// event loop proxy instead, which is the path that does not re-enter.
#[tauri::command]
pub async fn ensure_window(app: AppHandle, label: String) -> Result<(), String> {
    crate::startup::ensure_window(&app, &label)
        .map(|_| ())
        .ok_or_else(|| BackendError::WindowNotFound(label).to_string())
}

/// Rebuilds the tray menu in the language the frontend just switched to.
///
/// The tray is native and outside React, so nothing else would notice: without
/// this the menu keeps yesterday's language until the app is restarted.
#[tauri::command]
pub fn refresh_tray(app: AppHandle) -> Result<(), String> {
    crate::tray::rebuild(&app).map_err(|error| error.to_string())
}

/// Hands the resolved shortcut table to the backend, which owns registration.
/// Returns the ids the OS refused, which is the only way the settings page can
/// tell the user a key never took.
#[tauri::command]
pub fn sync_shortcuts(app: AppHandle, bindings: Vec<crate::shortcuts::ShortcutBinding>) -> Vec<String> {
    crate::shortcuts::sync(&app, bindings)
}

#[tauri::command]
pub fn set_window_visibility(
    app: AppHandle,
    window: WebviewWindow,
    label: Option<String>,
    visible: bool,
) -> Result<(), String> {
    let target = match label {
        Some(label) => app
            .get_webview_window(&label)
            .ok_or(BackendError::WindowNotFound(label)),
        None => Ok(window),
    };

    target
        .and_then(|target| crate::platform::set_window_visibility(&target, visible))
        .map_err(|error| error.to_string())
}
