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
